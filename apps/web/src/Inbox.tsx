import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, MessageSquare, Plus, Search, Send } from "lucide-react";
import { post, type Conversation, type Organization, type Page } from "./api";
import {
  date,
  Empty,
  ErrorNotice,
  Modal,
  Pager,
  Spinner,
  useDebounced,
  useResource,
} from "./components";
import { PageHeading } from "./App";

export function Inbox({ organization }: { organization: Organization }) {
  const [search, setSearch] = useState("");
  const delayedSearch = useDebounced(search);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<unknown>();
  const list = useResource<Page<Conversation>>(
    `/conversation?organizationId=${organization.id}&page=${page}&pageSize=12&search=${encodeURIComponent(delayedSearch)}`,
  );
  const detail = useResource<Conversation>(
    selected ? `/conversation/${selected}` : null,
  );
  useEffect(() => {
    if (list.data && !selected) setSelected(list.data.items[0]?.id ?? "");
  }, [list.data, selected]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    try {
      const saved = await post<Conversation>("/conversation", {
        organizationId: organization.id,
        customerEmail: form.get("email"),
        subject: form.get("subject"),
        messages: form.get("message")
          ? [{ role: "user", content: form.get("message") }]
          : [],
      });
      setSelected(saved.id);
      setCreating(false);
      list.refresh();
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!detail.data || !reply.trim() || pending) return;
    setPending(true);
    setError(undefined);
    try {
      const updated = await post<Conversation>(
        `/conversation/${selected}/messages`,
        {
          expectedCount: detail.data.messages.length,
          messages: [{ role: "assistant", content: reply.trim() }],
        },
      );
      detail.setData(updated);
      setReply("");
      list.refresh();
    } catch (failure) {
      setError(failure);
      detail.refresh();
    } finally {
      setPending(false);
    }
  }
  return (
    <section>
      <PageHeading
        label="Every conversation matters"
        title="A little more connected."
        description="A clear view of your customer conversations. Pick one up right where it left off."
        action={
          <button
            className="button primary"
            onClick={() => {
              setError(undefined);
              setCreating(true);
            }}
          >
            <Plus size={17} /> New conversation
          </button>
        }
      />
      <ErrorNotice error={list.error} />
      <div className="inbox panel">
        <aside className="conversation-sidebar">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Search conversations"
              placeholder="Find a conversation…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <div className="inbox-list-caption">
            <span>All conversations</span>
            <span>{list.data?.total ?? "—"}</span>
          </div>
          <div className="conversation-list">
            {list.loading ? (
              <div className="loading">
                <Spinner />
              </div>
            ) : !list.data?.items.length ? (
              <Empty
                title={
                  search
                    ? "No matching conversations."
                    : "Your inbox has room to grow."
                }
              >
                Start a conversation or try the demo company’s assistant.
              </Empty>
            ) : (
              list.data.items.map((item) => (
                <button
                  key={item.id}
                  className={`conversation-item ${selected === item.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelected(item.id);
                    setReply("");
                    setError(undefined);
                  }}
                >
                  <span className="conversation-item-top">
                    <span className="list-avatar">
                      {item.customerEmail.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <strong>{item.customerEmail.split("@")[0]}</strong>
                      <time>{date(item.createdAt)}</time>
                    </span>
                  </span>
                  <strong>{item.subject}</strong>
                  <p>
                    {item.messages.at(-1)?.content ??
                      "A new conversation, ready for a reply."}
                  </p>
                  <span className="conversation-count">
                    <MessageSquare size={12} />
                    {item.messages.length} messages
                  </span>
                </button>
              ))
            )}
          </div>
          <Pager
            page={page}
            total={list.data?.total ?? 0}
            pageSize={12}
            change={setPage}
          />
        </aside>
        <div className="conversation-detail">
          {detail.loading ? (
            <div className="loading">
              <Spinner />
              Opening the conversation…
            </div>
          ) : detail.error ? (
            <ErrorNotice error={detail.error} />
          ) : !detail.data ? (
            <Empty title="A conversation starts with hello.">
              Choose a conversation to read and reply.
            </Empty>
          ) : (
            <>
              <div className="conversation-title">
                <div>
                  <span className="eyebrow">Customer conversation</span>
                  <h2>{detail.data.subject}</h2>
                  <span>{detail.data.customerEmail}</span>
                </div>
                <span className="badge neutral">
                  {date(detail.data.createdAt)}
                </span>
              </div>
              <div className="thread" aria-live="polite">
                {!detail.data.messages.length && (
                  <p className="thread-start">
                    The conversation is open. Send a first reply below.
                  </p>
                )}
                {detail.data.messages.map((message, index) => (
                  <div className={`message-row ${message.role}`} key={index}>
                    <span className="message-author">
                      {message.role === "user" ? "Customer" : "Your team"}
                    </span>
                    <div className="message-bubble">{message.content}</div>
                  </div>
                ))}
              </div>
              <div className="reply-area">
                <ErrorNotice error={error} />
                <form onSubmit={send}>
                  <label htmlFor="reply" className="sr-only">
                    Reply to the customer
                  </label>
                  <textarea
                    id="reply"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    maxLength={10000}
                    placeholder="Write a thoughtful reply…"
                    required
                    disabled={detail.data.messages.length >= 100}
                  />
                  <div>
                    <span>
                      {detail.data.messages.length >= 100
                        ? "This conversation reached its 100-message limit."
                        : "Replies are saved to this workspace."}
                    </span>
                    <button
                      className="button primary"
                      disabled={
                        pending ||
                        !reply.trim() ||
                        detail.data.messages.length >= 100
                      }
                    >
                      {pending ? (
                        <Spinner />
                      ) : (
                        <>
                          <Send size={16} /> Save reply
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
      {creating && (
        <Modal
          title="Start with a hello."
          subtitle="Create a conversation in this workspace."
          close={() => !pending && setCreating(false)}
        >
          <ErrorNotice error={error} />
          <form onSubmit={create}>
            <label>
              Customer email
              <input
                name="email"
                type="email"
                maxLength={254}
                required
                placeholder="customer@example.com"
                autoFocus
              />
            </label>
            <label>
              Subject
              <input
                name="subject"
                maxLength={255}
                required
                placeholder="How can we help?"
              />
            </label>
            <label>
              First customer message <span className="optional">optional</span>
              <textarea
                name="message"
                maxLength={10000}
                placeholder="Tell us a little about the question…"
              />
            </label>
            <div className="modal-actions">
              <button className="button primary" disabled={pending}>
                {pending ? (
                  <Spinner />
                ) : (
                  <>
                    Create conversation <ArrowUpRight size={17} />
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
