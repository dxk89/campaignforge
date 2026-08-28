'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewClient() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function create() {
    if (!url.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(url.includes('.') ? { url: url.trim() } : { name: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create the client');
      router.push(`/clients/${data.clientId || data.client.clientId}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="site-scan" style={{ marginTop: 16 }}>
      <span className="line-label">New client</span>
      <div className="inline-add">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
          placeholder="https://client.com  (or just a name)"
          disabled={busy}
        />
        <button className="btn-primary" onClick={create} disabled={busy}>
          {busy ? 'Scanning…' : 'Add client'}
        </button>
      </div>
      <p className="site-hint">A URL reads the important pages for voice and pulls the palette, fonts and logo. A name creates an empty library.</p>
      {error && <p className="source-error">{error}</p>}
    </div>
  );
}
