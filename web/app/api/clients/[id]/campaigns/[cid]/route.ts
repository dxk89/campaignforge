import { guarded, bad } from '@/server/respond';
import { getCampaign, updateCampaign, currentOutputs, listLedger, ledgerTotals } from '@/server/db';
import { staleAgents } from '@/server/inputs';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async () => {
    const campaign = await getCampaign(id, cid);
    if (!campaign) throw bad('Campaign not found', 404);
    const outputs = await currentOutputs(id, cid);
    const entries = (await listLedger()).filter((e) => e.campaignId === cid);

    const passes: Record<string, unknown> = {};
    const results: Record<string, unknown> = {};
    for (const [agent, v] of Object.entries(outputs)) {
      passes[agent] = { ...v.usage, complete: v.complete, problems: v.problems };
      results[agent] = v.output;
    }
    return {
      campaign, outputs: results, passes,
      stale: await staleAgents(id, cid),
      economics: { ...ledgerTotals(entries), passes },
    };
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async () => {
    const patch = await req.json();
    const clean: any = {};
    if (patch.brief) clean.brief = patch.brief;
    if (patch.status) clean.status = patch.status;
    const campaign = await updateCampaign(id, cid, clean);
    if (!campaign) throw bad('Campaign not found', 404);
    return { campaign };
  });
}
