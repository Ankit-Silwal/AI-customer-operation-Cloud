'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { authClient } from '../lib/auth-client';

export function AuthScreen({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error('Unable to reach the API.');
        return r.json();
      })
      .then((config) => setGoogleEnabled(config.googleEnabled))
      .catch(() =>
        setError('Unable to reach the API. Check that the API and database are running.'),
      );
    if (new URLSearchParams(window.location.search).has('error'))
      setError('Google sign-in could not be completed. Please try again.');
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const credentials = {
      email: String(data.get('email')),
      password: String(data.get('password')),
    };
    try {
      const result =
        mode === 'signup'
          ? await authClient.signUp.email({ ...credentials, name: String(data.get('name')) })
          : await authClient.signIn.email(credentials);
      if (result.error) setError(result.error.message || 'Unable to sign in.');
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
        errorCallbackURL: '/?error=oauth',
      });
      if (result.error) setError(result.error.message || 'Google sign-in failed.');
    } catch {
      setError('Unable to start Google sign-in.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-mark">
            r<span>•</span>
          </span>
          relay<span className="cloud">CLOUD</span>
        </a>
        <div>
          <span className="eyebrow">A LITTLE CLOSER TO YOUR CUSTOMERS</span>
          <h1>
            Good conversations.
            <br />
            Great relationships.
          </h1>
          <p>
            A shared home for your customer conversations,
            <br />
            your team’s documents, and whatever comes next.
          </p>
          <div className="auth-illustration">
            <span className="welcome-symbol">✧</span>
            <div className="sample-bubble">
              Hello! How can we help today?<span>RELAY WORKSPACE</span>
            </div>
            <div className="sample-bubble reply">
              A little support goes a long way.<span>YOUR NEXT CUSTOMER</span>
            </div>
          </div>
        </div>
        <small>Built for better conversations.</small>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-card">
          <span className="eyebrow">YOUR CUSTOMER OPERATIONS, CONNECTED</span>
          <h2>{mode === 'signin' ? 'Welcome back.' : 'Make yourself at home.'}</h2>
          <p>
            {mode === 'signin'
              ? 'Sign in to your Relay workspace.'
              : 'Create an account to start your first workspace.'}
          </p>
          <button className="google-button" disabled={busy || !googleEnabled} onClick={google}>
            <b>G</b>Continue with Google
          </button>
          {!googleEnabled && (
            <small className="google-note">
              Google sign-in needs your OAuth credentials configured.
            </small>
          )}
          <div className="auth-divider">
            <span />
            or continue with email
            <span />
          </div>
          <form onSubmit={submit}>
            {mode === 'signup' && (
              <>
                <label htmlFor="name">Your name</label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                  placeholder="Jamie Davis"
                />
              </>
            )}
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={128}
              required
              placeholder="At least 8 characters"
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary wide" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account ↗' : 'Sign in ↗'}
            </button>
          </form>
          <p className="auth-switch">
            {mode === 'signin' ? 'New to Relay?' : 'Already have an account?'}{' '}
            <button
              disabled={busy}
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError('');
              }}
            >
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
