import { guarded, bad } from '@/server/respond';
import { addVersion, addLedger, getCampaign, currentOutputs } from '@/server/db';
import { buildInputs } from '@/server/inputs';

const orchestrator = require('@core/agents/orchestrator');

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Run one agent. Inputs are assembled server-side from stored artifacts, the
 * result is persisted as a version before the response returns, and the cost
 * goes to the ledger. A closed tab loses nothing.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; cid: string; agent: string }> }) {
  const { id, cid, agent } = await params;
  return guarded(async () => {
    const body = await req.json().catch(() => ({}));
    const campaign = await getCampaign(id, cid);
    if (!campaign) throw bad('Campaign not found', 404);

    // Skip conditions are decided here, not by the browser, so a resumed run
    // makes the same decisions as a fresh one.
    if (agent === 'customer-researcher' && !campaign.brief.webResearch) {
      return { agent, skipped: true, reason: 'Online research is off for this campaign' };
    }
    if (agent === 'localiser' && !campaign.brief.languages?.includes('pt')) {
      return { agent, skipped: true, reason: 'Portuguese is not requested' };
    }

    const { inputs, inputsHash } = await buildInputs(id, cid, agent);
    if (body.constraint) (inputs as any).constraint = String(body.constraint);

    const outputs = await currentOutputs(id, cid);
    const parent = outputs[agent]?.versionId ?? null;

    const result = await orchestrator.runAgent(agent, inputs);

    const version = await addVersion(id, cid, {
      agent,
      output: result.output,
      inputsHash,
      promptVersion: null,
      model: result.usage.model || 'unknown',
      usage: result.usage,
      trace: result.trace || [],
      complete: result.complete,
      problems: result.problems || [],
      parentVersionId: parent,
      changeNote: body.changeNote ?? null,
    });

    await addLedger({
      clientId: id, campaignId: cid, agent, model: result.usage.model || 'unknown',
      input: result.usage.input || 0, output: result.usage.output || 0,
      webSearches: result.usage.webSearches || 0, images: 0, costEur: result.usage.costEur || 0,
    });

    return {
      agent, versionId: version.versionId, output: result.output,
      usage: result.usage, complete: result.complete, problems: result.problems || [],
    };
  });
}
