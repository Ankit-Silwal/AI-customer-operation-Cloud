import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, RotateCcw, Send, Sparkles } from "lucide-react";
import {
  post,
  type Message,
  type Organization,
  type ServiceStatus,
  type Source,
} from "./api";
import { ErrorNotice, Spinner } from "./components";
import { PageHeading } from "./App";

interface Reply {
  answer: string;
  sources: Source[];
  mode: "generation" | "retrieval";
}
interface Turn extends Reply {
  question: string;
}

function recentHistory(
  turns: Turn[],
  organizationId: string,
  question: string,
): Message[] {
  const history: Message[] = turns.slice(-5).flatMap((turn) => [
    { role: "user" as const, content: turn.question.slice(0, 4000) },
    { role: "assistant" as const, content: turn.answer.slice(0, 4000) },
  ]);
  // Keep Unicode and JSON overhead within the API's 16 KiB request limit.
  while (
    history.length &&
    new TextEncoder().encode(
      JSON.stringify({ organizationId, question, history, topK: 4 }),
    ).length > 14000
  )
    history.splice(0, 2);
  return history;
}

export function Playground({
  organization,
  status,
}: {
  organization: Organization;
  status?: ServiceStatus;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [error, setError] = useState<unknown>();
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const pending = Boolean(pendingQuestion);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [turns, pendingQuestion]);
  async function ask(event?: FormEvent) {
    event?.preventDefault();
    if (pending || !question.trim()) return;
    const sent = question.trim();
    setPendingQuestion(sent);
    setQuestion("");
    setError(undefined);
    try {
      const result = await post<Reply>("/rag/chat", {
        organizationId: organization.id,
        question: sent,
        topK: 4,
        history: recentHistory(turns, organization.id, sent),
      });
      setTurns((current) => [...current, { ...result, question: sent }]);
    } catch (failure) {
      setError(failure);
      setQuestion(sent);
    } finally {
      setPendingQuestion("");
      input.current?.focus();
    }
  }
  return (
    <section>
      <PageHeading
        label="A space to get curious"
        title="Let's talk it through."
        description="Ask about your company knowledge, then keep the conversation going."
        action={
          <button
            className="button secondary"
            disabled={pending || !turns.length}
            onClick={() => {
              setTurns([]);
              setError(undefined);
              setQuestion("");
              input.current?.focus();
            }}
          >
            <RotateCcw size={16} /> New chat
          </button>
        }
      />
      <div className="playground-layout">
        <div className="playground-main panel">
          <div className="playground-header">
            <span className="stat-icon rust">
              <Sparkles size={21} />
            </span>
            <div>
              <h2>{organization.name}'s assistant</h2>
              <p>One reply at a time. Your context stays in this workspace.</p>
            </div>
            <span className="badge sage">Private chat</span>
          </div>
          <div
            className="playground-result playground-chat"
            ref={log}
            role="log"
            aria-label="Knowledge conversation"
            aria-live="polite"
            aria-busy={pending}
          >
            {!turns.length && !pending ? (
              <div className="playground-welcome">
                <span className="large-sun" aria-hidden="true">
                  ✳
                </span>
                <h2>
                  What would you
                  <br />
                  like to know?
                </h2>
                <p>
                  Start with a question about your policies or products.
                  <br />
                  Then ask a follow-up, just like a conversation.
                </p>
                <div className="suggestions">
                  {[
                    "What is our returns policy?",
                    "How long does delivery take?",
                    "How do I contact customer care?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setQuestion(suggestion);
                        input.current?.focus();
                      }}
                    >
                      {suggestion}
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((turn, index) => (
                <div className="playground-turn" key={index}>
                  <article className="playground-message user">
                    <span>You</span>
                    <p>{turn.question}</p>
                  </article>
                  <article className="playground-message assistant">
                    <span>
                      <Sparkles size={14} />{" "}
                      {turn.mode === "generation"
                        ? "Assistant"
                        : "Policy lookup"}
                    </span>
                    <p>{turn.answer}</p>
                    {turn.mode === "retrieval" && (
                      <small>
                        Retrieved from your source. Connect Gemini for a written
                        answer.
                      </small>
                    )}
                    {turn.sources.length > 0 && (
                      <details className="chat-sources">
                        <summary>
                          <BookOpen size={14} /> View sources (
                          {turn.sources.length})
                        </summary>
                        {turn.sources.map((source, sourceIndex) => (
                          <article
                            className="chat-source"
                            key={`${source.documentId}-${source.chunkIndex}`}
                          >
                            <strong>
                              [{sourceIndex + 1}] {source.title}
                            </strong>
                            <p>{source.text}</p>
                          </article>
                        ))}
                      </details>
                    )}
                  </article>
                </div>
              ))
            )}
            {pending && (
              <div className="playground-turn">
                <article className="playground-message user">
                  <span>You</span>
                  <p>{pendingQuestion}</p>
                </article>
                <div className="chat-thinking" role="status">
                  <Spinner /> Reading your knowledge...
                </div>
              </div>
            )}
          </div>
          <div className="question-area">
            <ErrorNotice error={error} />
            <form onSubmit={ask}>
              <label htmlFor="question" className="sr-only">
                Ask your company knowledge
              </label>
              <textarea
                id="question"
                ref={input}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={2000}
                placeholder={
                  turns.length
                    ? "Ask a follow-up..."
                    : "Ask about your company..."
                }
                required
                rows={2}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void ask();
                  }
                }}
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
              Enter to send. Shift + Enter for a new line. Recent turns provide
              context; New chat clears this thread.
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
                <p>Add and index a document in the knowledge library.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Keep the conversation going</strong>
                <p>
                  Ask a question, then follow up with details. Recent messages
                  help your assistant understand what you mean.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Check the original wording</strong>
                <p>
                  Each reply has optional sources. Open them when you want to
                  verify a detail.
                </p>
              </div>
            </li>
          </ol>
          <div className="guide-note">
            <BookOpen size={20} />
            <p>
              {status?.generationConfigured
                ? "AI answers are grounded in your current indexed sources."
                : "Without a Gemini key, each reply shows one relevant policy passage. Written answers need Gemini; indexing and search use local BAAI embeddings."}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
