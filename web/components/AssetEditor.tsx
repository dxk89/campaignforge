'use client';

import { useState } from 'react';

export type Asset = {
  assetId: string; channel: string; unit: string; field: string; language: string;
  text: string; generatedText: string; editedAt: string | null;
  status: 'draft' | 'approved' | 'rejected'; note: string | null;
  flags: { rule: string; detail: string; severity: string }[];
  stale?: boolean;
};

/**
 * One editable field: the text, its counter, its flags, and the two actions a
 * person takes on it (approve, regenerate). Saves on blur, because a save
 * button per field on a page with forty of them is noise.
 */
export function AssetField({ asset, label, limit, multiline, onPatch, onRegenerate }: {
  asset: Asset; label: string; limit?: { max: number; hard: boolean }; multiline?: boolean;
  onPatch: (patch: any) => Promise<Asset | null>;
  onRegenerate: (constraint: string) => Promise<void>;
}) {
  const [text, setText] = useState(asset.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [constraint, setConstraint] = useState('');

  const len = text.length;
  const over = limit && len > limit.max;
  const violations = asset.flags?.filter((f) => f.severity === 'violation') || [];
  const warnings = asset.flags?.filter((f) => f.severity === 'warning') || [];

  async function save() {
    if (text === asset.text) return;
    setSaving(true); setError(null);
    const updated = await onPatch({ text });
    if (updated) setText(updated.text);
    setSaving(false);
  }

  async function setStatus(status: string) {
    setError(null);
    const updated = await onPatch({ status });
    if (!updated) setError('Could not change the status');
  }

  return (
    <div className={`asset-field ${asset.status} ${over ? 'over' : ''}`}>
      <div className="af-head">
        <span className="line-label">{label}</span>
        {asset.editedAt && <span className="af-tag edited" title={`Edited ${new Date(asset.editedAt).toLocaleString('en-GB')}`}>edited</span>}
        {asset.stale && <span className="af-tag stale" title="A later generation produced different text; yours was kept">newer version available</span>}
        {asset.status === 'approved' && <span className="af-tag approved">approved</span>}
      </div>

      {multiline ? (
        <textarea value={text} rows={Math.min(14, Math.max(3, Math.ceil(text.length / 60)))}
          onChange={(e) => setText(e.target.value)} onBlur={save} disabled={saving} />
      ) : (
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={save} disabled={saving} />
      )}

      <div className="af-foot">
        {limit && <span className={`count ${over ? (limit.hard ? 'over' : 'warn') : ''}`}>{len}/{limit.max}</span>}
        {violations.map((f, i) => <span key={i} className="af-flag violation">{f.rule}: {f.detail}</span>)}
        {warnings.map((f, i) => <span key={i} className="af-flag warning">{f.rule}: {f.detail}</span>)}
        <span className="af-actions">
          <button type="button" className="mini-copy" onClick={() => setAsking((a) => !a)}>Rewrite</button>
          {asset.status === 'approved'
            ? <button type="button" className="mini-copy" onClick={() => setStatus('draft')}>Unapprove</button>
            : <button type="button" className="mini-copy" onClick={() => setStatus('approved')} disabled={violations.length > 0}
                title={violations.length ? 'Fix the violation first' : 'Approve this line'}>Approve</button>}
        </span>
      </div>

      {asking && (
        <div className="af-ask">
          <input value={constraint} onChange={(e) => setConstraint(e.target.value)} placeholder="shorter · more direct · lead with the number"
            onKeyDown={(e) => { if (e.key === 'Enter') { setAsking(false); onRegenerate(constraint); } }} />
          <button type="button" className="btn-secondary" onClick={() => { setAsking(false); onRegenerate(constraint); }}>Rewrite</button>
        </div>
      )}
      {error && <p className="af-error">{error}</p>}
      {asset.stale && asset.generatedText !== asset.text && (
        <details className="af-diff"><summary>What the latest generation produced</summary><p>{asset.generatedText}</p></details>
      )}
    </div>
  );
}
