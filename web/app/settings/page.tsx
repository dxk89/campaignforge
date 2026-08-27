import Link from 'next/link';
import { readFileSync } from 'fs';
import path from 'path';
import { redirect } from 'next/navigation';
import { currentSession } from '@/server/auth';
import { storeEnabled } from '@/server/firebase';
import { listClients } from '@/server/db';

const images = require('@core/images');
const { MOCK } = require('@core/claude');

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const session = await currentSession();
  if (!session) redirect('/login');
  const clients = await listClients();

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
          <div><dt>Signed in</dt><dd>{session.email}</dd></div>
          <div><dt>Store</dt><dd>{storeEnabled ? 'Firebase' : 'In memory (no FIREBASE_SERVICE_ACCOUNT); nothing survives a restart'}</dd></div>
          <div><dt>Model calls</dt><dd>{MOCK ? 'Mock fixtures (MOCK_CLAUDE=1)' : 'Live'}</dd></div>
          <div><dt>Images</dt><dd>{images.available() ? 'Available' : 'Off (no GEMINI_API_KEY)'}</dd></div>
        </dl>
        <p className="muted" style={{ marginTop: 8 }}><Link href="/ledger">View the ledger →</Link></p>
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
        <pre className="data-handling">{dataHandling}</pre>
      </section>
    </main>
  );
}
