import { guarded, bad } from '@/server/respond';
import { getCampaign, addLedger } from '@/server/db';
import { listResults, addLearnings } from '@/server/resultsStore';

const orchestrator = require('@core/agents/orchestrator');

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Turn the latest results and their verdicts into proposed learnings. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => {
    const ws = session.workspaceId;
    const [campaign, results] = await Promise.all([getCampaign(ws, id, cid), listResults(ws, id, cid)]);
    if (!results.results.length) throw bad('Upload results before asking for learnings', 409);
    const latest = results.results[results.results.length - 1];

    const r = await orchestrator.runAgent('analyst', {
      ws, verdicts: latest.verdicts, rows: latest.rows, campaign: campaign?.brief,
    });
    await addLedger(ws, {
      clientId: id, campaignId: cid, agent: 'analyst', model: r.usage.model || 'unknown',
      input: r.usage.input || 0, output: r.usage.output || 0, webSearches: 0, images: 0, costEur: r.usage.costEur || 0,
    });

    const proposed = await addLearnings(ws, id, (r.output as any)?.learnings || [], cid, latest.resultId);
    return {
      learnings: proposed,
      refusals: (r.output as any)?.refusals || [],
      confounds: (r.output as any)?.confounds || [],
      complete: r.complete, problems: r.problems, usage: r.usage,
    };
  });
}
