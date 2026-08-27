'use client';

import { useState } from 'react';

/**
 * One button. The Firebase client SDK is loaded only here, and only the
 * public config reaches the browser; the ID token it returns is exchanged
 * server-side for a session cookie and the allowlist is checked there.
 */
export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const { initializeApp, getApps } = await import('firebase/app');
      const { getAuth, GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      const config = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      };
      const app = getApps().length ? getApps()[0] : initializeApp(config);
      const cred = await signInWithPopup(getAuth(app), new GoogleAuthProvider());
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign-in failed');
      const next = new URLSearchParams(window.location.search).get('next') || '/clients';
      window.location.href = next;
    } catch (err: any) {
      setError(err.message || 'Sign-in failed');
    }
    setBusy(false);
  }

  return (
    <main className="shell" style={{ maxWidth: 420, paddingTop: 120 }}>
      <h1>Campaign Forge</h1>
      <p className="muted" style={{ marginBottom: 24 }}>Sign in to continue.</p>
      <button className="btn-primary" onClick={signIn} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in with Google'}
      </button>
      {error && <p className="form-error" style={{ marginTop: 16 }}>{error}</p>}
    </main>
  );
}
