'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = { client: any; sources: any[]; campaigns: any[] };

/**
 * The client library: brand kit, editable voice rules, sources, campaigns.
 * Voice rules are editable because the research pass proposes them and a
 * person decides. Everything here persists.
 */
export default function Library({ client, sources, campaigns }: Props) {
  const router = useRouter();
  const [voice, setVoice] = useState(client.voice);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kit = client.brandKit || {};
  const accents: string[] = kit.palette?.accents || [];

  async function saveVoice() {
    setBusy(true);
    const res = await fetch(`/api/clients/${client.clientId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voice }),
    });
    setBusy(false);
    setSaved(res.ok ? 'Saved' : 'Could not save');
    setTimeout(() => setSaved(null), 1600);
    router.refresh();
  }

  const lines = (arr: string[]) => (arr || []).join('\n');
  const parse = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean);

  async function addSources(files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData();
    Array.from(files).forEach((f) => form.append('files', f));
    setBusy(true);
    await fetch(`/api/clients/${client.clientId}/sources`, { method: 'POST', body: form });
    setBusy(false);
    router.refresh();
  }

  async function removeSource(sid: string) {
    await fetch(`/api/clients/${client.clientId}/sources/${sid}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="library">
      <section className="block">
        <h2 className="block-title">Brand kit</h2>
        {accents.length ? (
          <div className="swatches">
            {[...accents, kit.palette?.dark, kit.palette?.light].filter(Boolean).map((c: string) => (
              <span key={c} className="swatch" style={{ background: c }} title={c} />
            ))}
          </div>
        ) : <p className="muted">No palette yet. Scan the site or upload brand assets.</p>}
        <p className="kit-line">
          <b>{kit.siteName || client.name}</b>{kit.tagline ? ` · ${kit.tagline}` : ''}
        </p>
        <p className="kit-line">
          Fonts: <b>{(kit.fonts || []).join(', ') || 'none found'}</b>
          {kit.pages?.length ? ` · ${kit.pages.length} pages read` : ''}
          {kit.scannedAt ? ` · scanned ${new Date(kit.scannedAt).toLocaleDateString('en-GB')}` : ''}
        </p>
      </section>

      <section className="block">
        <h2 className="block-title">Voice rules <span className="block-hint">proposed by research, decided by you</span></h2>
        <label className="field">
          <span>Observations (one per line)</span>
          <textarea rows={4} value={lines(voice.observations)} onChange={(e) => setVoice({ ...voice, observations: parse(e.target.value) })} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Preferred terms</span>
            <textarea rows={3} value={lines(voice.preferredTerms)} onChange={(e) => setVoice({ ...voice, preferredTerms: parse(e.target.value) })} />
          </label>
          <label className="field">
            <span>Avoid terms</span>
            <textarea rows={3} value={lines(voice.avoidTerms)} onChange={(e) => setVoice({ ...voice, avoidTerms: parse(e.target.value) })} />
          </label>
        </div>
        <button className="btn-secondary" onClick={saveVoice} disabled={busy}>Save voice rules</button>
        {saved && <span className="muted" style={{ marginLeft: 10 }}>{saved}</span>}
      </section>

      <section className="block">
        <h2 className="block-title">Sources <span className="block-hint">{sources.length} on file</span></h2>
        <label className="asset-btn">
          <input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm" onChange={(e) => addSources(e.target.files)} />
          <span>Add files</span>
        </label>
        <ul className="source-list" style={{ marginTop: 10 }}>
          {sources.map((s) => (
            <li key={s.sourceId}>
              <span className="source-kind">{s.kind}</span>
              <span className="source-name" title={s.name}>{s.name}</span>
              <span className="source-chars">{s.chars.toLocaleString('en-GB')} ch</span>
              <button className="source-remove" onClick={() => removeSource(s.sourceId)} aria-label={`Remove ${s.name}`}>×</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="block">
        <h2 className="block-title">Campaigns</h2>
        <NewCampaign clientId={client.clientId} defaults={client.settings} />
        <ul className="client-list" style={{ marginTop: 10 }}>
          {campaigns.map((c) => (
            <li key={c.campaignId}>
              <a href={`/clients/${client.clientId}/campaigns/${c.campaignId}`}>{c.brief.productName}</a>
              <span className="muted">{c.brief.objective.replace(/_/g, ' ')}</span>
              <span className="mono muted">{c.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function NewCampaign({ clientId, defaults }: { clientId: string; defaults: any }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const res = await fetch(`/api/clients/${clientId}/campaigns`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        brief: {
          productName: '', productDescription: '', targetAudience: '',
          objective: 'trial_signups', tone: defaults?.defaultTone || 'direct',
          languages: defaults?.defaultLanguages || ['en'],
        },
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) router.push(`/clients/${clientId}/campaigns/${data.campaignId}`);
  }
  return <button className="btn-secondary" onClick={create} disabled={busy}>New campaign</button>;
}
