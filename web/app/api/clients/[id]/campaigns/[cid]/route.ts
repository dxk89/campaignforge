import { guarded, bad } from '@/server/respond';
import { getCampaign, updateCampaign, currentOutputs, listLedger, ledgerTotals, getClient, deleteCampaign } from '@/server/db';
import { staleAgents } from '@/server/inputs';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => {
    const campaign = await getCampaign(session.workspaceId, id, cid);
    if (!campaign) throw bad('Campaign not found', 404);
    const outputs = await currentOutputs(session.workspaceId, id, cid);
    const entries = (await listLedger(session.workspaceId)).filter((e) => e.campaignId === cid);

    const passes: Record<string, unknown> = {};
    const results: Record<string, unknown> = {};
    for (const [agent, v] of Object.entries(outputs)) {
      passes[agent] = { ...v.usage, complete: v.complete, problems: v.problems };
      results[agent] = v.output;
    }
    return {
      campaign, outputs: results, passes,
      stale: await staleAgents(session.workspaceId, id, cid),
      economics: { ...ledgerTotals(entries), passes },
    };
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => {
    const patch = await req.json();
    const clean: any = {};
    if (patch.brief) clean.brief = patch.brief;
    if (patch.status) clean.status = patch.status;
    const campaign = await updateCampaign(session.workspaceId, id, cid, clean);
    if (!campaign) throw bad('Campaign not found', 404);
    return { campaign };
  });
}

/**
 * Remove one campaign and everything it generated.
 *
 * The lock lives on the client rather than the campaign, so locking the
 * client protects its campaigns too. One flag on the thing a person actually
 * curates is easier to reason about than a flag on every campaign under it.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => {
    const ws = session.workspaceId;
    const [client, campaign] = await Promise.all([getClient(ws, id), getCampaign(ws, id, cid)]);
    if (!client) throw bad('Client not found', 404);
    if (!campaign) throw bad('Campaign not found', 404);
    if (client.locked) throw bad('This client is locked, so its campaigns cannot be deleted. Unlock it first.', 409);
    await deleteCampaign(ws, id, cid);
    return { deleted: cid };
  });
}
