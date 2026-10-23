import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Code2,
  Copy,
  FileText,
  KeyRound,
  Menu,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type Source = { title: string; documentId: string; text: string };
type Topic =
  | "Overview"
  | "Quickstart"
  | "Authentication"
  | "Knowledge & documents"
  | "Chat & conversations"
  | "Email verification"
  | "API reference"
  | "Errors & limits";
const topics: Topic[] = [
  "Overview",
  "Quickstart",
  "Authentication",
  "Knowledge & documents",
  "Chat & conversations",
  "Email verification",
  "API reference",
  "Errors & limits",
];
const workspace =
  import.meta.env.VITE_WORKSPACE_URL ??
  `${location.protocol}//${location.hostname}:3030`;
const base =
  import.meta.env.VITE_API_PUBLIC_URL ??
  `${location.protocol}//${location.hostname}:3001/v1`;

async function request<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/demo${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "We could not reach the sandbox. Check your connection and try again.",
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `${data.error ?? "The request could not be completed"}${response.headers.get("retry-after") ? ` (retry in ${response.headers.get("retry-after")} seconds)` : ""}`,
    );
  return data as T;
}
function Code({ value, label = "Example" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="code-block">
      <div>
        <span>
          <Terminal size={14} />
          {label}
        </span>
        <button
          aria-label={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .then(() => {
                setCopied(true);
                setFailed(false);
                setTimeout(() => setCopied(false), 1800);
              })
              .catch(() => setFailed(true));
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre tabIndex={0} aria-label={`${label} code`}>
        <code>{value}</code>
      </pre>
      {failed && (
        <small role="alert">Select the example to copy it manually.</small>
      )}
    </div>
  );
}
function Playground() {
  const [tab, setTab] = useState("chat");
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("");
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    demoCode: string;
    expiresAt: string;
  }>();
  const [email, setEmail] = useState("alex@example.com");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  async function start() {
    setError("");
    try {
      await request("/session", {});
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void start();
  }, []);
  async function chat(event?: FormEvent, suggestion?: string) {
    event?.preventDefault();
    const value = (suggestion ?? question).trim();
    if (!value || busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<{
        answer: string;
        sources: Source[];
        mode: string;
      }>("/chat", {
        question: value,
        history: messages
          .slice(-10)
          .map((m) => ({ ...m, content: m.content.slice(0, 4000) })),
      });
      setMessages((current) => [
        ...current,
        { role: "user", content: value },
        { role: "assistant", content: result.answer },
      ]);
      setSources(result.sources);
      setMode(result.mode);
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function otp(event: FormEvent) {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      if (challenge) {
        await request("/otp/verify", {
          email,
          challengeId: challenge.challengeId,
          code,
        });
        setVerified(true);
      } else {
        setChallenge(await request("/otp", { email }));
        setCode("");
        setVerified(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="sandbox"
      id="playground"
      aria-label="Live API playground"
    >
      <div className="section-label">
        <Sparkles size={15} /> YOUR FIRST REQUEST, RIGHT HERE
      </div>
      <div className="sandbox-title">
        <div>
          <h2>
            A little less reading.
            <br />
            <em>A little more trying.</em>
          </h2>
          <p>Explore a real response before you write a line of code.</p>
        </div>
        <span className="free-badge">Free sandbox · No key needed</span>
      </div>
      <div className="playground-shell">
        <div className="playground-bar">
          <div role="tablist" aria-label="Sandbox demo">
            <button
              role="tab"
              aria-selected={tab === "chat"}
              onClick={() => {
                setTab("chat");
                setError("");
              }}
            >
              <MessageCircle size={16} /> Knowledge chat
            </button>
            <button
              role="tab"
              aria-selected={tab === "otp"}
              onClick={() => {
                setTab("otp");
                setError("");
              }}
            >
              <ShieldCheck size={16} /> Email OTP
            </button>
          </div>
          <span className="sandbox-label">
            <i /> SANDBOX
          </span>
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}{" "}
            {!ready && <button onClick={() => void start()}>Reconnect</button>}
          </div>
        )}
        {tab === "chat" ? (
          <div className="chat-layout">
            <div className="chat-context">
              <span className="tiny-label">
                THE KNOWLEDGE BEHIND THE ANSWER
              </span>
              <div className="context-icon">
                <FileText size={25} />
              </div>
              <h3>Northstar Gear</h3>
              <p>
                A fictional outdoor shop. Its handbook covers returns, shipping,
                damaged items, and product care.
              </p>
              <div className="context-meta">
                <span>
                  <CheckCheck size={15} /> Local BAAI embeddings
                </span>
                <span>
                  <CheckCheck size={15} /> Qdrant knowledge search
                </span>
                <span>
                  <CheckCheck size={15} /> Sources with every match
                </span>
              </div>
              <p className="muted small">
                This shared sandbox contains sample policies. Upload your own
                documents in your workspace.
              </p>
            </div>
            <div className="chat-panel">
              <div
                className="messages"
                tabIndex={0}
                role="log"
                aria-label="Sandbox conversation"
                aria-live="polite"
              >
                {!messages.length ? (
                  <div className="chat-welcome">
                    <span className="spark-circle">
                      <Sparkles size={23} />
                    </span>
                    <h3>Ask the handbook.</h3>
                    <p>
                      Start with a policy question, then keep the conversation
                      going.
                    </p>
                    <button
                      onClick={() =>
                        void chat(undefined, "What is your return policy?")
                      }
                      disabled={busy || !ready}
                    >
                      What is your return policy? <ArrowUpRight size={14} />
                    </button>
                    <button
                      onClick={() =>
                        void chat(undefined, "How much does shipping cost?")
                      }
                      disabled={busy || !ready}
                    >
                      How much does shipping cost? <ArrowUpRight size={14} />
                    </button>
                  </div>
                ) : (
                  messages.map((message, index) => (
                    <article key={index} className={`message ${message.role}`}>
                      <span>{message.role === "user" ? "YOU" : "HEARTH"}</span>
                      <p>{message.content}</p>
                    </article>
                  ))
                )}
                {busy && (
                  <p className="thinking" role="status">
                    Finding a little clarity…
                  </p>
                )}
              </div>
              {sources.length > 0 && (
                <details className="sources">
                  <summary>
                    {sources.length} supporting{" "}
                    {sources.length === 1 ? "source" : "sources"} ·{" "}
                    {mode === "generation" ? "AI answer" : "Retrieved passage"}
                  </summary>
                  {sources.map((source, index) => (
                    <div key={index}>
                      <strong>{source.title}</strong>
                      <p>{source.text}</p>
                    </div>
                  ))}
                </details>
              )}
              <form onSubmit={(e) => void chat(e)} className="chat-form">
                <input
                  aria-label="Ask a sandbox question"
                  placeholder="Ask a question, or a follow-up…"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  maxLength={2000}
                  required
                  disabled={busy || !ready}
                />
                <button
                  aria-label="Send sandbox question"
                  disabled={busy || !ready || !question.trim()}
                >
                  <Send size={18} />
                </button>
              </form>
              <div className="chat-bottom">
                <span>
                  Sample knowledge. Real retrieval. Follow-ups welcome.
                </span>
                <button
                  disabled={busy}
                  onClick={() => {
                    setMessages([]);
                    setSources([]);
                    setError("");
                  }}
                >
                  New chat
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="otp-layout">
            <div>
              <span className="tiny-label">
                TRUST STARTS WITH A SMALL CHECK
              </span>
              <h3>
                One code.
                <br />A little more confidence.
              </h3>
              <p>
                Try creating and verifying a one-time code. Here, the code is
                shown on screen and no email is sent.
              </p>
              <p>
                In your integration, our service emails the code through SMTP.
                Your backend verifies it using an API key.
              </p>
              <div className="notice">
                Five-minute expiry. Five attempts. One successful use.
              </div>
            </div>
            <form onSubmit={(e) => void otp(e)} className="otp-form">
              <label>
                Email address
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={254}
                  disabled={Boolean(challenge) || busy}
                />
              </label>
              {challenge && !verified && (
                <>
                  <div className="demo-code">
                    <span>DEMO CODE · NO EMAIL SENT</span>
                    <strong>{challenge.demoCode}</strong>
                    <small>
                      Expires at{" "}
                      {new Date(challenge.expiresAt).toLocaleTimeString()}
                    </small>
                  </div>
                  <label>
                    Verification code
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                      required
                      placeholder="6-digit code"
                    />
                  </label>
                </>
              )}
              {verified ? (
                <div className="verified" role="status">
                  <ShieldCheck size={25} />
                  <strong>Email verified.</strong>
                  <span>This code has been consumed and cannot be reused.</span>
                </div>
              ) : (
                <button className="primary" disabled={busy || !ready}>
                  {busy
                    ? "Working…"
                    : challenge
                      ? "Verify code"
                      : "Generate demo code"}
                  <ArrowRight size={16} />
                </button>
              )}
              {challenge && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setChallenge(undefined);
                    setCode("");
                    setVerified(false);
                    setError("");
                  }}
                >
                  Start again
                </button>
              )}
            </form>
          </div>
        )}
      </div>
      <p className="sandbox-footnote">
        No payment, no signup, and no API key for this page. External
        applications need a free workspace key. Requests are rate limited.
      </p>
    </section>
  );
}
const endpoints = [
  [
    "POST",
    "/chat",
    "chat:write",
    "Ask your indexed knowledge",
    '{"question":"What is your return policy?","history":[],"topK":3}',
    '{"answer":"…","sources":[…],"mode":"generation"}',
  ],
  [
    "GET",
    "/documents",
    "documents:read",
    "List documents",
    "?page=1&pageSize=20",
    '{"items":[…],"total":1,"page":1,"pageSize":20}',
  ],
  [
    "POST",
    "/documents",
    "documents:write",
    "Create a text source",
    '{"title":"Returns","content":"Returns are accepted within 30 days."}',
    '{"id":"UUID","title":"Returns",…}',
  ],
  [
    "POST",
    "/documents/upload",
    "documents:write",
    "Upload a PDF, .txt or .md file",
    "multipart/form-data: title=Handbook, file=@handbook.pdf (max 1 MiB)",
    '{"id":"UUID",…}',
  ],
  [
    "GET",
    "/documents/{id}",
    "documents:read",
    "Read a source",
    "",
    '{"id":"UUID","content":"…",…}',
  ],
  [
    "POST",
    "/documents/{id}/index",
    "documents:write",
    "Embed and index a source",
    "{}",
    '{"documentId":"UUID",…}',
  ],
  [
    "GET",
    "/documents/{id}/download",
    "documents:read",
    "Download the original upload",
    "",
    "Binary file with Content-Disposition",
  ],
  [
    "DELETE",
    "/documents/{id}",
    "documents:write",
    "Delete a source and its vectors",
    "",
    "Deletion acknowledgement",
  ],
  [
    "GET",
    "/conversations",
    "chat:write",
    "List saved conversations",
    "?page=1&pageSize=20",
    '{"items":[…],"total":1,…}',
  ],
  [
    "POST",
    "/conversations",
    "chat:write",
    "Save a conversation",
    '{"customerEmail":"alex@example.com","subject":"Returns","messages":[{"role":"user","content":"Can I return this?"}]}',
    '{"id":"UUID","messages":[…],…}',
  ],
  [
    "GET",
    "/conversations/{id}",
    "chat:write",
    "Read a conversation",
    "",
    '{"id":"UUID","messages":[…],…}',
  ],
  [
    "POST",
    "/conversations/{id}/messages",
    "chat:write",
    "Append messages safely",
    '{"expectedCount":1,"messages":[{"role":"assistant","content":"Returns are accepted within 30 days."}]}',
    "Updated conversation; 409 if expectedCount is stale",
  ],
  [
    "POST",
    "/otp/challenges",
    "otp:write",
    "Email a one-time code",
    '{"email":"alex@example.com","purpose":"sign-in"}',
    '{"challengeId":"UUID","expiresIn":300,"expiresAt":"…","delivery":"email"}',
  ],
  [
    "POST",
    "/otp/verify",
    "otp:write",
    "Verify and consume a code",
    '{"email":"alex@example.com","purpose":"sign-in","challengeId":"UUID","code":"123456"}',
    '{"verified":true}',
  ],
];
function Guide({ topic }: { topic: Topic }) {
  const [language, setLanguage] = useState("JavaScript");
  const samples: Record<string, string> = {
    JavaScript: `// Run on your server. Keep the key out of browser bundles.\nconst response = await fetch("${base}/chat", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.HEARTH_API_KEY}\`,\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    question: "What is your return policy?",\n    history: []\n  })\n});\nif (!response.ok) throw new Error(await response.text());\nconst { answer, sources } = await response.json();`,
    Python: `import os, requests\n\nresponse = requests.post(\n    "${base}/chat",\n    headers={"Authorization": f"Bearer {os.environ['HEARTH_API_KEY']}"},\n    json={"question": "What is your return policy?", "history": []},\n    timeout=65,\n)\nresponse.raise_for_status()\nprint(response.json()["answer"])`,
    cURL: `curl "${base}/chat" \\\n  -H "Authorization: Bearer $HEARTH_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"question":"What is your return policy?","history":[]}'`,
  };
  if (topic === "API reference")
    return (
      <>
        <span className="section-label">THE DETAILS</span>
        <h1>
          API reference<span>.</span>
        </h1>
        <p className="lead">
          A small set of endpoints for knowledge, conversations, and trust.
        </p>
        <div className="notice">
          Base URL: <code>{base}</code>
          <br />
          Every request requires a server-side Bearer API key. Workspace
          identity comes from that key.
        </div>
        <a className="secondary" href="/openapi.json" download>
          Download OpenAPI specification <ArrowDown size={15} />
        </a>
        <div className="endpoint-list">
          {endpoints.map(([method, path, scope, title, input, output]) => (
            <details key={`${method}${path}`}>
              <summary>
                <span className={`method ${method?.toLowerCase()}`}>
                  {method}
                </span>
                <code>{path}</code>
                <ChevronRight size={15} />
              </summary>
              <div className="endpoint-body">
                <h3>{title}</h3>
                <span className="scope">{scope}</span>
                {input && <Code value={input} label="Request" />}
                <Code value={output!} label="Response shape" />
                <p className="small muted">
                  Response shapes are abbreviated for readability. Errors return
                  JSON with error and requestId.
                </p>
              </div>
            </details>
          ))}
        </div>
      </>
    );
  return (
    <>
      <span className="section-label">
        {topic === "Overview"
          ? "HEARTH FOR DEVELOPERS"
          : "BUILD SOMETHING THOUGHTFUL"}
      </span>
      <h1>
        {topic === "Overview" ? (
          <>
            Good support.
            <br />
            Built into <em>your world</em>
          </>
        ) : (
          topic
        )}
        <span>.</span>
      </h1>
      <p className="lead">
        {topic === "Overview"
          ? "Your knowledge. Your experience. Our API connects the two — with grounded answers, organized conversations, and a human touch."
          : topic === "Quickstart"
            ? "From a company handbook to your first useful answer in three steps."
            : topic === "Authentication"
              ? "A key to your workspace. Just the permissions you need."
              : topic === "Email verification"
                ? "Send and verify email OTPs from your own application."
                : topic === "Knowledge & documents"
                  ? "Give every answer a reliable place to start."
                  : topic === "Chat & conversations"
                    ? "Keep the conversation going, one grounded answer at a time."
                    : "Clear errors and predictable boundaries make better integrations."}
      </p>
      {topic === "Overview" && (
        <>
          <div className="hero-actions">
            <a className="primary" href="#playground">
              Try the playground <ArrowDown size={17} />
            </a>
            <a className="secondary" href={`${workspace}/app/settings`}>
              Get a free API key <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="capabilities">
            {[
              [
                MessageCircle,
                "Answers with context",
                "Turn your company knowledge into a helpful conversation.",
              ],
              [
                FileText,
                "Knowledge that connects",
                "Index policies and guides, then show the sources behind an answer.",
              ],
              [
                ShieldCheck,
                "A little more trust",
                "Send email verification codes from your own application.",
              ],
            ].map(([Icon, title, description], index) => {
              const Symbol = Icon as typeof MessageCircle;
              return (
                <article key={index}>
                  <Symbol size={21} />
                  <h3>{String(title)}</h3>
                  <p>{String(description)}</p>
                </article>
              );
            })}
          </div>
        </>
      )}
      {["Overview", "Quickstart"].includes(topic) && (
        <>
          <div className="guide-heading">
            <h2>A thoughtful start.</h2>
            <span>THREE SMALL STEPS</span>
          </div>
          <div className="steps">
            {[
              [
                "01",
                "Create a workspace & key",
                "Sign in to Hearth, create a workspace, then open Settings → Developer API. Choose scopes and copy your free key once.",
              ],
              [
                "02",
                "Add your company knowledge",
                "Create or upload a document, then call /documents/{id}/index. Embeddings run locally with BAAI and are stored in Qdrant.",
              ],
              [
                "03",
                "Make room for a conversation",
                "Call /chat from your backend. Show the answer and its sources, then pass recent turns in history for follow-ups.",
              ],
            ].map(([n, title, text]) => (
              <article key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="sample-header">
            <h3>Your first conversation</h3>
            <div role="group" aria-label="Code language">
              {Object.keys(samples).map((name) => (
                <button
                  aria-pressed={language === name}
                  className={language === name ? "selected" : ""}
                  key={name}
                  onClick={() => setLanguage(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <Code value={samples[language]!} label={language} />
          <p className="small muted">
            Create and index a source first. The chat response includes a mode:
            generation when Gemini is configured, retrieval otherwise.
          </p>
        </>
      )}
      {topic === "Authentication" && (
        <div className="prose">
          <h2>Free to start. Scoped to your workspace.</h2>
          <p>
            Open workspace Settings and create an API key. No payment is
            required for now. The full key appears once: store it in your
            backend environment and send it as a Bearer credential.
          </p>
          <Code
            value="HEARTH_API_KEY=hrt_live_your_key_here"
            label="Server .env"
          />
          <p>
            Choose chat:write, documents:read, documents:write, or otp:write.
            Keys expire after 90 days; each workspace supports five active keys.
            Revoke a key in Settings whenever it is no longer needed. Its next
            request will be rejected.
          </p>
          <div className="notice">
            Never put a key in a frontend variable such as VITE_HEARTH_API_KEY.
            Your backend should call Hearth and enforce its own customer
            authentication.
          </div>
          <h2>A separate company demo</h2>
          <p>
            The Oak & Ember demo reads HEARTH_API_KEY from
            apps/company-demo/.env. Give the key chat:write, documents:read and
            documents:write so it can seed its fictional handbook and save
            conversations. Restart the server after changing the file. The demo
            adds sample knowledge to the key's workspace.
          </p>
          <p>
            Account password changes revoke sign-in sessions. API keys have
            their own lifecycle and must be revoked separately.
          </p>
        </div>
      )}
      {topic === "Knowledge & documents" && (
        <div className="prose">
          <h2>Write it. Index it. Ask it.</h2>
          <p>
            Create a text source, or upload a PDF, Markdown or text file up to 1
            MiB. Uploading stores a document; indexing makes it searchable.
          </p>
          <Code
            value={`curl "${base}/documents" \\\n  -H "Authorization: Bearer $HEARTH_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"title":"Returns","content":"Unused items can be returned within 30 days."}'`}
            label="Create a source"
          />
          <Code
            value={`curl -X POST "${base}/documents/DOCUMENT_ID/index" \\\n  -H "Authorization: Bearer $HEARTH_API_KEY" \\\n  -H "Content-Type: application/json" -d '{}'`}
            label="Index a source"
          />
          <p>
            Local BAAI/bge-small-en-v1.5 creates embeddings; Qdrant stores the
            vectors. Gemini generates text using relevant excerpts. Document
            contents are knowledge, never instructions that override the system
            prompt.
          </p>
          <h2>Keep knowledge current</h2>
          <p>
            Delete obsolete sources with DELETE /documents/{"{id}"}. Deletion
            removes indexed vectors and the stored source. If vector removal
            fails, the document is retained so you can retry.
          </p>
          <p>
            All documents belong to the workspace selected by your key. Access
            to another workspace's source returns 404.
          </p>
        </div>
      )}
      {topic === "Chat & conversations" && (
        <div className="prose">
          <h2>One response. A continuing conversation.</h2>
          <p>
            POST /chat returns one answer, its sources and a mode. For
            follow-ups, send up to five complete user/assistant turns in
            history, oldest first. Each message is limited to 4,000 characters.
            Only user and assistant roles are accepted.
          </p>
          <Code
            value={JSON.stringify(
              {
                question: "Who pays the return postage?",
                history: [
                  { role: "user", content: "Can I return an unused item?" },
                  {
                    role: "assistant",
                    content: "Unused items can be returned within 30 days.",
                  },
                ],
              },
              null,
              2,
            )}
            label="Follow-up request"
          />
          <p>
            Chat requests do not save history automatically. Store it in your
            app, or use /conversations and /conversations/{"{id}"}/messages.
            Supply expectedCount when appending messages to detect concurrent
            writes (409). Conversation messages have a separate storage limit of
            10,000 characters; trim them to 4,000 before using chat history.
          </p>
          <div className="notice">
            Authenticate your own end users before serving saved conversations.
            A Hearth API key grants your backend access to its entire workspace;
            it does not identify individual customers.
          </div>
          <p>
            When no Gemini key is configured, chat returns one clearly labeled
            retrieved passage. When no matching knowledge exists, it says so.
            Display sources and allow your customers to reach a person.
          </p>
        </div>
      )}
      {topic === "Email verification" && (
        <div className="prose">
          <h2>Our service sends the email.</h2>
          <p>
            Your backend requests a code with the recipient and an
            application-specific purpose. Our service sends a six-digit OTP
            through Nodemailer using the operator's SMTP configuration.
          </p>
          <Code
            value={`const challenge = await fetch("${base}/otp/challenges", {\n  method: "POST",\n  headers: { Authorization: \`Bearer \${process.env.HEARTH_API_KEY}\`,\n             "Content-Type": "application/json" },\n  body: JSON.stringify({ email: "alex@example.com", purpose: "sign-in" })\n}).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });\n// Keep challenge.challengeId for the verification request.\n// The response never contains the real email code.`}
            label="Send a code"
          />
          <Code
            value={JSON.stringify(
              {
                email: "alex@example.com",
                purpose: "sign-in",
                challengeId: "UUID_FROM_CHALLENGE",
                code: "123456",
              },
              null,
              2,
            )}
            label="POST /otp/verify"
          />
          <p>
            Codes expire in five minutes, allow five incorrect attempts, and are
            consumed atomically on successful verification. A replacement code
            invalidates the previous one for the same workspace, recipient and
            purpose. Use the same email and purpose when verifying.
          </p>
          <h2>After verification</h2>
          <p>
            A successful response is {"{ verified: true }"}. Your backend must
            then complete the action it authorized, such as creating a session.
            Verify on your server; never accept a browser's claim that
            verification passed.
          </p>
          <div className="notice">
            The on-page sandbox displays a demo code and sends no email. Real
            API delivery requires SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and
            SMTP_FROM. Missing settings return 503. Never expose the SMTP
            password to customers.
          </div>
          <h2>Account recovery</h2>
          <p>
            Hearth's sign-in screen includes Forgot password. Signed-in users
            can change their password in Settings after an email OTP. Completing
            either flow invalidates earlier sign-in sessions.
          </p>
        </div>
      )}
      {topic === "Errors & limits" && (
        <div className="prose">
          <h2>Handle the next step with care.</h2>
          <Code
            value={
              '{\n  "error": "Too many requests",\n  "requestId": "a-correlation-id"\n}'
            }
            label="Error response"
          />
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>What to do</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  400,
                  "Correct the input, or request a new expired/consumed OTP.",
                ],
                [401, "Check the key, its expiry, or whether it was revoked."],
                [403, "Create a key with the required scope."],
                [404, "Check the resource ID and workspace."],
                [
                  409,
                  "Refresh the conversation count, or revoke a key before creating a sixth.",
                ],
                [413, "Reduce the file or request body size."],
                [429, "Wait for Retry-After before sending another request."],
                [
                  503,
                  "Retry reads after backoff; SMTP or another dependency may be unavailable.",
                ],
              ].map(([code, text]) => (
                <tr key={code}>
                  <td>
                    <code>{code}</code>
                  </td>
                  <td>{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Default API budgets are 60 requests per minute per key and 100 per
            minute per workspace. Chat has a separate 20-per-minute workspace
            budget and additional RAG daily budgets. OTP issuance is limited to
            3 per recipient per 15 minutes, 10 per scope per minute, and 30
            globally per minute. Platform-wide and IP limits also apply. Limits
            can be configured by the operator.
          </p>
          <p>
            RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset and
            Retry-After describe the limiting layer that answered. Never
            automatically retry OTP sends, document creation or other writes
            without considering duplicate side effects. Request IDs help the
            operator trace failures without disclosing credentials.
          </p>
          <div className="notice">
            The API is free for now. Usage limits still apply. Gemini generation
            and SMTP infrastructure are configured and funded by the service
            operator.
          </div>
        </div>
      )}
    </>
  );
}
export function App() {
  const fromHash = () =>
    topics.find(
      (t) =>
        t.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") ===
        location.hash.slice(1),
    ) ?? "Overview";
  const [topic, setTopic] = useState<Topic>(fromHash);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const listener = () => {
      if (location.hash !== "#playground") setTopic(fromHash());
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  const filtered = topics.filter((t) =>
    t.toLowerCase().includes(query.toLowerCase()),
  );
  function navigate(value: Topic) {
    setTopic(value);
    location.hash = value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
    setMenu(false);
    window.scrollTo({ top: 0 });
  }
  return (
    <>
      <header className="topbar">
        <a
          href="#overview"
          className="brand"
          onClick={() => navigate("Overview")}
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          hearth<span className="brand-dot">.</span>
          <span className="brand-divider" />{" "}
          <span className="developer-word">developers</span>
        </a>
        <nav aria-label="Top navigation">
          <a href="#quickstart" onClick={() => navigate("Quickstart")}>
            Documentation
          </a>
          <a href="#playground">Playground</a>
          <a href={`${workspace}/app/settings`} className="header-cta">
            Get a free API key <ArrowUpRight size={15} />
          </a>
        </nav>
        <button
          className="mobile-menu"
          aria-label={menu ? "Close navigation" : "Open navigation"}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <div className="docs-layout">
        <aside className={`sidebar ${menu ? "open" : ""}`}>
          <label className="search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a guide…"
              aria-label="Search documentation"
            />
          </label>
          <span className="nav-label">START BUILDING</span>
          <nav aria-label="Documentation">
            {filtered.map((item, index) => (
              <button
                key={item}
                className={topic === item ? "active" : ""}
                aria-current={topic === item ? "page" : undefined}
                onClick={() => navigate(item)}
              >
                {index === 0 ? (
                  <BookOpen size={16} />
                ) : item === "API reference" ? (
                  <Code2 size={16} />
                ) : item === "Authentication" ? (
                  <KeyRound size={16} />
                ) : (
                  <ChevronRight size={15} />
                )}{" "}
                {item}
              </button>
            ))}
            {!filtered.length && (
              <p className="small muted">
                No guide matches. Try “chat” or “email”.
              </p>
            )}
          </nav>
          <div className="sidebar-note">
            <span className="mini-spark">
              <Sparkles size={18} />
            </span>
            <h3>A good place to begin.</h3>
            <p>
              Try chat and email verification in your browser. No setup
              required.
            </p>
            <a
              href="#playground"
              onClick={() => {
                setTopic("Overview");
                setMenu(false);
              }}
            >
              Open the playground <ArrowRight size={15} />
            </a>
          </div>
          <div className="version">
            <i /> API v1 <span>Free for now</span>
          </div>
        </aside>
        <main className="content">
          <div className="breadcrumb">
            Developers <ChevronRight size={13} /> <span>{topic}</span>
          </div>
          <Guide topic={topic} />
          <Playground />
          <section className="closing">
            <div>
              <span className="section-label">MAKE IT YOURS</span>
              <h2>
                Your next good conversation
                <br />
                starts with one request.
              </h2>
            </div>
            <a className="primary" href={`${workspace}/app/settings`}>
              Create a free API key <ArrowUpRight size={16} />
            </a>
          </section>
          <footer>
            <span className="footer-brand">hearth.</span>
            <span>Built for a little more human connection.</span>
            <a href="#api-reference" onClick={() => navigate("API reference")}>
              API reference <ArrowUpRight size={13} />
            </a>
          </footer>
        </main>
      </div>
    </>
  );
}
