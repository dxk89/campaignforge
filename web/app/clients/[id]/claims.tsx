'use client';

import { useEffect, useState } from 'react';

/**
 * The approved-claims registry.
 *
 * Research proposes; a person decides. Only approved, unexpired claims reach
 * the writers, and once any claim is approved the compliance scanner treats an
 * unsupported number as a violation rather than a warning. That escalation is
 * the reason this panel matters more than it looks.
 */
export default function Claims({ clientId }: { clientId: string }) {
  const [claims, setClaims] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await fetch(`/api/clients/${clientId}/claims`);
    setClaims((await r.json()).claims || []);
  };
  useEffect(() => { load(); }, [clientId]);

  async function patch(claimId: string, body: any) {
    setBusy(true);
    await fetch(`/api/clients/${clientId}/claims/${claimId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    await load();
    setBusy(false);
  }

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    await fetch(`/api/clients/${clientId}/claims`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), source: 'added by hand' }),
    });
    setText('');
    await load();
    setBusy(false);
  }

  const groups = {
    proposed: claims.filter((c) => c.status === 'proposed'),
    approved: claims.filter((c) => c.status === 'approved'),
    rejected: claims.filter((c) => c.status === 'rejected'),
    expired: claims.filter((c) => c.status === 'expired'),
  };

  return (
    <section className="block">
      <h2 className="block-title">
        Claims <span className="block-hint">only approved claims reach the copy</span>
      </h2>
      {groups.approved.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>
          Nothing approved yet, so the writers fall back to the research pass&rsquo;s proof points and unsupported
          numbers are flagged as warnings. Approve one and they become violations that block approval.
        </p>
      )}

      <div className="inline-add" style={{ marginBottom: 10 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="A claim you can evidence, in the words the copy may use"
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button type="button" className="btn-secondary" onClick={add} disabled={busy}>Add</button>
      </div>

      {(['proposed', 'approved', 'rejected', 'expired'] as const).map((k) => groups[k].length ? (
        <div key={k} className="claim-group">
          <h3 className="claim-head">{k} <span className="mono">{groups[k].length}</span></h3>
          <ul className="claim-list">
            {groups[k].map((c) => (
              <li key={c.claimId} className={`claim ${c.status}`}>
                <div className="claim-text">{c.text}</div>
                <div className="claim-meta">
                  <span className="src">{c.source}</span>
                  {c.expiresAt && <span className="src"> · expires {new Date(c.expiresAt).toLocaleDateString('en-GB')}</span>}
                </div>
                <div className="claim-actions">
                  {c.status !== 'approved' && <button className="mini-copy" onClick={() => patch(c.claimId, { status: 'approved' })} disabled={busy}>Approve</button>}
                  {c.status === 'approved' && (
                    <>
                      <button className="mini-copy" onClick={() => {
                        const d = prompt('Expires on (YYYY-MM-DD), or blank for never');
                        patch(c.claimId, { expiresAt: d ? new Date(d).toISOString() : null });
                      }} disabled={busy}>Set expiry</button>
                      <button className="mini-copy" onClick={() => patch(c.claimId, { status: 'proposed' })} disabled={busy}>Withdraw</button>
                    </>
                  )}
                  {c.status !== 'rejected' && <button className="mini-copy" onClick={() => patch(c.claimId, { status: 'rejected' })} disabled={busy}>Reject</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null)}
    </section>
  );
}
