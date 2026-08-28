/**
 * Orchestrator.
 *
 * Two jobs today:
 *   runAgent(name, inputs)   run one roster agent: load client memory, build
 *                            its packet, run it, return output + usage + trace
 *   runCampaign(brief)       the default plan: every agent in dependency
 *                            order, skipping what the brief doesn't need
 *
 * The browser drives runAgent one agent at a time (real progress, short
 * requests); scripts use runCampaign. Later the orchestrator becomes an agent
 * itself, taking natural-language asks and routing them; the plan below is
 * what it will start from.
 */

const { run } = require('./runtime');
const roster = require('./roster');
const { loadMemory } = require('./packets');
const { trackingPlan } = require('../utm');
const research = require('../prompts/research');
const { costEur } = require('../pricing');
const promptStore = require('../prompts/store');

const resolve = (v, inputs) => (typeof v === 'function' ? v(inputs) : v);

async function runAgent(name, inputs = {}, opts = {}) {
  const agent = roster.get(name);
  if (!agent) { const e = new Error(`unknown agent "${name}"`); e.status = 404; throw e; }

  const memory = await loadMemory({ ws: inputs.ws, clientId: inputs.clientId, agent: name, channel: inputs.channel, objective: inputs.brief?.objective });
  const packet = agent.packet({ ...inputs, memory });
  // A stored prompt version overrides the code default; which one was used is
  // recorded on the result so a campaign can be traced to its wording.
  const { role, promptVersion } = await promptStore.roleFor(name, resolve(agent.role, inputs), inputs.ws);
  const resolved = { ...agent, role, budget: resolve(agent.budget, inputs) };
  const result = await run(resolved, packet, { budget: opts.budget, ledger: opts.ledger });
  result.promptVersion = promptVersion;

  console.log(`[${name}] ${result.usage.input} in / ${result.usage.output} out, ${result.usage.calls || 1} call(s), ${result.usage.ms} ms, €${result.usage.costEur}${result.complete ? '' : ' INCOMPLETE: ' + result.problems.join('; ')}`);
  return result;
}

/** Sum per-agent usage for the footer. */
function summarise(passes, extra = {}) {
  const t = Object.values(passes).reduce((a, p) => ({ input: a.input + p.input, output: a.output + p.output, webSearches: a.webSearches + (p.webSearches || 0), costEur: a.costEur + (p.costEur || 0) }), { input: 0, output: 0, webSearches: 0, costEur: 0 });
  return { passes, inputTokens: t.input, outputTokens: t.output, totalTokens: t.input + t.output, webSearches: t.webSearches, costEur: Number(t.costEur.toFixed(4)), ...extra };
}

async function runCampaign(brief, opts = {}) {
  const started = Date.now();
  const passes = {};
  const problems = {};
  const keep = (key, r) => { passes[key] = r.usage; if (!r.complete) problems[key] = r.problems; return r.output; };

  const sources = brief.sources || [];
  const web = Boolean(brief.webResearch);

  const context = sources.length || web
    ? keep('research', await runAgent('brand-analyst', { brief, sources, webResearch: web, companyUrl: brief.companyUrl, clientId: brief.clientId }, opts))
    : research.emptyContext();

  const audience = web ? keep('audience', await runAgent('customer-researcher', { brief, context, clientId: brief.clientId }, opts)) : null;
  const strategy = keep('strategy', await runAgent('strategist', { brief, context, audience, clientId: brief.clientId }, opts));
  const assets = keep('assets', await runAgent('copywriter', { brief, strategy, context, audience, clientId: brief.clientId }, opts));
  const social = keep('social', await runAgent('social-planner', { brief, strategy, assets, context, audience, brandKit: brief.brandKit, clientId: brief.clientId }, opts));
  const activation = keep('activation', await runAgent('ops-architect', { brief, strategy, assets, context, audience, landingUrl: brief.landingUrl, clientId: brief.clientId }, opts));
  const localised = brief.languages?.includes('pt')
    ? keep('localise', await runAgent('localiser', { assets, glossary: context.glossary, brief, context, clientId: brief.clientId }, opts))
    : null;

  return {
    context, audience, strategy, assets, social, activation, localised,
    tracking: trackingPlan(brief, assets, localised, brief.landingUrl),
    problems,
    economics: summarise(passes, { generationMs: Date.now() - started, sourceChars: sources.reduce((n, s) => n + String(s.text || '').length, 0) }),
  };
}

/**
 * The final review. Writers call the Critic mid-run through ask_critic; this
 * is the separate gate the routes use after a writer returns, so a person sees
 * the editor's verdict on what was actually saved.
 */
async function review(kind, output, inputs = {}, opts = {}) {
  if (!output) return null;
  const r = await runAgent('critic', { ...inputs, output, kind }, opts);
  return { ...(r.output || { verdict: 'pass', must_fix: [], suggestions: [] }), usage: r.usage };
}

module.exports = { runAgent, runCampaign, summarise, review, roster: roster.agents };
