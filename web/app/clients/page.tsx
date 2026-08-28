import Link from 'next/link';
import { listClients } from '@/server/db';
import { currentSession } from '@/server/auth';
import { redirect } from 'next/navigation';
import NewClient from './new-client';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  const clients = await listClients(session.workspaceId);

  return (
    <main className="shell">
      <h1>Clients</h1>
      <p className="muted">One operator, many clients. Everything a campaign knows about a company lives in its library.</p>

      <NewClient />

      {clients.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>No clients yet. Add one from a website above.</p>
      ) : (
        <ul className="client-list">
          {clients.map((c) => (
            <li key={c.clientId}>
              <Link href={`/clients/${c.clientId}`}>{c.name}</Link>
              <span className="muted">{c.domain || '—'}</span>
              <span className="mono muted">{new Date(c.updatedAt).toLocaleDateString('en-GB')}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
