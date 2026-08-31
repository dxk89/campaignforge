import { redirect } from 'next/navigation';
import { currentSession } from '@/server/auth';
import { listClients } from '@/server/db';
import Clinic from './clinic';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Check copy' };

/**
 * The checks, over copy no agent wrote.
 *
 * The client list is fetched here rather than in the component so the page
 * renders with it already present: picking a client is what turns a partial
 * check into a full one, and a select that populates a moment later gets
 * missed.
 */
export default async function CheckPage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  const clients = await listClients(session.workspaceId);
  return (
    <main className="shell">
      <h1>Check copy</h1>
      <p className="muted" style={{ marginTop: 6, maxWidth: '60ch' }}>
        Every check the campaign passes run, over any text you paste. It reports and you decide:
        nothing here is rewritten, and nothing is saved.
      </p>
      <Clinic clients={clients.map((c) => ({ clientId: c.clientId, name: c.name }))} />
    </main>
  );
}
