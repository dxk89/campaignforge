'use client';

import { useState } from 'react';

export default function PromptsClient({ agents, editable }: { agents: any[]; editable: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [role, setRole] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load(agent: string) {
    if (open === agent) { setOpen(null); return; }
    setOpen(agent); setDetail(null); setMsg(null);
    const d = await (await fetch(`/api/prompts/${agent}`)).json();
    setDetail(d);
    setRole(d.stored?.role || d.codeRole);
  }

  async function save() {
    if (!note.trim()) { setMsg('A change note is required.'); return; }
    setBusy(true);
    const res = await fetch(`/api/prompts/${open}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role, changeNote: note }),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(res.ok ? 'Saved as a new version. Run the evals before you rely on it.' : data.error);
    if (res.ok) { setNote(''); load(open!); load(open!); }
  }

  async function revert(versionId: string | null) {
    setBusy(true);
    await fetch(`/api/prompts/${open}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId }) });
    setBusy(false);
    setMsg(versionId ? 'Reverted to that version.' : 'Reverted to the code default.');
    load(open!); load(open!);
  }

  return (
    <div className="library">
      {agents.map((a) => (
        <section className="block" key={a.name}>
          <h2 className="block-title" style={{ cursor: 'pointer' }} onClick={() => load(a.name)}>
            {a.name} <span className="block-hint">{a.model}{a.tools.length ? ` · ${a.tools.join(', ')}` : ''}</span>
          </h2>
          {open === a.name && (
            detail ? (
              <>
                {detail.stored && <p className="af-tag edited" style={{ display: 'inline-block' }}>overridden</p>}
                <textarea rows={16} value={role} onChange={(e) => setRole(e.target.value)} disabled={!editable}
                  style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 12.5, padding: 10, border: '1px solid var(--line)', borderRadius: 4 }} />
                {editable && (
                  <div className="inline-add" style={{ marginTop: 8 }}>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why" />
                    <button className="btn-secondary" onClick={save} disabled={busy}>Save version</button>
                    {detail.stored && <button className="btn-secondary" onClick={() => revert(null)} disabled={busy}>Use code default</button>}
                  </div>
                )}
                {msg && <p className="snote">{msg}</p>}
                {detail.versions?.length ? (
                  <div style={{ marginTop: 10 }}>
                    <h3 className="claim-head">history</h3>
                    <ul className="claim-list">
                      {detail.versions.map((v: any) => (
                        <li className="claim" key={v.versionId}>
                          <div className="claim-text">{v.changeNote}</div>
                          <div className="claim-meta">{new Date(v.createdAt).toLocaleString('en-GB')}{v.versionId === detail.stored?.current ? ' · current' : ''}</div>
                          {v.versionId !== detail.stored?.current && (
                            <div className="claim-actions"><button className="mini-copy" onClick={() => revert(v.versionId)}>Use this</button></div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : <p className="muted">Loading…</p>
          )}
        </section>
      ))}
    </div>
  );
}
