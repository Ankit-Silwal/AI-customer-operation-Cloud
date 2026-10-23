import { useState, type FormEvent } from "react";
import { post } from "./api";
import { ErrorNotice } from "./components";
export function PasswordReset({ back }: { back: () => void }) {
  const [email, setEmail] = useState(""); const [challenge, setChallenge] = useState(""); const [pending, setPending] = useState(false); const [error, setError] = useState<unknown>(); const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget); setPending(true); setError(undefined);
    try {
      if (!challenge) { const result = await post<{ challengeId: string }>("/auth/password/forgot", { email }); setChallenge(result.challengeId); }
      else { await post("/auth/password/reset", { email, challengeId: challenge, code: fields.get("code"), password: fields.get("password") }); setDone(true); }
    } catch(e) { setError(e); } finally { setPending(false); }
  }
  return <><h2>A fresh start.</h2><p>{done ? "Your password has been reset. Sign in with your new password." : challenge ? "If an account exists, a code has been sent. Enter it below within five minutes." : "Enter your account email to receive a password reset code."}</p><ErrorNotice error={error}/>{!done && <form onSubmit={e => void submit(e)}><label>Email address<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required disabled={Boolean(challenge)}/></label>{challenge && <><label>Verification code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/></label><label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required/></label></>}<button className="button primary full" disabled={pending}>{pending ? "Working…" : challenge ? "Reset password" : "Send reset code"}</button>{challenge && <button className="button ghost" type="button" disabled={pending} onClick={() => { setChallenge(""); setError(undefined); }}>Use another email or request a new code</button>}</form>}<button className="button ghost" onClick={back} disabled={pending}>Back to sign in</button></>;
}
