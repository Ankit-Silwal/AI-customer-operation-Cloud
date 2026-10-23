import { DeveloperAccess, PasswordChange } from "./DeveloperAccess";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  api,
  post,
  type Conversation,
  type Document,
  type Organization,
  type Page,
  type ServiceStatus,
  type User,
} from "./api";
import { Auth } from "./Auth";
import {
  Brand,
  date,
  DemoLink,
  demoUrl,
  Empty,
  ErrorNotice,
  Modal,
  Spinner,
  useResource,
} from "./components";
import { Inbox } from "./Inbox";
import { Knowledge } from "./Knowledge";
import { Playground } from "./Playground";

const navigation = [
  { path: "/app", label: "Overview", icon: LayoutDashboard },
  { path: "/app/inbox", label: "Conversations", icon: MessageSquare },
  { path: "/app/knowledge", label: "Knowledge library", icon: BookOpen },
  { path: "/app/playground", label: "AI playground", icon: Sparkles },
  { path: "/app/settings", label: "Workspace", icon: Settings },
];
function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [user, setUser] = useState<User>();
  const [checking, setChecking] = useState(true);
  const [startupError, setStartupError] = useState<unknown>();
  const [path, setPath] = useState(window.location.pathname);
  const [menu, setMenu] = useState(false);
  const [organizationId, setOrganizationId] = useState(
    () => localStorage.getItem("hearth-workspace") ?? "",
  );
  const [newWorkspace, setNewWorkspace] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<unknown>();
  const organizations = useResource<Page<Organization>>(
    user ? "/organizations?pageSize=100" : null,
  );
  const status = useResource<ServiceStatus>(user ? "/service-status" : null);
  useEffect(() => {
    const onPath = () => {
      setPath(window.location.pathname);
      setMenu(false);
    };
    const expired = () => {
      setUser(undefined);
      navigate("/");
    };
    window.addEventListener("popstate", onPath);
    window.addEventListener("hearth-session-expired", expired);
    return () => {
      window.removeEventListener("popstate", onPath);
      window.removeEventListener("hearth-session-expired", expired);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<User>("/session", { signal: controller.signal })
      .then(setUser)
      .catch((error) => {
        if (!controller.signal.aborted && error.status !== 401)
          setStartupError(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (
      organizations.data &&
      !organizations.data.items.some((item) => item.id === organizationId)
    )
      setOrganizationId(organizations.data.items[0]?.id ?? "");
  }, [organizations.data, organizationId]);
  useEffect(() => {
    if (organizationId)
      localStorage.setItem("hearth-workspace", organizationId);
  }, [organizationId]);
  useEffect(() => {
    document.title = `${navigation.find((item) => item.path === path)?.label ?? "Welcome"} · Hearth`;
  }, [path]);
  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setCreating(true);
    setFormError(undefined);
    try {
      const saved = await post<Organization>("/organizations", {
        name: form.get("name"),
      });
      organizations.setData((current) => ({
        items: [saved, ...(current?.items ?? [])],
        total: (current?.total ?? 0) + 1,
        page: 1,
        pageSize: 100,
      }));
      setOrganizationId(saved.id);
      setNewWorkspace(false);
    } catch (error) {
      setFormError(error);
    } finally {
      setCreating(false);
    }
  }
  async function logout() {
    try {
      await post("/auth/logout", {});
      setUser(undefined);
      navigate("/");
    } catch (error) {
      setFormError(error);
    }
  }
  if (checking)
    return (
      <main className="boot-screen">
        <Brand />
        <Spinner />
        <p>Opening your workspace…</p>
      </main>
    );
  if (!user)
    return (
      <>
        <ErrorNotice
          error={startupError}
          clear={() => setStartupError(undefined)}
        />
        <Auth
          signedIn={(value) => {
            setUser(value);
            setStartupError(undefined);
            navigate("/app");
          }}
        />
      </>
    );
  const workspace = organizations.data?.items.find(
    (item) => item.id === organizationId,
  );
  const go = (next: string) => navigate(next);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {menu && (
        <button
          className="sidebar-scrim"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          className="brand-link"
          href="/app"
          onClick={(event) => {
            event.preventDefault();
            go("/app");
          }}
        >
          <Brand />
        </a>
        <div className="workspace-switch">
          <span className="workspace-symbol">
            {(workspace?.name ?? "W").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <small>WORKSPACE</small>
            <select
              aria-label="Select workspace"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              {!organizations.data?.items.length && (
                <option value="">Create a workspace</option>
              )}
              {organizations.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={14} />
        </div>
        <button
          className="new-workspace"
          onClick={() => {
            setFormError(undefined);
            setNewWorkspace(true);
          }}
        >
          <Plus size={15} /> New workspace
        </button>
        <span className="nav-caption">YOUR DAILY SPACE</span>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <a
              key={item.path}
              href={item.path}
              className={path === item.path ? "active" : ""}
              aria-current={path === item.path ? "page" : undefined}
              onClick={(event) => {
                if (!event.ctrlKey && !event.metaKey) {
                  event.preventDefault();
                  go(item.path);
                }
              }}
            >
              <item.icon size={19} />
              {item.label}
              {path === item.path && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-prompt">
            <span className="sunburst" aria-hidden="true">
              ✳
            </span>
            <h3>
              A little knowledge.
              <br />A lot of possibility.
            </h3>
            <p>See how your sources become helpful answers.</p>
            <button onClick={() => go("/app/playground")}>
              Try the playground <ArrowUpRight size={16} />
            </button>
          </div>
          <a
            className="sidebar-demo"
            href={demoUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} /> Demo company <ArrowUpRight size={14} />
          </a>
          <span className="sidebar-foot">
            Made for a more human connection.
          </span>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Workspace <span>/</span>{" "}
              <strong>
                {navigation.find((item) => item.path === path)?.label ?? "Page"}
              </strong>
            </span>
          </div>
          <div className="topbar-actions">
            <span className="connection">
              <i /> Connected workspace
            </span>
            <button
              className="icon-button"
              onClick={() => go("/app/settings")}
              aria-label="Workspace help"
            >
              <CircleHelp size={19} />
            </button>
            <span className="topbar-divider" />
            <span className="avatar" title={user.name}>
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <button
              className="icon-button"
              onClick={() => {
                void logout();
              }}
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <ErrorNotice error={organizations.error} />
          <ErrorNotice
            error={!newWorkspace && formError}
            clear={() => setFormError(undefined)}
          />
          {organizations.loading ? (
            <div className="loading">
              <Spinner />
              Loading your workspaces…
            </div>
          ) : !workspace ? (
            <div className="onboarding">
              <span className="eyebrow">A fresh start</span>
              <h1>
                Make room for
                <br />
                <em>better conversations.</em>
              </h1>
              <p>
                Create your first workspace to organize your company’s knowledge
                and customer conversations.
              </p>
              <button
                className="button primary"
                onClick={() => setNewWorkspace(true)}
              >
                <Plus size={17} /> Create your first workspace
              </button>
              <DemoLink />
            </div>
          ) : path === "/app" || path === "/" ? (
            <Overview
              user={user}
              workspace={workspace}
              go={go}
              status={status.data}
              statusError={status.error}
            />
          ) : path === "/app/inbox" ? (
            <Inbox key={workspace.id} organization={workspace} />
          ) : path === "/app/knowledge" ? (
            <Knowledge key={workspace.id} organization={workspace} />
          ) : path === "/app/playground" ? (
            <Playground
              key={workspace.id}
              organization={workspace}
              status={status.data}
            />
          ) : path === "/app/settings" ? (
            <section>
              <PageHeading
                label="The essentials"
                title="A place for your team."
                description="Your account, your workspace, and the connections behind it."
              />
              <div className="settings-grid">
                <DeveloperAccess key={workspace.id} organization={workspace} />
                <PasswordChange />
                <article className="panel">
                  <h2>Workspace details</h2>
                  <dl>
                    <dt>Workspace</dt>
                    <dd>{workspace.name}</dd>
                    <dt>Workspace ID</dt>
                    <dd className="mono">{workspace.id}</dd>
                    <dt>Created</dt>
                    <dd>{date(workspace.createdAt)}</dd>
                  </dl>
                  <button
                    className="button secondary"
                    onClick={() => setNewWorkspace(true)}
                  >
                    <Plus size={16} /> Create another workspace
                  </button>
                </article>
                <article className="panel">
                  <h2>Your account</h2>
                  <dl>
                    <dt>Name</dt>
                    <dd>{user.name}</dd>
                    <dt>Email</dt>
                    <dd>{user.email}</dd>
                  </dl>
                  <button
                    className="button secondary"
                    onClick={() => {
                      void logout();
                    }}
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </article>
                <article className="panel">
                  <h2>AI assistance</h2>
                  <span className={`badge ${status.data ? "sage" : "neutral"}`}>
                    {status.data
                      ? "Knowledge search available"
                      : "Checking connection"}
                  </span>
                  <p>
                    {status.data?.generationConfigured
                      ? "AI answers are connected. Ask a question in the playground and inspect the supporting sources."
                      : "Search works with your indexed documents. AI-written answers become available once the Gemini key is configured on the server."}
                  </p>
                  <button className="button secondary" onClick={status.refresh}>
                    Check connection
                  </button>
                  <ErrorNotice error={status.error} />
                </article>
                <article className="panel warm-panel">
                  <h2>Meet Oak & Ember</h2>
                  <p>
                    A fictional homewares company using Hearth for real policy
                    search and customer conversations. No purchases or payments
                    are taken.
                  </p>
                  <DemoLink />
                </article>
              </div>
            </section>
          ) : (
            <Empty
              title="That page wandered off."
              action={
                <button className="button primary" onClick={() => go("/app")}>
                  Back to overview
                </button>
              }
            >
              Your workspace is right where you left it.
            </Empty>
          )}
        </main>
        <footer className="app-footer">
          <span>Hearth · A little more human.</span>
          <span>Private by default. Grounded in your knowledge.</span>
        </footer>
      </div>
      {newWorkspace && (
        <Modal
          title="A new place to grow."
          subtitle="Give your workspace your company or team’s name."
          close={() => !creating && setNewWorkspace(false)}
        >
          <ErrorNotice error={formError} />
          <form onSubmit={createWorkspace}>
            <label>
              Workspace name
              <input
                name="name"
                placeholder="Your company name"
                maxLength={255}
                required
                autoFocus
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setNewWorkspace(false)}
                disabled={creating}
              >
                Cancel
              </button>
              <button className="button primary" disabled={creating}>
                {creating ? (
                  <Spinner />
                ) : (
                  <>
                    <Plus size={17} /> Create workspace
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
export function PageHeading({
  label,
  title,
  description,
  action,
}: {
  label: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{label}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Overview({
  user,
  workspace,
  go,
  status,
  statusError,
}: {
  user: User;
  workspace: Organization;
  go: (path: string) => void;
  status?: ServiceStatus;
  statusError: unknown;
}) {
  const conversations = useResource<Page<Conversation>>(
    `/conversation?organizationId=${workspace.id}&pageSize=5`,
  );
  const documents = useResource<Page<Document>>(
    `/documents?organizationId=${workspace.id}&pageSize=5`,
  );
  return (
    <>
      <PageHeading
        label={new Intl.DateTimeFormat("en", {
          weekday: "long",
          month: "long",
          day: "numeric",
        }).format(new Date())}
        title={`A good day to connect, ${user.name.split(" ")[0]}.`}
        description={`Here’s what’s happening in ${workspace.name}. A little clarity for the day ahead.`}
        action={
          <button
            className="button primary"
            onClick={() => go("/app/knowledge")}
          >
            <Plus size={17} /> Add knowledge
          </button>
        }
      />
      <ErrorNotice
        error={conversations.error || documents.error || statusError}
      />
      <div className="overview-stats">
        <article>
          <span className="stat-icon rust">
            <MessageSquare size={21} />
          </span>
          <div>
            <span>Conversations</span>
            <strong>
              {conversations.loading ? "—" : (conversations.data?.total ?? "—")}
            </strong>
            <small>Customer stories, in one place</small>
          </div>
        </article>
        <article>
          <span className="stat-icon sage">
            <BookOpen size={21} />
          </span>
          <div>
            <span>Knowledge sources</span>
            <strong>
              {documents.loading ? "—" : (documents.data?.total ?? "—")}
            </strong>
            <small>The foundation of helpful answers</small>
          </div>
        </article>
        <article>
          <span className="stat-icon gold">
            <Sparkles size={21} />
          </span>
          <div>
            <span>Your AI assistant</span>
            <strong className="stat-word">
              {status
                ? status.generationConfigured
                  ? "Connected"
                  : "Search ready"
                : "Checking"}
            </strong>
            <small>
              {status?.generationConfigured
                ? "Grounded in your company knowledge"
                : "Add your Gemini key for AI-written answers"}
            </small>
          </div>
        </article>
      </div>
      <section className="overview-feature">
        <div>
          <span className="eyebrow">Small steps. Better support.</span>
          <h2>
            Your knowledge is
            <br />
            your <em>superpower.</em>
          </h2>
          <p>
            Give your assistant the context it needs. Add a policy, upload a
            guide, and turn everyday questions into clear answers.
          </p>
          <button className="button dark" onClick={() => go("/app/playground")}>
            Meet your AI playground <ArrowRight size={17} />
          </button>
        </div>
        <div className="feature-illustration" aria-hidden="true">
          <span className="feature-sun">✳</span>
          <div className="floating-source">
            <BookOpen size={20} />
            <span>Company knowledge</span>
            <i />
          </div>
          <div className="floating-answer">
            <Sparkles size={18} />
            <span>
              A thoughtful answer.
              <br />
              <small>With the source to back it up.</small>
            </span>
          </div>
          <div className="feature-dots">· · · · · · · · · · · · · · · ·</div>
        </div>
      </section>
      <div className="overview-columns">
        <section className="panel">
          <div className="section-top">
            <div>
              <h2>Recent conversations</h2>
              <p>Every question is a chance to help.</p>
            </div>
            <button className="text-link" onClick={() => go("/app/inbox")}>
              View all <ArrowUpRight size={16} />
            </button>
          </div>
          {conversations.loading ? (
            <div className="loading">
              <Spinner />
            </div>
          ) : !conversations.data?.items.length ? (
            <Empty
              title="Your first hello is on its way."
              action={
                <button className="text-link" onClick={() => go("/app/inbox")}>
                  Start a conversation <ArrowRight size={16} />
                </button>
              }
            >
              Customer conversations will appear here. Start one to try the
              workflow.
            </Empty>
          ) : (
            <div className="recent-list">
              {conversations.data.items.map((item) => (
                <button key={item.id} onClick={() => go("/app/inbox")}>
                  <span className="list-avatar">
                    {item.customerEmail.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>{item.subject}</strong>
                    <small>{item.customerEmail}</small>
                  </span>
                  <time>{date(item.createdAt)}</time>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="section-top">
            <div>
              <h2>Make yourself at home</h2>
              <p>A few good places to start.</p>
            </div>
            <span className="small-sun" aria-hidden="true">
              ✳
            </span>
          </div>
          <div className="checklist">
            <button onClick={() => go("/app/settings")}>
              <span className="step-circle done">✓</span>
              <span>
                <strong>Create your workspace</strong>
                <small>A home for {workspace.name}.</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
            <button onClick={() => go("/app/knowledge")}>
              <span
                className={`step-circle ${documents.data?.total ? "done" : ""}`}
              >
                {documents.data?.total ? "✓" : "2"}
              </span>
              <span>
                <strong>Add your first knowledge source</strong>
                <small>Your policies, guides, and helpful details.</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
            <button onClick={() => go("/app/playground")}>
              <span className="step-circle">3</span>
              <span>
                <strong>Ask a real customer question</strong>
                <small>See the answer. Inspect the sources.</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="demo-callout">
            <span className="eyebrow">The customer’s side of the story</span>
            <h3>Take a look around Oak & Ember.</h3>
            <p>Try a working support assistant on our demo company website.</p>
            <DemoLink />
          </div>
        </section>
      </div>
    </>
  );
}
