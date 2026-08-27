import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getClient, getCampaign, currentOutputs, listLedger, ledgerTotals } from '@/server/db';
import { staleAgents } from '@/server/inputs';
import { currentSession } from '@/server/auth';
import Workbench from './workbench';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  if (!(await currentSession())) redirect('/login');
  const { id, cid } = await params;
  const [client, campaign] = await Promise.all([getClient(id), getCampaign(id, cid)]);
  if (!client || !campaign) notFound();

  const outputs = await currentOutputs(id, cid);
  const stale = await staleAgents(id, cid);
  const entries = (await listLedger()).filter((e) => e.campaignId === cid);

  // Resolve versions into the plain shapes the panels expect.
  const results: Record<string, unknown> = {};
  const passes: Record<string, unknown> = {};
  for (const [agent, v] of Object.entries(outputs)) {
    results[agent] = v.output;
    passes[agent] = { ...v.usage, complete: v.complete, problems: v.problems };
  }

  const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

  return (
    <main className="workbench-page">
      <p className="muted crumbs">
        <Link href="/clients">Clients</Link> · <Link href={`/clients/${id}`}>{client.name}</Link>
      </p>
      <Workbench
        clientId={id}
        campaign={plain(campaign)}
        client={plain(client)}
        outputs={plain(results)}
        passes={plain(passes)}
        stale={stale}
        economics={plain(ledgerTotals(entries))}
      />
    </main>
  );
}
