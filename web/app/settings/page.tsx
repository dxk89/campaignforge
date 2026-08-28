import Link from 'next/link';
import { readFileSync } from 'fs';
import path from 'path';
import { redirect } from 'next/navigation';
import { currentSession } from '@/server/auth';
import { storeEnabled } from '@/server/firebase';
import { listClients } from '@/server/db';
import { getSettings } from '@/server/spend';
import { read as readTelemetry } from '@/server/telemetry';
import Ceiling from './ceiling';
import DemoAccounts from '@/components/DemoAccounts';

const images = require('@core/images');
const { MOCK } = require('@core/claude');

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const session = await currentSession();
  if (!session) redirect('/login');
  const [clients, settings, telemetry] = await Promise.all([
    listClients(session.workspaceId),
    getSettings(),
    readTelemetry(session.workspaceId),
  ]);
  const counters = Object.entries(telemetry.counters as Record<string, number>).sort((a, b) => b[1] - a[1]);

  let dataHandling = '';
  try {
    dataHandling = readFileSync(path.join(process.cwd(), '..', 'docs', 'DATA-HANDLING.md'), 'utf8');
  } catch {
    dataHandling = 'The data-handling statement is in docs/DATA-HANDLING.md in the repository.';
  }

  return (
    <main className="shell">
      <p className="muted"><Link href="/clients">← Clients</Link></p>
      <h1>Settings</h1>

      <section className="block">
        <h2 className="block-title">Status</h2>
        <dl className="kv">
          <div><dt>Signed in</dt><dd>{session.username}</dd></div>
          <div><dt>Store</dt><dd>{storeEnabled ? 'Firebase' : 'In memory (no FIREBASE_SERVICE_ACCOUNT); nothing survives a restart'}</dd></div>
          <div><dt>Model calls</dt><dd>{MOCK ? 'Mock fixtures (MOCK_CLAUDE=1)' : 'Live'}</dd></div>
          <div><dt>Images</dt><dd>{images.available() ? 'Available' : 'Off (no GEMINI_API_KEY)'}</dd></div>
        </dl>
        <p className="muted" style={{ marginTop: 8 }}><Link href="/ledger">View the ledger →</Link></p>
      </section>

      {session.kind === 'owner' && (
        <section className="block">
          <h2 className="block-title">Monthly ceiling</h2>
          <p className="muted">The ledger shows spend after the fact. This refuses before it.</p>
          <Ceiling initial={JSON.parse(JSON.stringify(settings))} />
        </section>
      )}

      <section className="block">
        <h2 className="block-title">Usage this month <span className="block-hint">{telemetry.month}</span></h2>
        {counters.length ? (
          <table className="grid-table"><tbody>
            <tr><th>What</th><th>Count</th></tr>
            {counters.slice(0, 20).map(([k, v]) => <tr key={k}><td className="mono">{k}</td><td className="num">{v}</td></tr>)}
          </tbody></table>
        ) : <p className="muted">Nothing recorded yet.</p>}
      </section>

      {session.kind === 'owner' && <DemoAccounts />}

      <section className="block">
        <h2 className="block-title">Prompts</h2>
        <p className="muted">
          Every agent&rsquo;s role, editable as a version with a change note.{' '}
          <Link href="/prompts">Open prompts →</Link>
        </p>
      </section>

      <section className="block">
        <h2 className="block-title">Export</h2>
        <p className="muted">Everything held about a client, as JSON plus its files.</p>
        <ul className="client-list">
          {clients.map((c) => (
            <li key={c.clientId}>
              <span>{c.name}</span><span />
              <a className="btn-secondary" href={`/api/export/${c.clientId}`}>Export</a>
            </li>
          ))}
          {!clients.length && <li className="muted">No clients yet.</li>}
        </ul>
      </section>

      <section className="block">
        <h2 className="block-title">Data handling</h2>
        <pre id="data-handling" className="data-handling">{dataHandling}</pre>
      </section>
    </main>
  );
}
