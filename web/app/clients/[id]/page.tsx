import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getClient, listSources, listCampaigns } from '@/server/db';
import { currentSession } from '@/server/auth';
import Library from './library';

export const dynamic = 'force-dynamic';

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentSession())) redirect('/login');
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  const [sources, campaigns] = await Promise.all([listSources(id), listCampaigns(id)]);

  return (
    <main className="shell">
      <p className="muted"><Link href="/clients">← Clients</Link></p>
      <h1>{client.name}</h1>
      <p className="muted">{client.domain || 'No website recorded'}</p>
      <Library client={JSON.parse(JSON.stringify(client))} sources={JSON.parse(JSON.stringify(sources))} campaigns={JSON.parse(JSON.stringify(campaigns))} />
    </main>
  );
}
