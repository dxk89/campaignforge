'use client';

import { useState } from 'react';

export default function Ceiling({ initial }: { initial: any }) {
  const [ceiling, setCeiling] = useState(initial.monthlyCeilingEur ?? '');
  const [action, setAction] = useState(initial.ceilingAction || 'refuse');
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    await fetch('/api/settings', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ monthlyCeilingEur: ceiling === '' ? null : Number(ceiling), ceilingAction: action }),
    });
    setSaved('Saved');
    setTimeout(() => setSaved(null), 1600);
  }

  return (
    <div className="field-row" style={{ alignItems: 'end' }}>
      <label className="field">
        <span>Ceiling in EUR (blank for none)</span>
        <input type="number" min="0" step="1" value={ceiling} onChange={(e) => setCeiling(e.target.value)} placeholder="e.g. 50" />
      </label>
      <label className="field">
        <span>When it is reached</span>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="refuse">Refuse the run</option>
          <option value="warn">Warn and continue</option>
        </select>
      </label>
      <div className="field">
        <button className="btn-secondary" onClick={save}>Save</button>
        {saved && <span className="muted" style={{ marginLeft: 8 }}>{saved}</span>}
      </div>
    </div>
  );
}
