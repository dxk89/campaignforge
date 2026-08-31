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
  // agent.packet() returns whatever hand-picked subset of inputs that roster
  // file chose to keep; ws is forced onto the result afterwards rather than
  // relying on every packet() to remember to forward it. Without this, a new
  // roster agent that adds ask_critic and writes its own packet() inherits a
  // silent trap: nothing catches a missing ws in mock mode or in any test,
  // because promptStore.roleFor only throws once a store is configured, so
  // the failure appears solely in a Firestore-backed deployment. This is the
  // single place that builds a packet from inputs, so it is the one place
  // that can guarantee this instead of leaving it to per-agent discipline.
  // A pass that must emit one enormous document re-emits all of it on every
  // fix round. The social planner wrote 28 posts per call and spent 23,224
  // output tokens across four calls to correct a handful of captions, because
  // a single over-limit line costs a whole month of regeneration. An agent
  // that declares chunks is run once per chunk instead: each call is small
  // enough to be quick, and a fix round re-emits only its own chunk.
  if (agent.chunks) return runChunked(agent, name, inputs, memory, opts);

  const packet = { ...agent.packet({ ...inputs, memory }), ws: inputs.ws };
  // A stored prompt version overrides the code default; which one was used is
  // recorded on the result so a campaign can be traced to its wording.
  const { role, promptVersion } = await promptStore.roleFor(name, resolve(agent.role, inputs), inputs.ws);
  const resolved = { ...agent, role, budget: resolve(agent.budget, inputs) };
  const result = await run(resolved, packet, { budget: opts.budget, ledger: opts.ledger });
  result.promptVersion = promptVersion;

  console.log(`[${name}] ${result.usage.input} in / ${result.usage.output} out, ${result.usage.calls || 1} call(s), ${result.usage.ms} ms, €${result.usage.costEur}${result.complete ? '' : ' INCOMPLETE: ' + result.problems.join('; ')}`);
  return result;
}

/**
 * Run an agent once per chunk and merge the results into one pass.
 *
 * The pass still looks like a single pass to everything downstream: one
 * version, one ledger entry, one set of problems. What changes is that the
 * model is asked for a seventh of the work at a time, so a correction costs a
 * seventh of the tokens. Chunks run in sequence rather than in parallel
 * because they share the campaign's spend ceiling and a burst of concurrent
 * calls is exactly what a rate limit punishes.
 */
async function runChunked(agent, name, inputs, memory, opts) {
  // A fixture is a whole campaign, not a chunk of one, so mock mode runs a
  // single pass and returns it as the pass's output. Chunking four fixtures
  // together would produce four months of posts and prove nothing.
  const chunks = process.env.MOCK_CLAUDE === '1' ? [agent.chunks(inputs)[0]] : agent.chunks(inputs);
  const outputs = [];
  const usage = { input: 0, output: 0, webSearches: 0, calls: 0, ms: 0, costEur: 0 };
  const trace = [];
  const problems = [];
  let promptVersion = null;
  let model;

  for (const chunk of chunks) {
    const scoped = { ...inputs, chunk };
    const packet = { ...agent.packet({ ...scoped, memory }), ws: inputs.ws };
    const roleFor = await promptStore.roleFor(name, resolve(agent.role, scoped), inputs.ws);
    promptVersion = roleFor.promptVersion;
    const resolved = { ...agent, role: roleFor.role, budget: resolve(agent.budget, scoped) };
    // The ledger is written once for the whole pass, so the per-chunk hook is
    // deliberately not forwarded: four entries for one pass would double-count
    // it in every total on the page.
    const r = await run(resolved, packet, { budget: opts.budget });

    if (r.output) outputs.push(r.output);
    for (const k of ['input', 'output', 'webSearches', 'calls', 'ms']) usage[k] += r.usage[k] || 0;
    usage.costEur += r.usage.costEur || 0;
    model = r.usage.model || model;
    trace.push(...(r.trace || []).map((t) => ({ ...t, chunk: chunk.label || chunk.week })));
    if (!r.complete) problems.push(...(r.problems || []).map((x) => `${chunk.label || 'chunk ' + chunk.week}: ${x}`));
  }

  usage.costEur = Number(usage.costEur.toFixed(4));
  usage.model = model;
  const merged = outputs.length ? (chunks.length === 1 ? outputs[0] : agent.merge(outputs, inputs)) : null;
  const result = {
    output: problems.length && !merged ? null : merged,
    usage, trace, problems,
    complete: problems.length === 0 && Boolean(merged),
    promptVersion,
  };
  opts.ledger?.({ agent: name, ...usage });
  console.log(`[${name}] ${chunks.length} chunks, ${usage.input} in / ${usage.output} out, ${usage.calls} call(s), €${usage.costEur}${result.complete ? '' : ' INCOMPLETE: ' + problems.join('; ')}`);
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
