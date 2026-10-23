import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import {
  post,
  type Organization,
  type ServiceStatus,
  type Source,
} from "./api";
import { ErrorNotice, Spinner } from "./components";
import { PageHeading } from "./App";

interface Answer {
  question: string;
  answer?: string;
  sources: Source[];
  mode: "search" | "answer";
}
export function Playground({
  organization,
  status,
}: {
  organization: Organization;
  status?: ServiceStatus;
}) {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"search" | "answer">("search");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [answer, setAnswer] = useState<Answer>();
  const [expanded, setExpanded] = useState<number>();
  async function ask(event: FormEvent) {
    event.preventDefault();
    if (pending || !question.trim()) return;
    setPending(true);
    setError(undefined);
    setExpanded(undefined);
    try {
      const result = await post<{ answer?: string; sources: Source[] }>(
        mode === "search" ? "/rag/search" : "/rag/query",
        { organizationId: organization.id, question: question.trim(), topK: 4 },
      );
      setAnswer({ ...result, question: question.trim(), mode });
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }
  return (
    <section>
      <PageHeading
        label="A space to get curious"
        title="Ask a better question."
        description="See what your assistant knows, follow its sources, and find the gaps before your customers do."
      />
      <div className="playground-layout">
        <div className="playground-main panel">
          <div className="playground-header">
            <span className="stat-icon rust">
              <Sparkles size={21} />
            </span>
            <div>
              <h2>{organization.name}’s knowledge</h2>
              <p>A thoughtful answer starts with the right context.</p>
            </div>
            <span className="badge sage">Private workspace</span>
          </div>
          <div className="playground-result" aria-live="polite">
            {answer ? (
              <>
                <div className="asked-question">
                  <span>You asked</span>
                  <h3>{answer.question}</h3>
                </div>
                {answer.mode === "answer" && (
                  <div className="generated-answer">
                    <span className="answer-label">
                      <Sparkles size={15} /> Assistant’s answer
                    </span>
                    <p>{answer.answer}</p>
                  </div>
                )}
                <div className="result-heading">
                  <BookOpen size={17} />
                  <h3>
                    {answer.sources.length
                      ? `Found in your knowledge · ${answer.sources.length} sources`
                      : "No matching sources yet"}
                  </h3>
                </div>
                {answer.sources.map((source, index) => (
                  <article
                    className="source-result"
                    key={`${source.documentId}-${source.chunkIndex}`}
                  >
                    <button
                      aria-expanded={expanded === index}
                      onClick={() =>
                        setExpanded(expanded === index ? undefined : index)
                      }
                    >
                      <span className="source-number">{index + 1}</span>
                      <span>
                        <strong>{source.title}</strong>
                        <small>
                          Supporting passage {source.chunkIndex + 1}
                        </small>
                      </span>
                      {expanded === index ? (
                        <ChevronUp size={17} />
                      ) : (
                        <ChevronDown size={17} />
                      )}
                    </button>
                    <p className={expanded === index ? "expanded" : ""}>
                      {source.text}
                    </p>
                  </article>
                ))}
                {!answer.sources.length && (
                  <p className="muted">
                    Try a more specific question, or add and index a source in
                    your knowledge library.
                  </p>
                )}
              </>
            ) : (
              <div className="playground-welcome">
                <span className="large-sun" aria-hidden="true">
                  ✳
                </span>
                <h2>
                  What would your
                  <br />
                  customers like to know?
                </h2>
                <p>
                  Try a real question about your policies or products.
                  <br />
                  Every result belongs to this workspace.
                </p>
                <div className="suggestions">
                  {[
                    "What is our returns policy?",
                    "How long does delivery take?",
                    "How do I contact customer care?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setQuestion(suggestion)}
                    >
                      {suggestion}
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="question-area">
            <ErrorNotice error={error} />
            <div
              className="query-modes"
              role="group"
              aria-label="Question mode"
            >
              <button
                className={mode === "search" ? "active" : ""}
                aria-pressed={mode === "search"}
                onClick={() => setMode("search")}
              >
                <Search size={14} /> Find passages
              </button>
              <button
                className={mode === "answer" ? "active" : ""}
                aria-pressed={mode === "answer"}
                disabled={!status?.generationConfigured}
                onClick={() => setMode("answer")}
                title={
                  !status?.generationConfigured
                    ? "Configure the Gemini key to enable written answers"
                    : "Generate an answer with citations"
                }
              >
                <Sparkles size={14} /> Write an answer
                {!status?.generationConfigured && <span>Setup needed</span>}
              </button>
            </div>
            <form onSubmit={ask}>
              <label htmlFor="question" className="sr-only">
                Ask your company knowledge
              </label>
              <textarea
                id="question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={2000}
                placeholder="Ask a question about your company…"
                required
                rows={2}
              />
              <button
                className="button primary"
                disabled={pending || !question.trim()}
                aria-label="Ask question"
              >
                {pending ? <Spinner /> : <Send size={19} />}
              </button>
            </form>
            <small>
              {pending
                ? "Reading your knowledge…"
                : "Answers are grounded in your indexed sources. Always review before sharing."}
            </small>
          </div>
        </div>
        <aside className="playground-guide">
          <span className="eyebrow">A little guidance</span>
          <h2>
            Good context.
            <br />
            <em>Clearer answers.</em>
          </h2>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Start with your sources</strong>
                <p>Add and index a document before asking a question.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Ask something specific</strong>
                <p>
                  “Can I return a used item?” works better than “Tell me
                  everything.”
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Follow the paper trail</strong>
                <p>
                  Open the supporting passages and check the original wording.
                </p>
              </div>
            </li>
          </ol>
          <div className="guide-note">
            <BookOpen size={20} />
            <p>
              Passage search works today. AI-written answers are available when
              your Gemini key is connected.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
