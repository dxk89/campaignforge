'use client';

import { useState } from 'react';

/**
 * Paste, check, read. The verdict leads because the question is almost always
 * "can I send this" before "why not".
 */
const CHANNELS = [
  '', 'meta', 'linkedin', 'google', 'email',
  'x', 'instagram', 'facebook', 'tiktok', 'threads', 'youtube', 'pinterest',
];

const VERDICT: Record<string, string> = {
  clean: 'Clean',
  warnings: 'Worth a look',
  violations: 'Needs a fix',
};

export default function Clinic({ clients }: { clients: { clientId: string; name: string }[] }) {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('');
  const [clientId, setClientId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, channel: channel || undefined, clientId: clientId || undefined }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error || 'Could not check that');
      setResult(null);
      return;
    }
    setResult(data);
  }

  return (
    <section className="clinic">
      <label className="field" htmlFor="clinic-text"><span>Copy</span>
        <textarea
          id="clinic-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste a headline, a post, an email subject line"
        /></label>

      <div className="field-row">
        <label className="field" htmlFor="clinic-channel"><span>Channel <em className="opt">optional</em></span>
          <select id="clinic-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{c || 'every channel'}</option>)}
          </select></label>
        <label className="field" htmlFor="clinic-client"><span>Client <em className="opt">for its own rules</em></span>
          <select id="clinic-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">none</option>
            {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
          </select></label>
      </div>

      <div>
        <button className="btn-primary" type="button" onClick={run} disabled={busy || !text.trim()}>
          {busy ? 'Checking…' : 'Check'}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}

      {result && (
        <div className="clinic-out">
          <p className={`clinic-verdict ${result.verdict}`}>
            {VERDICT[result.verdict]}
            <span className="muted"> · {result.chars} characters</span>
          </p>

          {result.ranWithoutClientRules && (
            <p className="notice-warn">
              Checked without the client&rsquo;s own rules, so avoid terms, approved claims and brand
              spelling were not tested. Pick a client above to include them.
            </p>
          )}

          {result.flags.length > 0 && (
            <ul className="clinic-flags">
              {result.flags.map((f: any, i: number) => (
                <li key={i} className={f.severity}>
                  <b>{f.detail}</b>
                  <span className="muted">{f.why}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="clinic-fit">
            {result.over.length > 0 && (
              <p><b>Too long for:</b>{' '}
                {result.over.map((o: any) => `${o.channel} ${o.field} (${o.by} over)`).join(', ')}</p>
            )}
            {result.fits.length > 0 && (
              <p className="muted"><b>Fits:</b>{' '}
                {result.fits.map((f: any) => `${f.channel} ${f.field}`).join(', ')}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
