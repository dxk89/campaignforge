import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { currentSession } from '@/server/auth';
import { getClient, getCampaign, currentOutputs } from '@/server/db';
import { listResults, listLearnings } from '@/server/resultsStore';
import ResultsClient from './results-client';

export const dynamic = 'force-dynamic';

export default async function ResultsPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const session = await currentSession();
  if (!session) redirect('/login');
  const { id, cid } = await params;
  const [client, campaign] = await Promise.all([getClient(session.workspaceId, id), getCampaign(session.workspaceId, id, cid)]);
  if (!client || !campaign) notFound();
  const [results, learnings, outputs] = await Promise.all([
    listResults(session.workspaceId, id, cid),
    listLearnings(session.workspaceId, id),
    currentOutputs(session.workspaceId, id, cid),
  ]);
  const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

  return (
    <main className="shell">
      <p className="muted">
        <Link href="/clients">Clients</Link> · <Link href={`/clients/${id}`}>{client.name}</Link> ·{' '}
        <Link href={`/clients/${id}/campaigns/${cid}`}>{campaign.brief.productName}</Link>
      </p>
      <h1>Results</h1>
      <p className="muted">Upload what the platforms report. The verdicts are computed here, not asserted by a model.</p>
      <ResultsClient
        clientId={id} campaignId={cid}
        initial={plain(results)}
        learnings={plain(learnings)}
        hasExperiments={Boolean((outputs['ops-architect']?.output as any)?.experiments?.length)}
      />
    </main>
  );
}
