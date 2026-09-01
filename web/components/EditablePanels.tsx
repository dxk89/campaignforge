'use client';

import { useCallback, useEffect, useState } from 'react';
import { AssetField, type Asset } from './AssetEditor';
import { CopyButton } from './Counter';
import { LIMITS } from './format';

/**
 * The editing view of a campaign's assets. Reads the asset documents rather
 * than the pass output, because the documents carry the edits, the flags and
 * the approval state.
 */
export function useAssets(clientId: string, campaignId: string, language: string) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [approval, setApproval] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/campaigns/${campaignId}/assets?language=${language}`);
    const data = await res.json();
    setAssets(data.assets || []);
    setApproval(data.approval || null);
    setLoading(false);
  }, [clientId, campaignId, language]);

  useEffect(() => { load(); }, [load]);

  const patch = useCallback(async (assetId: string, body: any): Promise<Asset | null> => {
    const res = await fetch(`/api/clients/${clientId}/campaigns/${campaignId}/assets/${encodeURIComponent(assetId)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return null;
    setAssets((prev) => prev.map((a) => (a.assetId === assetId ? data.asset : a)));
    load();
    return data.asset;
  }, [clientId, campaignId, load]);

  /**
   * A rewrite is a live model call, and it fails for reasons a person can act
   * on: the rewrite came back over the limit (422), or the month's ceiling
   * refused the spend (402). This used to fire the request and ignore the
   * response, so a failure looked exactly like nothing happening. It returns
   * the message now and the field shows it.
   */
  const regenerate = useCallback(async (assetId: string, constraint: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/clients/${clientId}/campaigns/${campaignId}/regenerate`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: 'asset', target: assetId, constraint }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        return body?.error || `The rewrite failed (${res.status}).`;
      }
      await load();
      return null;
    } catch {
      return 'The rewrite could not be sent. Check your connection and try again.';
    }
  }, [clientId, campaignId, load]);

  return { assets, approval, loading, patch, regenerate, reload: load };
}

export function ApprovalBar({ approval, onApproveAll }: { approval: any; onApproveAll?: () => void }) {
  if (!approval?.total) return null;
  const pct = Math.round((approval.approved / approval.total) * 100);
  return (
    <div className="approval-bar">
      <span className="mono">{approval.approved}/{approval.total} approved</span>
      <div className="bar"><span style={{ width: `${pct}%` }} /></div>
      {approval.violations > 0 && <span className="af-flag violation">{approval.violations} with violations</span>}
      {onApproveAll && !approval.ready && (
        <button type="button" className="btn-secondary" onClick={onApproveAll} disabled={approval.violations > 0}
          title={approval.violations ? 'Fix the violations first' : 'Approve everything clean'}>Approve all clean</button>
      )}
    </div>
  );
}

export function EditorVerdict({ review }: { review: any }) {
  if (!review || review.verdict === 'pass') {
    return review ? <div className="editor-verdict">The editor passed this set.</div> : null;
  }
  return (
    <div className="editor-verdict">
      <strong>The editor asks for {review.must_fix.length} change{review.must_fix.length === 1 ? '' : 's'}:</strong>
      <ul>
        {review.must_fix.map((m: any, i: number) => (
          <li key={i}><code>{m.path}</code> {m.problem} <span className="why">{m.why}</span></li>
        ))}
      </ul>
      {review.suggestions?.length ? (
        <details><summary>{review.suggestions.length} suggestion{review.suggestions.length === 1 ? '' : 's'}</summary>
          <ul>{review.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></details>
      ) : null}
    </div>
  );
}

const byUnit = (assets: Asset[], channel: string) => {
  const groups = new Map<string, Asset[]>();
  for (const a of assets.filter((x) => x.channel === channel)) {
    if (!groups.has(a.unit)) groups.set(a.unit, []);
    groups.get(a.unit)!.push(a);
  }
  return [...groups.entries()];
};

const labels: Record<string, string> = {
  primary_text: 'Primary text', headline: 'Headline', description: 'Description',
  intro_text: 'Intro text', subject: 'Subject', preview_text: 'Preview text', body: 'Body',
  branch_note: 'Branch note', text: 'Post', cta: 'CTA',
};

export function EditableChannel({ assets, channel, title, ctx }: {
  assets: Asset[]; channel: string; title: string;
  ctx: { patch: (id: string, b: any) => Promise<Asset | null>; regenerate: (id: string, c: string) => Promise<string | null> };
}) {
  const groups = byUnit(assets, channel);
  if (!groups.length) return <p className="muted">Nothing generated for this channel yet.</p>;

  return (
    <>
      {groups.map(([unit, fields]) => (
        <article className="card" key={unit}>
          <div className="card-head">
            <span className="card-title">{title} · {unit}</span>
            <CopyButton text={fields.map((f) => f.text).join('\n')} />
          </div>
          <div className="card-body">
            {fields.map((a) => {
              const base = a.field.split('.')[0];
              const limit = channel === 'google'
                ? (base === 'headline' ? LIMITS.google.headline : LIMITS.google.description)
                : (LIMITS as any)[channel]?.[base];
              const label = channel === 'google'
                ? `${labels[base] || base} ${Number(a.field.split('.')[1] || 0) + 1}`
                : labels[base] || base;
              return (
                <AssetField key={a.assetId} asset={a} label={label} limit={limit}
                  multiline={base === 'body' || base === 'primary_text' || base === 'intro_text' || base === 'text' || base === 'branch_note'}
                  onPatch={(p) => ctx.patch(a.assetId, p)}
                  onRegenerate={(c) => ctx.regenerate(a.assetId, c)} />
              );
            })}
          </div>
        </article>
      ))}
    </>
  );
}
