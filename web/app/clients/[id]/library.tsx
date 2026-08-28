'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Claims from './claims';

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
  const [url, setUrl] = useState('');
  const [pasteLabel, setPasteLabel] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const kit = client.brandKit || {};
  const accents: string[] = kit.palette?.accents || [];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(accents);

  /**
   * The palette is read off the site's CSS, which is a guess however good the
   * heuristics are: a brand can use a colour that never appears in a
   * stylesheet at all, in a logo or a print guideline. The colours drive
   * every generated graphic, so a wrong one is wrong on everything, and
   * before this there was no way to correct it. Saving writes the whole
   * palette back and clears `uncertain`, because a person choosing the
   * colours is not a guess.
   */
  async function savePalette(next: string[]) {
    setBusy(true);
    const res = await fetch(`/api/clients/${client.clientId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brandKit: { ...kit, palette: { ...kit.palette, accents: next, uncertain: false } } }),
    });
    setBusy(false);
    setSaved(res.ok ? 'Saved' : 'Could not save');
    setTimeout(() => setSaved(null), 1600);
    setEditing(false);
    router.refresh();
  }

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

  async function postSource(body: any) {
    setBusy(true); setError(null);
    const res = await fetch(`/api/clients/${client.clientId}/sources`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error || 'Could not add that source'); return false; }
    router.refresh();
    return true;
  }

  async function addUrl() {
    if (!url.trim()) return;
    if (await postSource({ url: url.trim() })) setUrl('');
  }

  async function addPaste() {
    if (!pasteText.trim()) return;
    if (await postSource({ label: pasteLabel.trim(), text: pasteText })) { setPasteText(''); setPasteLabel(''); }
  }

  async function uploadAssets(files: FileList | null, field: 'logo' | 'artwork') {
    if (!files?.length) return;
    const form = new FormData();
    if (field === 'logo') form.append('logo', files[0]);
    else Array.from(files).slice(0, 6).forEach((f) => form.append('artwork', f));
    setBusy(true); setError(null);
    const res = await fetch(`/api/clients/${client.clientId}/assets`, { method: 'POST', body: form });
    setBusy(false);
    // The route already explains itself - a misconfigured bucket names the
    // variable to fix - and "Could not upload that file" threw that away,
    // leaving a configuration error looking like a bad file.
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      setError(detail?.error || `Could not upload that file (${res.status})`);
    }
    router.refresh();
  }

  /** Removing an asset is a PATCH on the brand kit; the file stays in storage. */
  async function removeAsset(which: 'logo' | number) {
    const next = { ...kit };
    if (which === 'logo') next.logoRef = null;
    else next.artworkRefs = (kit.artworkRefs || []).filter((_: string, i: number) => i !== which);
    await fetch(`/api/clients/${client.clientId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brandKit: next }),
    });
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
        {kit.palette?.uncertain && !editing ? (
          <p className="notice-warn">
            Every colour found on the site belongs to a CSS framework rather than the brand,
            so these are probably wrong. Set them here.
          </p>
        ) : null}
        {accents.length ? (
          <>
            <div className="swatches">
              {[...accents, kit.palette?.dark, kit.palette?.light].filter(Boolean).map((c: string) => (
                <span key={c} className="swatch" style={{ background: c }} title={c} />
              ))}
            </div>
            {editing ? (
              <div className="palette-edit">
                {draft.map((c, i) => (
                  <span key={i} className="palette-edit__item">
                    <input
                      type="color" value={c} aria-label={`Accent ${i + 1}`}
                      onChange={(e) => setDraft(draft.map((d, j) => (j === i ? e.target.value : d)))}
                    />
                    <input
                      type="text" value={c} spellCheck={false} aria-label={`Accent ${i + 1} hex`}
                      onChange={(e) => setDraft(draft.map((d, j) => (j === i ? e.target.value : d)))}
                    />
                    <button type="button" className="link" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
                      remove
                    </button>
                  </span>
                ))}
                <div className="palette-edit__actions">
                  {draft.length < 5 ? (
                    <button type="button" onClick={() => setDraft([...draft, '#000000'])}>Add a colour</button>
                  ) : null}
                  <button
                    type="button" disabled={busy}
                    onClick={() => savePalette(draft.filter((c) => /^#[0-9a-f]{6}$/i.test(c.trim())).map((c) => c.trim().toLowerCase()))}
                  >
                    Save colours
                  </button>
                  <button type="button" className="link" onClick={() => { setDraft(accents); setEditing(false); }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="link" onClick={() => { setDraft(accents); setEditing(true); }}>
                Edit colours
              </button>
            )}
          </>
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
        <h2 className="block-title">Brand assets <span className="block-hint">logo goes on every graphic; artwork steers generated images</span></h2>
        <div className="brand-assets">
          <label className="asset-btn">
            <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" onChange={(e) => uploadAssets(e.target.files, 'logo')} />
            <span>Upload logo</span>
          </label>
          <label className="asset-btn">
            <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(e) => uploadAssets(e.target.files, 'artwork')} />
            <span>Add artwork</span>
          </label>
        </div>
        <div className="asset-strip">
          {kit.logoRef && (
            <div className="thumb logo" title="Logo">
              <img src={`/api/files/${kit.logoRef}`} alt="logo" />
              <button type="button" onClick={() => removeAsset('logo')} aria-label="Remove logo">×</button>
            </div>
          )}
          {(kit.artworkRefs || []).map((ref: string, i: number) => (
            <div className="thumb" key={ref} title={`Artwork ${i + 1}`}>
              <img src={`/api/files/${ref}`} alt="" />
              <button type="button" onClick={() => removeAsset(i)} aria-label="Remove artwork">×</button>
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <h2 className="block-title">Sources <span className="block-hint">{sources.length} on file</span></h2>
        <div className="source-add">
          <label className="asset-btn">
            <input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm" onChange={(e) => addSources(e.target.files)} />
            <span>Add files</span>
          </label>
          <div className="inline-add">
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }}
              placeholder="https://client.com/product" disabled={busy} />
            <button type="button" className="btn-secondary" onClick={addUrl} disabled={busy}>Fetch page</button>
          </div>
          <details className="paste">
            <summary>Paste text</summary>
            <input type="text" value={pasteLabel} onChange={(e) => setPasteLabel(e.target.value)} placeholder="Label, e.g. brand-voice.md" />
            <textarea rows={4} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste a tone-of-voice guide, a landing page, customer quotes…" />
            <button type="button" className="btn-secondary" onClick={addPaste} disabled={busy}>Add text</button>
          </details>
        </div>
        {error && <p className="source-error">{error}</p>}
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

      <Claims clientId={client.clientId} />

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
