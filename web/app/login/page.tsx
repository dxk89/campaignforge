'use client';

import { useState } from 'react';
import DataNotice from '@/components/DataNotice';

/**
 * Only same-origin paths. Resolving against the real origin and comparing
 * origins closes the encodings a regex misses: a percent-encoded backslash
 * or a stripped tab both resolve to another host, while looking like a
 * relative path in the raw string.
 */
function safeNext(raw: string | null): string {
  if (!raw) return '/clients';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '/clients';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/clients';
  }
}

/** Username and password. No third-party account needed to try the tool. */
export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: form.get('password') }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign-in failed');
      const next = new URLSearchParams(window.location.search).get('next');
      // The login page is public, so this link is reachable by anyone, not
      // just a signed-in user clicking their own bookmark. safeNext() parses
      // rather than pattern-matches, so it rejects "//evil.com",
      // "https://evil.com", "javascript:..." and encodings that decode to a
      // cross-origin URL (e.g. a percent-encoded backslash or stripped tab).
      window.location.href = safeNext(next);
    } catch (err: any) {
      setError(err.message || 'Sign-in failed');
      setBusy(false);
    }
  }

  return (
    <main className="shell" style={{ maxWidth: 460, paddingTop: 72 }}>
      <h1>Campaign Forge</h1>
      <p className="login-tagline">Brief in, campaign out.</p>

      {/*
        Anyone reaching this page without an account is here to find out what
        the product does, and a bare sign-in box tells them nothing. This says
        it in the order someone assesses it: what goes in, what comes out, and
        the two things that make it more than a wrapper around a model.
      */}
      <section className="login-intro">
        <p>
          Give it a product brief and it returns a campaign: positioning and strategy,
          ad copy for Meta, LinkedIn and Google, a three-email sequence, a month of
          social posts with graphics, and a Portuguese adaptation.
        </p>
        <ul>
          <li>
            <b>Nothing over the limit reaches you.</b> Every asset is checked against the
            platform&rsquo;s real character limits and the client&rsquo;s claim rules before
            it is accepted. Copy that breaches one is flagged for a person, never quietly trimmed.
          </li>
          <li>
            <b>Every pass is priced.</b> Tokens, cost and duration are shown per agent,
            and a monthly ceiling refuses a run before it spends rather than after.
          </li>
        </ul>
      </section>

      <p className="muted" style={{ marginBottom: 24 }}>Sign in to continue.</p>
      <form onSubmit={submit}>
        <label className="field" htmlFor="password"><span>Password</span>
          <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus /></label>
        <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 20 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {error && <p className="form-error" style={{ marginTop: 16 }}>{error}</p>}
      <DataNotice />
    </main>
  );
}
