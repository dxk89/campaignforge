import { guarded, bad } from '@/server/respond';
import { addVersion, addLedger, getCampaign, currentOutputs, proposeClaim } from '@/server/db';
import { buildInputs, rulesFor } from '@/server/inputs';
import { explode, fieldsOfAssets, fieldsOfSocial, listAssets } from '@/server/assets';

const orchestrator = require('@core/agents/orchestrator');

export const runtime = 'nodejs';
export const maxDuration = 800;

/**
 * Run one agent. Inputs are assembled server-side from stored artifacts, the
 * result is persisted as a version before the response returns, and the cost
 * goes to the ledger. A closed tab loses nothing.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; cid: string; agent: string }> }) {
  const { id, cid, agent } = await params;
  return guarded(async (session) => {
    const ws = session.workspaceId;
    const body = await req.json().catch(() => ({}));
    const campaign = await getCampaign(ws, id, cid);
    if (!campaign) throw bad('Campaign not found', 404);

    // Skip conditions are decided here, not by the browser, so a resumed run
    // makes the same decisions as a fresh one.
    if (agent === 'customer-researcher' && !campaign.brief.webResearch) {
      return { agent, skipped: true, reason: 'Online research is off for this campaign' };
    }
    if (agent === 'localiser' && !campaign.brief.languages?.includes('pt')) {
      return { agent, skipped: true, reason: 'Portuguese is not requested' };
    }

    // Refuse before spending if the month's ceiling would be passed.
    const { checkCeiling } = await import('@/server/spend');
    const ceiling = await checkCeiling(ws, agent);
    const { count } = await import('@/server/telemetry');
    await count(ws, `run.${agent}`);

    const { inputs, inputsHash } = await buildInputs(ws, id, cid, agent);
    if (body.constraint) (inputs as any).constraint = String(body.constraint);

    const outputs = await currentOutputs(ws, id, cid);
    const parent = outputs[agent]?.versionId ?? null;

    const result = await orchestrator.runAgent(agent, inputs);

    const version = await addVersion(ws, id, cid, {
      agent,
      output: result.output,
      inputsHash,
      promptVersion: result.promptVersion ?? null,
      model: result.usage.model || 'unknown',
      usage: result.usage,
      trace: result.trace || [],
      complete: result.complete,
      problems: result.problems || [],
      parentVersionId: parent,
      changeNote: body.changeNote ?? null,
    });

    await addLedger(ws, {
      clientId: id, campaignId: cid, agent, model: result.usage.model || 'unknown',
      input: result.usage.input || 0, output: result.usage.output || 0,
      webSearches: result.usage.webSearches || 0, images: 0, costEur: result.usage.costEur || 0,
    });

    // Research proposes claims; a person approves them. Nothing is auto-approved.
    if (agent === 'brand-analyst' && (result.output as any)?.proof_points) {
      for (const pp of (result.output as any).proof_points) {
        if (pp?.claim) await proposeClaim(ws, id, { text: pp.claim, source: pp.source || 'research', span: pp.span ?? null, campaignId: cid });
      }
    }

    // Explode writer output into the editable layer. An edited asset keeps its
    // text and is marked stale rather than being overwritten.
    let assets = null;
    if (result.output) {
      const rules = await rulesFor(ws, id, cid);
      if (agent === 'copywriter') assets = await explode(ws, id, cid, version.versionId, fieldsOfAssets(result.output), 'en', rules);
      else if (agent === 'localiser') assets = await explode(ws, id, cid, version.versionId, fieldsOfAssets(result.output), 'pt', rules);
      else if (agent === 'social-planner') assets = await explode(ws, id, cid, version.versionId, fieldsOfSocial(result.output), 'en', rules);
      else if (agent === 'landing-writer') {
        const { fieldsOfLanding } = await import('@/server/assets');
        assets = await explode(ws, id, cid, version.versionId, fieldsOfLanding(result.output), 'en', rules);
      }
    }

    // The editor's verdict on what was actually saved, for the writers only.
    let review = null;
    const kind = ({ copywriter: 'assets', 'social-planner': 'social', localiser: 'localised', strategist: 'strategy', 'landing-writer': 'landing' } as Record<string, string>)[agent];
    if (kind && result.output && body.review !== false) {
      try {
        review = await orchestrator.review(kind, result.output, { ws, brief: (inputs as any).brief, context: (inputs as any).context, audience: (inputs as any).audience, rules: await rulesFor(ws, id, cid) });
        if (review?.usage) {
          await addLedger(ws, {
            clientId: id, campaignId: cid, agent: 'critic', model: review.usage.model || 'unknown',
            input: review.usage.input || 0, output: review.usage.output || 0,
            webSearches: 0, images: 0, costEur: review.usage.costEur || 0,
          });
        }
      } catch (err: any) {
        // The editor is advisory. A failure must not lose the writer's work.
        console.warn('[review] failed:', err.message);
      }
    }

    return {
      agent, versionId: version.versionId, output: result.output,
      usage: result.usage, complete: result.complete, problems: result.problems || [],
      assets: assets?.length ?? 0, review, warning: ceiling.warning,
    };
  });
}
