import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { post, type User } from "./api";
import { Brand, DemoLink, ErrorNotice, Spinner } from "./components";

export function Auth({ signedIn }: { signedIn: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    try {
      const result = await post<{ user: User }>(
        register ? "/auth/register" : "/auth/login",
        {
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        },
      );
      signedIn(result.user);
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="auth-copy">
          <span className="eyebrow">A warmer way to support</span>
          <h1>
            Good conversations
            <br />
            start with <em>care.</em>
          </h1>
          <p>
            Bring your customer conversations, company knowledge, and thoughtful
            AI assistance into one calm workspace.
          </p>
          <div className="auth-points">
            <span>
              <Check size={16} /> Your knowledge, at their fingertips
            </span>
            <span>
              <Check size={16} /> Every conversation has a home
            </span>
            <span>
              <Check size={16} /> Answers with sources you can trust
            </span>
          </div>
        </div>
        <div className="auth-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-card art-knowledge">
            <BookOpen size={20} />
            <div>
              <strong>Your company knowledge</strong>
              <span>Policies, guides, and helpful answers</span>
            </div>
            <span className="art-dot" />
          </div>
          <div className="art-card art-message">
            <span className="art-avatar">
              <MessageCircle size={20} />
            </span>
            <div>
              <small>A customer question</small>
              <strong>Can I return my order?</strong>
            </div>
          </div>
          <div className="art-card art-answer">
            <Sparkles size={19} />
            <div>
              <strong>A little clarity goes a long way.</strong>
              <span>Helpful support, grounded in your policies.</span>
            </div>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>Thoughtful by design.</span>
          <DemoLink />
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-form">
          <span className="pill">
            <ShieldCheck size={14} /> Your private workspace
          </span>
          <h2>{register ? "Make yourself at home." : "Welcome back."}</h2>
          <p>
            {register
              ? "Create an account and give your customer support a little more heart."
              : "A clear head. A calmer inbox. Let’s get you signed in."}
          </p>
          <div className="auth-tabs" role="group" aria-label="Account access">
            <button
              aria-pressed={!register}
              className={!register ? "active" : ""}
              onClick={() => {
                setRegister(false);
                setError(undefined);
              }}
            >
              Sign in
            </button>
            <button
              aria-pressed={register}
              className={register ? "active" : ""}
              onClick={() => {
                setRegister(true);
                setError(undefined);
              }}
            >
              Create account
            </button>
          </div>
          <ErrorNotice error={error} />
          <form onSubmit={submit}>
            {register && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={255}
                  required
                  placeholder="Alex Morgan"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={8}
                maxLength={128}
                required
                placeholder={
                  register ? "At least 8 characters" : "Your password"
                }
              />
            </label>
            <button className="button primary full" disabled={pending}>
              {pending ? (
                <Spinner />
              ) : (
                <>
                  {register
                    ? "Create your workspace"
                    : "Step into your workspace"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <p className="auth-note">
            Your company’s knowledge stays in your account.
            <br />
            No shared inbox. No shared data.
          </p>
          <div className="auth-demo">
            <span>Want to see Hearth in action?</span>
            <DemoLink />
          </div>
        </div>
        <footer>Hearth · Customer care, thoughtfully connected.</footer>
      </section>
    </main>
  );
}
