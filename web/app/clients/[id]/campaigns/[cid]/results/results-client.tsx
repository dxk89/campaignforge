'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VerdictsPanel } from '@/components/LandingPanel';

export default function ResultsClient({ clientId, campaignId, initial, learnings, hasExperiments }: any) {
  const router = useRouter();
  const [state, setState] = useState<any>(initial);
  const [mapping, setMapping] = useState<any>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [source, setSource] = useState('linkedin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);

  async function upload(file: File, withMapping?: any) {
    setBusy(true); setError(null);
    const form = new FormData();
    form.append('file', file);
    form.append('source', source);
    if (withMapping) form.append('mapping', JSON.stringify(withMapping));
    const res = await fetch(`/api/clients/${clientId}/campaigns/${campaignId}/results`, { method: 'POST', body: form });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error || 'Upload failed'); return; }
    if (data.needsMapping) { setMapping({ ...data.suggested, _columns: data.columns, _sample: data.sample }); setPending(file); return; }
    setMapping(null); setPending(null);
    const fresh = await (await fetch(`/api/clients/${clientId}/campaigns/${campaignId}/results`)).json();
    setState(fresh);
    router.refresh();
  }

  async function propose() {
    setBusy(true);
    const res = await fetch(`/api/clients/${clientId}/campaigns/${campaignId}/learnings`, { method: 'POST' });
    const data = await res.json();
    setBusy(false);
    if (res.ok) { setAnalysis(data); router.refresh(); }
    else setError(data.error);
  }

  async function setStatus(learningId: string, status: string) {
    await fetch(`/api/clients/${clientId}/learnings/${learningId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  const cols: string[] = mapping?._columns || [];

  return (
    <>
      <section className="block">
        <h2 className="block-title">Upload</h2>
        <div className="inline-add">
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {['linkedin', 'meta', 'google', 'email', 'crm', 'manual'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="asset-btn">
            <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} disabled={busy} />
            <span>{busy ? 'Reading…' : 'Choose a CSV'}</span>
          </label>
        </div>
        <p className="site-hint">The column mapping is asked for once per source and remembered.</p>
        {error && <p className="source-error">{error}</p>}
      </section>

      {mapping && (
        <section className="block">
          <h2 className="block-title">Which column is which?</h2>
          <table className="grid-table"><tbody>
            {['variant', 'impressions', 'clicks', 'conversions', 'spend'].map((k) => (
              <tr key={k}>
                <td className="mono">{k}</td>
                <td>
                  <select value={mapping[k] || ''} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value })}>
                    <option value="">—</option>
                    {cols.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="muted">{mapping[k] ? String(mapping._sample?.[0]?.[mapping[k]] ?? '') : ''}</td>
              </tr>
            ))}
          </tbody></table>
          <button className="btn-secondary" style={{ marginTop: 10 }} disabled={busy || !mapping.variant}
            onClick={() => pending && upload(pending, Object.fromEntries(Object.entries(mapping).filter(([k]) => !k.startsWith('_'))))}>
            Use this mapping
          </button>
        </section>
      )}

      {state?.verdicts?.length ? (
        <section className="block">
          <VerdictsPanel verdicts={state.verdicts} summary={state.summary} />
          {state.results?.[state.results.length - 1]?.unmatched?.length ? (
            <p className="refusal" style={{ marginTop: 10 }}>
              <strong>Unmatched rows, kept:</strong> {state.results[state.results.length - 1].unmatched.join(', ')}.
              These did not match an asset by tracking tag or by text, so they are excluded from the verdicts.
            </p>
          ) : null}
          {hasExperiments && (
            <button className="btn-primary" style={{ width: 'auto', marginTop: 12 }} onClick={propose} disabled={busy}>
              {busy ? 'Reading the results…' : 'Propose learnings'}
            </button>
          )}
        </section>
      ) : null}

      {analysis && (
        <section className="block">
          <h2 className="block-title">What the analyst refused to conclude</h2>
          {(analysis.refusals || []).map((r: any, i: number) => (
            <div className="refusal" key={i}><strong>{r.experiment}:</strong> {r.why} <em>{r.would_decide}</em></div>
          ))}
          {(analysis.confounds || []).map((c: string, i: number) => <p className="snote" key={i}>{c}</p>)}
        </section>
      )}

      <section className="block">
        <h2 className="block-title">Learnings <span className="block-hint">approved ones enter every future campaign for this client</span></h2>
        {!learnings.length && <p className="muted">None yet. Upload results and ask for learnings.</p>}
        {learnings.map((l: any) => (
          <div className={`learning ${l.status}`} key={l.learningId}>
            <div>{l.statement}</div>
            <div className="boundary"><strong>Boundary:</strong> {l.boundary}</div>
            {l.hypothesis ? <div className="hyp"><strong>Hypothesis, not shown:</strong> {l.hypothesis}</div> : null}
            <div className="claim-meta">
              {l.evidence?.metric}: {l.evidence?.value} · {l.evidence?.sample} · {l.evidence?.confidence}
            </div>
            <div className="claim-actions">
              {l.status !== 'approved' && <button className="mini-copy" onClick={() => setStatus(l.learningId, 'approved')}>Approve</button>}
              {l.status === 'approved' && <button className="mini-copy" onClick={() => setStatus(l.learningId, 'proposed')}>Withdraw</button>}
              {l.status !== 'rejected' && <button className="mini-copy" onClick={() => setStatus(l.learningId, 'rejected')}>Reject</button>}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
