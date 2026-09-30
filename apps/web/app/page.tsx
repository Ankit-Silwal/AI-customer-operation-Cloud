'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import type { Organization, Conversation, DocumentMetadata } from '@relay/shared';
import { authClient } from '../lib/auth-client';
import { AuthScreen } from '../components/auth-screen';

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/organizations${path}`, {
    ...options,
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
const post = <T,>(path: string, data: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(data) });
const date = (value: number) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function Home() {
  const { data: session, isPending, error } = authClient.useSession();
  if (isPending) return <div className="loading-state">Loading your workspace…</div>;
  if (!session) return <AuthScreen initialError={error?.message} />;
  return <Workspace key={session.user.id} userName={session.user.name} />;
}

function Workspace({ userName }: { userName: string }) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState<'conversations' | 'documents' | 'organization'>('conversations');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);
  const organization = organizations.find((o) => o.id === organizationId);
  const conversation = conversations.find((c) => c.id === selected);
  const title = {
    conversations: 'Conversations',
    documents: 'Documents',
    organization: 'Organization',
  }[view];

  useEffect(() => {
    let mounted = true;
    api<Organization[]>('')
      .then((items) => {
        if (mounted) {
          setOrganizations(items);
          setOrganizationId(items[0]?.id || '');
        }
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    const version = ++requestVersion.current;
    setConversations([]);
    setDocuments([]);
    setSelected('');
    setMessage('');
    setSearch('');
    if (!organizationId) return;
    setLoading(true);
    Promise.all([
      api<Conversation[]>(`/${organizationId}/conversations`),
      api<DocumentMetadata[]>(`/${organizationId}/documents`),
    ])
      .then(([chats, docs]) => {
        if (version !== requestVersion.current) return;
        setConversations(chats);
        setDocuments(docs);
        setSelected(chats[0]?.id || '');
      })
      .catch((e) => {
        if (version === requestVersion.current) setError(e.message);
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false);
      });
    return () => {
      requestVersion.current++;
    };
  }, [organizationId]);
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [conversation?.messages.length, selected]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  function signOut() {
    void run(async () => {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message);
    });
  }
  function updateCount(field: 'conversationCount' | 'documentCount') {
    setOrganizations((items) =>
      items.map((o) => (o.id === organizationId ? { ...o, [field]: o[field] + 1 } : o)),
    );
  }
  function newConversation() {
    if (!organization) {
      dialog.current?.showModal();
      return;
    }
    run(async () => {
      const chat = await post<Conversation>(`/${organizationId}/conversations`, {});
      setConversations((items) => [chat, ...items]);
      setSelected(chat.id);
      setView('conversations');
      setSearch('');
      updateCount('conversationCount');
    });
  }
  function send(event?: FormEvent<HTMLFormElement> | KeyboardEvent<HTMLTextAreaElement>) {
    event?.preventDefault();
    if (!message.trim() || !conversation || busy) return;
    run(async () => {
      const chat = await post<Conversation>(
        `/${organizationId}/conversations/${selected}/messages`,
        { text: message },
      );
      setConversations((items) => items.map((c) => (c.id === chat.id ? chat : c)));
      setMessage('');
    });
  }
  function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    run(async () => {
      const item = await post<Organization>('', {
        name: data.get('name'),
        description: data.get('description'),
      });
      setOrganizations((items) => [...items, item]);
      setOrganizationId(item.id);
      setView('conversations');
      dialog.current?.close();
      form.reset();
      setNotice('Your workspace is ready. Start your first conversation.');
    });
  }
  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Choose a file smaller than 5 MB.');
      return;
    }
    run(async () => {
      const data = new FormData();
      data.append('file', file);
      const document = await api<DocumentMetadata>(`/${organizationId}/documents`, {
        method: 'POST',
        body: data,
      });
      setDocuments((items) => [...items, document]);
      updateCount('documentCount');
      setNotice('Document uploaded and stored.');
    });
  }

  return (
    <>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Relay home">
          <span className="brand-mark">
            r<span>•</span>
          </span>
          relay<span className="cloud">CLOUD</span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <button className="org-switch" onClick={() => setView('organization')}>
          <span className="avatar purple">{organization?.name.charAt(0) || '+'}</span>
          <span>
            <strong>{organization?.name || 'Your workspace'}</strong>
            <small>Starter workspace</small>
          </span>
          <span className="chevron">⌄</span>
        </button>
        <nav aria-label="Main navigation">
          {(
            [
              ['conversations', '◫', 'Conversations'],
              ['documents', '▤', 'Documents'],
              ['organization', '▦', 'Organization'],
            ] as const
          ).map(([key, icon, label]) => (
            <button
              aria-label={label}
              aria-current={view === key ? 'page' : undefined}
              className={`nav-item ${view === key ? 'active' : ''}`}
              key={key}
              onClick={() => setView(key)}
            >
              <span>{icon}</span>
              {label}
              {key === 'conversations' && <span className="badge">{conversations.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-card">
            <span className="spark">✧</span>
            <strong>Make room for better support.</strong>
            <p>One workspace for your documents and customer conversations.</p>
            <button
              onClick={() => (organization ? setView('documents') : dialog.current?.showModal())}
            >
              Add a document <span>↗</span>
            </button>
          </div>
          <div className="profile">
            <span className="avatar">WS</span>
            <span>
              <strong>{userName}</strong>
              <small>Workspace member</small>
            </span>
            <button
              className="signout-button"
              onClick={() =>
                run(async () => {
                  const result = await authClient.signOut();
                  if (result.error) throw new Error(result.error.message);
                })
              }
              disabled={busy}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <div className="shell">
        <header className="topbar">
          <span>
            Workspace <span className="breadcrumb">/</span>
            <strong>{title}</strong>
          </span>
          <div className="topbar-right">
            <button className="signout-button mobile-signout" onClick={signOut} disabled={busy}>
              Sign out
            </button>
            <span className="demo-pill">
              <span />
              Showcase mode
            </span>
            <span className="avatar tiny">WS</span>
          </div>
        </header>
        <main>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                ×
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR CUSTOMER OPERATIONS, CONNECTED</div>
              <h1>
                {view === 'conversations'
                  ? 'Good conversations start here.'
                  : view === 'documents'
                    ? 'Your documents, in one place.'
                    : 'Your workspace. Your people.'}
              </h1>
              <p>
                {view === 'conversations'
                  ? 'A shared space for your customers. A simpler way to stay connected.'
                  : view === 'documents'
                    ? 'Keep business information together, ready for what comes next.'
                    : 'A home for your organization’s documents and conversations.'}
              </p>
            </div>
            <button
              disabled={busy || loading}
              className="primary"
              onClick={
                view === 'conversations' ? newConversation : () => dialog.current?.showModal()
              }
            >
              <span>＋</span>
              {view === 'conversations' ? 'New conversation' : 'Create organization'}
            </button>
          </div>
          {loading ? (
            <div className="panel loading-state" role="status">
              Loading your workspace…
            </div>
          ) : !organization ? (
            <div className="panel onboarding">
              <span className="welcome-symbol">✧</span>
              <div className="eyebrow">A FRESH START</div>
              <h2>Every great conversation needs a home.</h2>
              <p>
                Create your first organization to bring your customer conversations
                <br className="desktop-break" /> and business documents together.
              </p>
              <button className="primary" onClick={() => dialog.current?.showModal()}>
                ＋ Create your organization
              </button>
              <div className="onboarding-steps">
                <span>
                  <b>01</b> Create a workspace
                </span>
                <span>
                  <b>02</b> Add your documents
                </span>
                <span>
                  <b>03</b> Start a conversation
                </span>
              </div>
            </div>
          ) : (
            <>
              {view === 'conversations' && (
                <>
                  <div className="stats">
                    <div>
                      <span className="stat-icon lavender">◫</span>
                      <div>
                        <small>Total conversations</small>
                        <strong>
                          {conversations.length}
                          <span>All time</span>
                        </strong>
                      </div>
                    </div>
                    <div>
                      <span className="stat-icon mint">▤</span>
                      <div>
                        <small>Documents uploaded</small>
                        <strong>
                          {documents.length}
                          <span>Stored locally</span>
                        </strong>
                      </div>
                    </div>
                    <div>
                      <span className="stat-icon peach">✧</span>
                      <div>
                        <small>Your workspace</small>
                        <strong className="status-value">
                          <i />
                          Ready to go<span>Demo</span>
                        </strong>
                      </div>
                    </div>
                  </div>
                  <section className="inbox">
                    <div className="conversation-list">
                      <div className="list-heading">
                        <h2>
                          Inbox <span>{conversations.length}</span>
                        </h2>
                        <span className="muted">☷</span>
                      </div>
                      <label className="search-box">
                        <span>⌕</span>
                        <input
                          aria-label="Search conversations"
                          placeholder="Search conversations…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <div className="list-tabs">
                        <span>All conversations</span>
                        <span>{conversations.length}</span>
                      </div>
                      <div id="conversation-items">
                        {conversations
                          .filter((c) =>
                            `${c.title} ${c.messages.map((m) => m.text).join(' ')}`
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                          )
                          .map((c) => (
                            <button
                              disabled={busy}
                              className={`conversation-item ${selected === c.id ? 'selected' : ''}`}
                              key={c.id}
                              onClick={() => {
                                setSelected(c.id);
                                setMessage('');
                              }}
                            >
                              <div className="conversation-top">
                                <span className="mini-icon">◫</span>
                                <small>{date(c.updated)}</small>
                              </div>
                              <strong>{c.title}</strong>
                              <p>{c.messages.at(-1)?.text || 'Ready when you are. Say hello.'}</p>
                              <span className="conversation-label">
                                ✧ Demo assistant <span>·</span> {c.messages.length} messages
                              </span>
                            </button>
                          ))}
                        {!conversations.length && (
                          <p className="empty-list">Your first conversation is a click away.</p>
                        )}
                        {conversations.length > 0 &&
                          !conversations.some((c) =>
                            `${c.title} ${c.messages.map((m) => m.text).join(' ')}`
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                          ) && <p className="empty-list">No conversations found.</p>}
                      </div>
                      <div className="list-bottom">
                        <span className="green-dot" />
                        Conversations saved on your server
                      </div>
                    </div>
                    <div className="chat-panel">
                      {conversation ? (
                        <>
                          <div className="chat-header">
                            <span className="avatar purple">{organization.name.charAt(0)}</span>
                            <div>
                              <h2>{conversation.title}</h2>
                              <small>
                                <span className="green-dot" />
                                {organization.name}
                              </small>
                            </div>
                            <span className="session-tag">Demo session</span>
                          </div>
                          <div className="messages">
                            <div className="day-label">
                              {date(conversation.updated)} <span>·</span> Your conversation
                            </div>
                            {conversation.messages.length ? (
                              conversation.messages.map((m) => (
                                <div key={m.id} className={`message ${m.role}`}>
                                  <span
                                    className={`avatar ${m.role === 'assistant' ? 'purple' : ''}`}
                                  >
                                    {m.role === 'assistant' ? '✧' : 'YO'}
                                  </span>
                                  <div className="message-content">
                                    <div className="message-author">
                                      {m.role === 'assistant' ? (
                                        <>
                                          Relay assistant <span>DEMO</span>
                                        </>
                                      ) : (
                                        'You'
                                      )}
                                    </div>
                                    <div className="message-bubble">{m.text}</div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="chat-welcome">
                                <span className="welcome-symbol">✧</span>
                                <h2>A fresh conversation.</h2>
                                <p>Send your first message to get things started.</p>
                                <div className="suggestions">
                                  <button
                                    onClick={() =>
                                      setMessage('Hello! I have a question about my order.')
                                    }
                                  >
                                    I have a question about my order ↗
                                  </button>
                                </div>
                              </div>
                            )}
                            {busy && (
                              <div className="typing" role="status">
                                Saving your message…
                              </div>
                            )}
                            <div ref={messagesEnd} />
                          </div>
                          <div className="composer-area">
                            <form className="composer" onSubmit={send}>
                              <textarea
                                aria-label="Message"
                                placeholder="Write your message…"
                                rows={2}
                                maxLength={2000}
                                value={message}
                                disabled={busy}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyDown={(e) => {
                                  if (
                                    e.key === 'Enter' &&
                                    !e.shiftKey &&
                                    !e.nativeEvent.isComposing
                                  )
                                    send(e);
                                }}
                              />
                              <div className="composer-bottom">
                                <span>
                                  ↵ <span>to send</span> <span className="composer-divider">·</span>{' '}
                                  Shift + Enter for a new line
                                </span>
                                <button
                                  className="send-button"
                                  type="submit"
                                  aria-label="Send message"
                                  disabled={busy || !message.trim()}
                                >
                                  ↑
                                </button>
                              </div>
                            </form>
                            <p className="disclaimer">
                              ✧ &nbsp; Fixed demo replies. No AI or document retrieval is connected.
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="chat-welcome">
                          <span className="welcome-symbol">✧</span>
                          <h2>Your next conversation starts here.</h2>
                          <p>A simple hello is all it takes.</p>
                          <button disabled={busy} className="primary" onClick={newConversation}>
                            ＋ New conversation
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
              {view === 'documents' && (
                <section className="knowledge-layout">
                  <div className="panel">
                    <div className="section-heading">
                      <h2>
                        Your documents <span className="badge">{documents.length}</span>
                      </h2>
                      <span className="subtle-tag">WORKSPACE LIBRARY</span>
                    </div>
                    <label className="upload-zone" htmlFor="file-upload">
                      <span className="upload-icon">↥</span>
                      <h3>{busy ? 'Uploading your document…' : 'Add a document'}</h3>
                      <p>Store a guide, policy, or anything your team needs.</p>
                      <span className="secondary">Browse files</span>
                      <small>PDF, TXT, MD, DOCX · Up to 5 MB</small>
                    </label>
                    <input
                      id="file-upload"
                      type="file"
                      accept=".pdf,.txt,.md,.docx"
                      className="file-input"
                      disabled={busy}
                      onChange={upload}
                    />
                    <div className="document-list">
                      {documents.map((d) => (
                        <div className="document-row" key={d.id}>
                          <span className="stat-icon lavender">▤</span>
                          <div>
                            <strong>{d.name}</strong>
                            <small>
                              {Math.max(1, Math.ceil(d.size / 1024))} KB <span>·</span>{' '}
                              {date(d.createdAt)} <span className="ready-text">Stored</span>
                            </small>
                          </div>
                        </div>
                      ))}
                      {!documents.length && (
                        <p className="empty-list">Your library is ready for its first document.</p>
                      )}
                    </div>
                  </div>
                  <div className="panel document-note">
                    <span className="welcome-symbol">▤</span>
                    <h2>A place for the essentials.</h2>
                    <p>
                      Bring your product guides, company policies, and support documents into your
                      organization’s workspace.
                    </p>
                    <div className="note-rule" />
                    <h3>Just storage, for now.</h3>
                    <p>
                      Files stay on your own server. They aren’t processed or used to generate
                      replies. We’ll build on this foundation as the platform grows.
                    </p>
                  </div>
                </section>
              )}
              {view === 'organization' && (
                <>
                  <div className="organization-grid">
                    {organizations.map((o) => (
                      <section className="panel org-card" key={o.id}>
                        <div className="org-card-top">
                          <span className="avatar purple">{o.name.charAt(0)}</span>
                          <span className="subtle-tag">
                            {o.id === organizationId ? 'ACTIVE WORKSPACE' : 'WORKSPACE'}
                          </span>
                        </div>
                        <h2>{o.name}</h2>
                        <p>{o.description || 'Your next great customer experience starts here.'}</p>
                        <div className="org-metrics">
                          <span>
                            <strong>{o.conversationCount}</strong> conversations
                          </span>
                          <span>
                            <strong>{o.documentCount}</strong> documents
                          </span>
                        </div>
                        <button
                          disabled={busy}
                          className={`${o.id === organizationId ? 'secondary' : 'primary'} wide`}
                          onClick={() => {
                            setOrganizationId(o.id);
                            setView('conversations');
                          }}
                        >
                          {o.id === organizationId ? 'Open conversations' : 'Switch workspace'}{' '}
                          <span>↗</span>
                        </button>
                      </section>
                    ))}
                  </div>
                  <div className="local-note">
                    ◈ &nbsp; Each organization has its own documents and conversations.
                  </div>
                </>
              )}
            </>
          )}
        </main>
        <footer>
          Built for better conversations.
          <span>
            Relay Cloud <span className="footer-dot">·</span> Starter edition
          </span>
        </footer>
      </div>
      <dialog ref={dialog}>
        <form onSubmit={createOrganization}>
          <div className="modal-heading">
            <span className="eyebrow">A NEW BEGINNING</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Close"
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
          </div>
          <h2>Create your workspace</h2>
          <p>Give your organization a home for every customer conversation.</p>
          <label htmlFor="organization-name">Organization name</label>
          <input
            id="organization-name"
            name="name"
            required
            maxLength={60}
            placeholder="e.g. Northstar Studio"
            autoFocus
          />
          <label htmlFor="organization-description">What does your organization do?</label>
          <textarea
            id="organization-description"
            name="description"
            maxLength={500}
            rows={3}
            placeholder="A little context about your business…"
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy} type="submit" className="primary wide">
            {busy ? 'Creating workspace…' : 'Create organization ↗'}
          </button>
        </form>
      </dialog>
      <div id="toast" role="status" className={notice ? 'visible' : ''}>
        {notice}
      </div>
    </>
  );
}
