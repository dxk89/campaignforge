import { guarded, bad } from '@/server/respond';
import { getClient, currentOutputs, addVersion, addLedger, getCampaign } from '@/server/db';
import { getAsset, putAsset, listAssets, ruleFor, flagsFor, explode, fieldsOfAssets, fieldsOfSocial } from '@/server/assets';
import { buildInputs, rulesFor } from '@/server/inputs';

const orchestrator = require('@core/agents/orchestrator');

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Regenerate at one of three scopes.
 *
 *   asset    one field, by the small field-editor, gated by its own limit
 *   channel  the writer again, told to change one channel and leave the rest
 *   agent    a full re-run with a constraint; downstream goes stale as usual
 *
 * Every scope writes a version with the previous one as its parent, so the
 * chain of what changed and why is readable afterwards.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async () => {
    const { scope, target, constraint } = await req.json();
    if (!scope || !target) throw bad('scope and target are required');
    const { checkCeiling } = await import('@/server/spend');
    await checkCeiling(scope === 'asset' ? 'field-editor' : target);
    const { count } = await import('@/server/telemetry');
    await count(`regenerate.${scope}`);
    const rules = await rulesFor(id, cid);

    if (scope === 'asset') {
      const asset = await getAsset(id, cid, target);
      if (!asset) throw bad('Asset not found', 404);
      const [client, outputs, all] = await Promise.all([getClient(id), currentOutputs(id, cid), listAssets(id, cid)]);
      const rule = ruleFor(asset.channel, asset.unit, asset.field);
      const siblings = all.filter((a) => a.channel === asset.channel && a.unit === asset.unit && a.assetId !== asset.assetId)
        .map((a) => ({ field: a.field, text: a.text }));

      const r = await orchestrator.runAgent('field-editor', {
        asset, rule, constraint, siblings,
        strategy: outputs.strategist?.output, voice: client?.voice,
      });
      await addLedger({
        clientId: id, campaignId: cid, agent: 'field-editor', model: r.usage.model || 'unknown',
        input: r.usage.input || 0, output: r.usage.output || 0, webSearches: 0, images: 0, costEur: r.usage.costEur || 0,
      });
      if (!r.complete) throw bad(`Could not rewrite within the limit: ${r.problems.join('; ')}`, 422);

      const text = String((r.output as any).text);
      const updated = {
        ...asset, text, editedAt: new Date().toISOString(), status: 'draft' as const, approvedAt: null, stale: false,
        flags: flagsFor({ channel: asset.channel, unit: asset.unit, field: asset.field, text }, asset.language, rules),
      };
      await putAsset(id, cid, updated);
      return { scope, asset: updated, note: (r.output as any).note || '', usage: r.usage };
    }

    if (scope === 'channel' || scope === 'agent') {
      const agent = scope === 'agent' ? target : 'copywriter';
      const { inputs, inputsHash } = await buildInputs(id, cid, agent);
      const outputs = await currentOutputs(id, cid);
      const instruction = scope === 'channel'
        ? `Regenerate the ${target} assets only. ${constraint || ''} Every other channel must come back byte-identical to what you are given:\n${JSON.stringify(outputs.copywriter?.output ?? {}, null, 2)}`
        : constraint || '';
      if (instruction) (inputs as any).constraint = instruction;

      const r = await orchestrator.runAgent(agent, inputs);
      const version = await addVersion(id, cid, {
        agent, output: r.output, inputsHash, promptVersion: null, model: r.usage.model || 'unknown',
        usage: r.usage, trace: r.trace || [], complete: r.complete, problems: r.problems || [],
        parentVersionId: outputs[agent]?.versionId ?? null,
        changeNote: `${scope}: ${target}${constraint ? ` — ${constraint}` : ''}`,
      });
      await addLedger({
        clientId: id, campaignId: cid, agent, model: r.usage.model || 'unknown',
        input: r.usage.input || 0, output: r.usage.output || 0,
        webSearches: r.usage.webSearches || 0, images: 0, costEur: r.usage.costEur || 0,
      });
      if (r.output) {
        const fields = agent === 'social-planner' ? fieldsOfSocial(r.output) : fieldsOfAssets(r.output);
        await explode(id, cid, version.versionId, fields, agent === 'localiser' ? 'pt' : 'en', rules);
      }
      return { scope, target, versionId: version.versionId, output: r.output, usage: r.usage, complete: r.complete, problems: r.problems };
    }

    throw bad('scope must be asset, channel or agent');
  });
}
