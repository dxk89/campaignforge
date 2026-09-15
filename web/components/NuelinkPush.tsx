'use client';

import { useEffect, useState } from 'react';

type Result = { day: number; channel: string; scheduledAt: string | null; status: string; error: string | null };

/**
 * Sending the month to Nuelink from the Social tab. The date and the mode
 * are the only decisions: which collection a channel goes to was made on the
 * client page, and what each post says was made by the planner and edited
 * here. The result is a table, one row per post, because a push of thirty
 * posts with two failures is a normal outcome and the person needs to see
 * which two.
 */
export function NuelinkPush({ clientId, campaignId, posts, start }: { clientId: string; campaignId: string; posts: any[]; start: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'DRAFT' | 'SCHEDULE'>('DRAFT');
  const [weekends, setWeekends] = useState<'skip' | 'keep'>('skip');
  const [force, setForce] = useState(false);
  const channels = [...new Set(posts.map((p) => p.channel))] as string[];
  const [chosen, setChosen] = useState<Set<string>>(new Set(channels));
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/clients/${clientId}/campaigns/${campaignId}/schedule/nuelink`;

  useEffect(() => {
    fetch('/api/nuelink').then((r) => r.json()).then((d) => setConfigured(Boolean(d.configured))).catch(() => setConfigured(false));
    fetch(base).then((r) => r.json()).then((d) => setSent(new Set((d.sent || []).map((s: any) => `${s.day}-${s.channel}`)))).catch(() => {});
  }, [base]);

  const willSend = posts.filter((p) => chosen.has(p.channel) && (force || !sent.has(`${p.day}-${p.channel}`))).length;
  const already = posts.filter((p) => chosen.has(p.channel) && sent.has(`${p.day}-${p.channel}`)).length;

  async function send() {
    setBusy(true); setError(null); setResults(null);
    try {
      const res = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start, publishMode: mode, weekends, channels: [...chosen], force }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'The push failed'); return; }
      setResults(d.push.results);
      setSent((s) => { const n = new Set(s); for (const r of d.push.results) if (r.status === 'posted') n.add(`${r.day}-${r.channel}`); return n; });
    } finally { setBusy(false); }
  }

  return (
    <div className="social-bar nuelink-push">
      <strong>Send to Nuelink</strong>
      {configured === false ? <span className="muted">Nuelink is not connected: set NUELINK_API_KEY on the server.</span> : (
        <>
          {channels.map((c) => (
            <label key={c} className="check"><input type="checkbox" checked={chosen.has(c)} onChange={(e) => setChosen((s) => { const n = new Set(s); e.target.checked ? n.add(c) : n.delete(c); return n; })} /> {c}</label>
          ))}
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} aria-label="Publish mode">
            <option value="DRAFT">As drafts</option>
            <option value="SCHEDULE">Scheduled from the start date</option>
          </select>
          <label className="check"><input type="checkbox" checked={weekends === 'keep'} onChange={(e) => setWeekends(e.target.checked ? 'keep' : 'skip')} /> keep weekend days</label>
          <label className="check"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> re-send posts already sent</label>
          <span className="muted">{willSend} to send{already ? `, ${already} already sent` : ''}</span>
          <button type="button" className="btn-secondary" onClick={send} disabled={busy || willSend === 0}>{busy ? 'Sending…' : `Send ${willSend} to Nuelink`}</button>
          {error ? <span className="problems">{error}</span> : null}
          {results ? (
            <table className="nuelink-results">
              <thead><tr><th>Day</th><th>Channel</th><th>When</th><th>Result</th></tr></thead>
              <tbody>{results.map((r) => (
                <tr key={`${r.day}-${r.channel}`} className={r.status}><td>{r.day}</td><td>{r.channel}</td><td>{r.scheduledAt || 'draft'}</td><td>{r.status}{r.error ? `: ${r.error}` : ''}</td></tr>
              ))}</tbody>
            </table>
          ) : null}
        </>
      )}
    </div>
  );
}
