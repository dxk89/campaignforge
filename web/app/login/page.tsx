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
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
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
      <p className="muted" style={{ marginBottom: 24 }}>Sign in to continue.</p>
      <form onSubmit={submit}>
        <label className="field" htmlFor="username"><span>Username</span>
          <input id="username" name="username" autoComplete="username" required autoFocus /></label>
        <label className="field" htmlFor="password"><span>Password</span>
          <input id="password" name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 20 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {error && <p className="form-error" style={{ marginTop: 16 }}>{error}</p>}
      <DataNotice />
    </main>
  );
}
