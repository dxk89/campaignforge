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

/** Which stored agents each agent depends on. Drives inputs and staleness. */
export const DEPENDS: Record<string, string[]> = {
  'brand-analyst': [],
  'customer-researcher': ['brand-analyst'],
  strategist: ['brand-analyst', 'customer-researcher'],
  copywriter: ['strategist', 'brand-analyst', 'customer-researcher'],
  'social-planner': ['strategist', 'copywriter', 'brand-analyst', 'customer-researcher'],
  'ops-architect': ['strategist', 'copywriter', 'brand-analyst', 'customer-researcher'],
  localiser: ['copywriter', 'brand-analyst'],
};

export type BuiltInputs = { inputs: Record<string, unknown>; inputsHash: string };

export async function buildInputs(clientId: string, campaignId: string, agent: string): Promise<BuiltInputs> {
  const [client, campaign, outputs] = await Promise.all([
    getClient(clientId), getCampaign(clientId, campaignId), currentOutputs(clientId, campaignId),
  ]);
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });

  const need = (a: string, label: string) => {
    const v = outputs[a];
    if (!v) throw Object.assign(new Error(`${label} has not been generated yet`), { status: 409 });
    return v.output as any;
  };

  const brief = { ...campaign.brief, clientName: client.name };
  const context = outputs['brand-analyst']?.output ?? null;
  const audience = outputs['customer-researcher']?.output ?? null;
  const brandKit = client.brandKit;

  let inputs: Record<string, unknown>;
  switch (agent) {
    case 'brand-analyst': {
      const sources = await listSources(clientId, true);
      inputs = {
        brief, clientId,
        sources: sources.map((s) => ({ name: s.name, kind: s.kind, text: s.text })),
        webResearch: Boolean(campaign.brief.webResearch),
        companyUrl: client.domain ? `https://${client.domain}` : undefined,
      };
      break;
    }
    case 'customer-researcher':
      inputs = { brief, clientId, context: context ?? research.emptyContext(), webResearch: true };
      break;
    case 'strategist':
      inputs = { brief, clientId, context, audience };
      break;
    case 'copywriter':
      inputs = { brief, clientId, context, audience, strategy: need('strategist', 'The strategy') };
      break;
    case 'social-planner':
      inputs = { brief, clientId, context, audience, brandKit, strategy: need('strategist', 'The strategy'), assets: need('copywriter', 'The assets') };
      break;
    case 'ops-architect':
      inputs = {
        brief, clientId, context, audience,
        strategy: need('strategist', 'The strategy'), assets: need('copywriter', 'The assets'),
        landingUrl: campaign.brief.landingUrl ?? client.settings.landingUrl ?? undefined,
      };
      break;
    case 'localiser':
      inputs = { brief, clientId, context, assets: need('copywriter', 'The assets'), glossary: (context as any)?.glossary ?? client.voice.glossary ?? [] };
      break;
    default:
      throw Object.assign(new Error(`Unknown agent "${agent}"`), { status: 404 });
  }

  // The hash covers the brief and the upstream version ids, so any upstream
  // regeneration marks this agent stale without hashing whole documents.
  const upstream = (DEPENDS[agent] || []).map((a) => outputs[a]?.versionId ?? null);
  return { inputs, inputsHash: hashOf({ brief: campaign.brief, upstream }) };
}

/** Agents whose stored version was produced from inputs that have since changed. */
export async function staleAgents(clientId: string, campaignId: string): Promise<string[]> {
  const [campaign, outputs] = await Promise.all([getCampaign(clientId, campaignId), currentOutputs(clientId, campaignId)]);
  if (!campaign) return [];
  const stale: string[] = [];
  for (const [agent, version] of Object.entries(outputs as Record<string, Version>)) {
    const upstream = (DEPENDS[agent] || []).map((a) => (outputs as any)[a]?.versionId ?? null);
    if (version.inputsHash !== hashOf({ brief: campaign.brief, upstream })) stale.push(agent);
  }
  return stale;
}
