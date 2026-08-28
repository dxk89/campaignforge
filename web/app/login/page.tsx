'use client';

import { useState } from 'react';

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
      window.location.href = new URLSearchParams(window.location.search).get('next') || '/clients';
    } catch (err: any) {
      setError(err.message || 'Sign-in failed');
      setBusy(false);
    }
  }

  return (
    <main className="shell" style={{ maxWidth: 420, paddingTop: 120 }}>
      <h1>Campaign Forge</h1>
      <p className="muted" style={{ marginBottom: 24 }}>Sign in to continue.</p>
      <form onSubmit={submit}>
        <label htmlFor="username">Username</label>
        <input id="username" name="username" autoComplete="username" required autoFocus />
        <label htmlFor="password" style={{ marginTop: 12 }}>Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 20 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {error && <p className="form-error" style={{ marginTop: 16 }}>{error}</p>}
    </main>
  );
}
