/**
 * buildInputs: assemble an agent's inputs from what is already stored.
 *
 * The browser sends only the agent name. Everything else comes from the
 * campaign's current versions, the client library and memory, so a run cannot
 * be poisoned by a stale copy in a tab, and a resumed campaign picks up
 * exactly where it stopped.
 */
import { getClient, getCampaign, currentOutputs, listSources, hashOf } from './db';
import type { Version } from './types';

const research = require('@core/prompts/research');
const { buildRules } = require('@core/agents/packets');
const memory = require('@core/memory');

/** Which stored agents each agent depends on. Drives inputs and staleness. */
export const DEPENDS: Record<string, string[]> = {
  'brand-analyst': [],
  'customer-researcher': ['brand-analyst'],
  strategist: ['brand-analyst', 'customer-researcher'],
  copywriter: ['strategist', 'brand-analyst', 'customer-researcher'],
  'social-planner': ['strategist', 'copywriter', 'brand-analyst', 'customer-researcher'],
  'ops-architect': ['strategist', 'copywriter', 'brand-analyst', 'customer-researcher'],
  localiser: ['copywriter', 'brand-analyst'],
  'landing-writer': ['strategist', 'copywriter', 'ops-architect', 'brand-analyst'],
};

export type BuiltInputs = { inputs: Record<string, unknown>; inputsHash: string };

/**
 * The compliance rules for this campaign: the client's avoid terms, its
 * competitors, the brand spelling, and the approved claims when a registry
 * exists. Used by the asset flags and by the Critic.
 */
export async function rulesFor(ws: string, clientId: string, campaignId: string) {
  const [client, campaign, outputs] = await Promise.all([
    getClient(ws, clientId), getCampaign(ws, clientId, campaignId), currentOutputs(ws, clientId, campaignId),
  ]);
  const context: any = outputs['brand-analyst']?.output ?? null;
  // Client voice rules, edited by a person, take precedence over what research proposed.
  const merged = context ? { ...context } : { voice: {}, competitors: [] };
  if (client?.voice?.avoidTerms?.length) merged.voice = { ...(merged.voice || {}), avoid_terms: client.voice.avoidTerms };
  const claims = await memory.approvedClaims({ ws, clientId });
  return buildRules({ ...(campaign?.brief || {}), clientName: client?.name }, merged, claims);
}

export async function buildInputs(ws: string, clientId: string, campaignId: string, agent: string): Promise<BuiltInputs> {
  const [client, campaign, outputs] = await Promise.all([
    getClient(ws, clientId), getCampaign(ws, clientId, campaignId), currentOutputs(ws, clientId, campaignId),
  ]);
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });

  /**
   * A dependency's output, or a 409 saying which pass to run first.
   *
   * Checks the output, not just the record. A pass that runs but never calls
   * submit - it exhausted its call budget, say - is recorded with its cost
   * and problems and a null output, which is correct: invariant 2 says an
   * ungated output is never accepted. But the record exists, so testing the
   * record alone returned null as though it were the assets, and the next
   * pass died on it with "Cannot read properties of null (reading 'meta')".
   * A TypeError naming a channel is a poor way to learn the copy pass did not
   * finish.
   */
  const need = (a: string, label: string) => {
    const v = outputs[a];
    if (!v || v.output == null) {
      throw Object.assign(new Error(`${label} has not been generated yet`), { status: 409 });
    }
    return v.output as any;
  };

  const brief = { ...campaign.brief, clientName: client.name };
  const context = outputs['brand-analyst']?.output ?? null;
  const audience = outputs['customer-researcher']?.output ?? null;
  const brandKit = client.brandKit;

  let inputs: Record<string, unknown>;
  switch (agent) {
    case 'brand-analyst': {
      const sources = await listSources(ws, clientId, true);
      inputs = {
        brief, clientId, ws,
        sources: sources.map((s) => ({ name: s.name, kind: s.kind, text: s.text })),
        webResearch: Boolean(campaign.brief.webResearch),
        companyUrl: client.domain ? `https://${client.domain}` : undefined,
      };
      break;
    }
    case 'customer-researcher':
      inputs = { brief, clientId, ws, context: context ?? research.emptyContext(), webResearch: true };
      break;
    case 'strategist':
      inputs = { brief, clientId, ws, context, audience };
      break;
    case 'copywriter':
      inputs = { brief, clientId, ws, context, audience, strategy: need('strategist', 'The strategy') };
      break;
    case 'social-planner':
      inputs = { brief, clientId, ws, context, audience, brandKit, strategy: need('strategist', 'The strategy'), assets: need('copywriter', 'The asset set') };
      break;
    case 'ops-architect':
      inputs = {
        brief, clientId, ws, context, audience,
        strategy: need('strategist', 'The strategy'), assets: need('copywriter', 'The asset set'),
        landingUrl: campaign.brief.landingUrl ?? client.settings.landingUrl ?? undefined,
      };
      break;
    case 'landing-writer':
      inputs = {
        brief, clientId, ws, context, audience,
        strategy: need('strategist', 'The strategy'),
        assets: need('copywriter', 'The asset set'),
        activation: need('ops-architect', 'The activation plan'),
      };
      break;
    case 'localiser': {
      // Portuguese is adapted from the *edited* English, not from what the
      // model first wrote. That is the whole point of the editable layer.
      const { composeAssets } = await import('./assets');
      const english = await composeAssets(ws, clientId, campaignId, 'en', need('copywriter', 'The asset set'));
      inputs = { brief, clientId, ws, context, assets: english, glossary: (context as any)?.glossary ?? client.voice.glossary ?? [] };
      break;
    }
    default:
      throw Object.assign(new Error(`Unknown agent "${agent}"`), { status: 404 });
  }

  // The hash covers the brief and the upstream version ids, so any upstream
  // regeneration marks this agent stale without hashing whole documents.
  const upstream = (DEPENDS[agent] || []).map((a) => outputs[a]?.versionId ?? null);
  return { inputs, inputsHash: hashOf({ brief: campaign.brief, upstream }) };
}

/** Agents whose stored version was produced from inputs that have since changed. */
export async function staleAgents(ws: string, clientId: string, campaignId: string): Promise<string[]> {
  const [campaign, outputs] = await Promise.all([getCampaign(ws, clientId, campaignId), currentOutputs(ws, clientId, campaignId)]);
  if (!campaign) return [];
  const stale: string[] = [];
  for (const [agent, version] of Object.entries(outputs as Record<string, Version>)) {
    const upstream = (DEPENDS[agent] || []).map((a) => (outputs as any)[a]?.versionId ?? null);
    if (version.inputsHash !== hashOf({ brief: campaign.brief, upstream })) stale.push(agent);
  }
  return stale;
}
