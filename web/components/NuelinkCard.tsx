'use client';

import { useEffect, useState } from 'react';

const CHANNELS: Array<['linkedin' | 'x' | 'instagram', string, string]> = [
  ['linkedin', 'LinkedIn', 'LinkedIn'], ['x', 'X', 'X'], ['instagram', 'Instagram', 'Instagram'],
];

type Collection = { id: number; title: string; channels: Array<{ type: string; name: string }> };

/**
 * Which Nuelink brand this client is, and which collection each channel
 * posts through. A Nuelink post goes to every channel in its collection, so
 * a collection that carries more than the channel being mapped is flagged:
 * the planner writes different copy per channel and the owner needs one
 * collection per channel to keep it that way.
 */
export function NuelinkCard({ clientId, initial }: { clientId: string; initial: any }) {
  const [state, setState] = useState<any>(null);
  const [brandId, setBrandId] = useState<number | null>(initial?.brandId ?? null);
  const [cols, setCols] = useState<Collection[]>([]);
  const [map, setMap] = useState<Record<string, number | null>>(initial?.collections || {});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => { fetch('/api/nuelink').then((r) => r.json()).then(setState).catch(() => setState({ configured: false })); }, []);
  useEffect(() => {
    if (!brandId) { setCols([]); return; }
    fetch(`/api/nuelink?brand=${brandId}`).then((r) => r.json()).then((d) => setCols(d.collections || [])).catch(() => setCols([]));
  }, [brandId]);

  async function save(next: { brandId: number | null; collections: Record<string, number | null> }) {
    const res = await fetch(`/api/clients/${clientId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nuelink: next }) });
    setSaved(res.ok ? 'Saved' : 'Could not save');
    setTimeout(() => setSaved(null), 1500);
  }

  if (!state) return <p className="muted">Checking Nuelink…</p>;
  if (!state.configured) return <p className="muted">Nuelink is not connected: set NUELINK_API_KEY on the server to send calendars from the Social tab.</p>;
  if (state.error) return <p className="problems">Nuelink answered with an error: {state.error}</p>;

  const others = (c: Collection, type: string) => c.channels.filter((ch) => ch.type !== type).map((ch) => ch.type);

  return (
    <div className="nuelink-card">
      <label className="field" htmlFor="nl-brand"><span>Brand</span>
        <select id="nl-brand" value={brandId ?? ''} onChange={(e) => { const b = e.target.value ? Number(e.target.value) : null; setBrandId(b); const collections = {}; setMap(collections); save({ brandId: b, collections }); }}>
          <option value="">Choose a brand</option>
          {(state.brands || []).map((b: any) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
      </label>
      {brandId ? CHANNELS.map(([key, label, type]) => {
        const chosen = cols.find((c) => c.id === map[key]);
        const extra = chosen ? others(chosen, type) : [];
        return (
          <div key={key}>
            <label className="field" htmlFor={`nl-${key}`}><span>{label} posts go to</span>
              <select id={`nl-${key}`} value={map[key] ?? ''} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; const next = { ...map, [key]: v }; setMap(next); save({ brandId, collections: next }); }}>
                <option value="">Not sent</option>
                {cols.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            {extra.length ? <p className="problems">This collection also posts to {extra.join(', ')}. Make a collection in Nuelink that holds only the {label} channel.</p> : null}
          </div>
        );
      }) : null}
      {saved ? <span className="muted">{saved}</span> : null}
    </div>
  );
}
