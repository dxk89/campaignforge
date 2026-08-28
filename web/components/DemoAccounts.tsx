'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Owner-only panel for interviewer demo accounts: list, create, revoke.
 *
 * This is presentation only. The route it talks to (/api/admin/accounts)
 * enforces requireOwner() itself, so hiding this panel from non-owners is a
 * courtesy, not the access control. The generated password is shown exactly
 * once, straight from the create response, because the store only ever keeps
 * a hash: there is no "forgot the password, show it again" path by design.
 */
type Account = {
  id: string;
  username: string;
  workspaceId: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB') : 'Never');

export default function DemoAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<{ username: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/accounts');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load accounts');
      setAccounts(data.accounts || []);
    } catch (err: any) {
      setError(err.message || 'Could not load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create the account');
      setJustCreated({ username: data.account.username, password: data.password });
      setUsername('');
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not create the account');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not revoke the account');
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not revoke the account');
    }
  }

  return (
    <section className="block">
      <h2 className="block-title">Demo accounts</h2>
      <p className="muted">One username and password per interviewer. Revoke when the interview is over.</p>

      {justCreated && (
        <div className="brief-status" style={{ marginTop: 12 }}>
          <strong>{justCreated.username}</strong> created. Password: <code>{justCreated.password}</code>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            This is shown once and cannot be retrieved again. Copy it now.
          </p>
        </div>
      )}

      {error && <p className="form-error" style={{ marginTop: 12 }}>{error}</p>}

      <div className="field-row" style={{ marginTop: 12, alignItems: 'end' }}>
        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. interviewer1"
            disabled={creating}
          />
        </label>
        <div className="field">
          <button className="btn-primary" onClick={create} disabled={creating || !username.trim()}>
            {creating ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted" style={{ marginTop: 12 }}>Loading accounts…</p>
      ) : accounts.length ? (
        <table className="grid-table" style={{ marginTop: 12 }}><tbody>
          <tr><th>Username</th><th>Created</th><th>Last seen</th><th>Status</th><th /></tr>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td>{a.username}</td>
              <td>{fmt(a.createdAt)}</td>
              <td>{fmt(a.lastSeenAt)}</td>
              <td>{a.revokedAt ? <span className="muted">Revoked {fmt(a.revokedAt)}</span> : 'Active'}</td>
              <td>
                {!a.revokedAt && (
                  <button className="btn-secondary" onClick={() => revoke(a.id)}>Revoke</button>
                )}
              </td>
            </tr>
          ))}
        </tbody></table>
      ) : (
        <p className="muted" style={{ marginTop: 12 }}>No demo accounts yet.</p>
      )}
    </section>
  );
}
