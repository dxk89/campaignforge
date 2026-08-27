/**
 * The prompt chain.
 *
 * Up to four sequential passes, each feeding the next:
 *   0. research   sources (+ optional web search) -> company context
 *   1. strategy   brief + context -> angles, hooks, key messages
 *   2. assets     brief + strategy + context -> all channel copy
 *   3. localise   assets + glossary -> pt-PT adaptation   (only if requested)
 *
 * Each pass is a plain function with explicit inputs and outputs, exposed
 * two ways:
 *   - POST /api/pass/<name>   one pass per request. The browser drives the
 *     chain, so progress is real (not polled) and each request is short
 *     enough for serverless hosts.
 *   - POST /api/generate      all passes in one request, for scripts and
 *     curl. Same functions, same output shape.
 *
 * The API key never leaves the server; intermediate JSON (strategy, assets)
 * round-trips through the browser, which is fine: it's the user's own copy.
 */

const { callJson } = require('./claude');
const { costEur, MODEL } = require('./pricing');
const { validateAssets } = require('./limits');

const research = require('./prompts/research');
const strategy = require('./prompts/strategy');
const assetsPrompt = require('./prompts/assets');
const localise = require('./prompts/localise');
const briefPrompt = require('./prompts/brief');
const activation = require('./prompts/activation');
const audience = require('./prompts/audience');
const social = require('./prompts/social');
const { validateSocial } = require('./limits');
const { renderGraphic } = require('./graphics');
const { trackingPlan } = require('./utm');

const OBJECTIVES = ['lead_generation', 'trial_signups', 'event_registrations', 'brand_awareness'];
const TONES = ['professional', 'direct', 'warm', 'provocative'];

/** Attach cost and timing to a pass's usage so the client can just sum. */
function withCost(result) {
  const u = result.usage;
  return { ...u, ms: result.ms, costEur: Number(costEur(u.input, u.output, u.webSearches || 0).toFixed(4)) };
}

/**
 * Validate the incoming brief before spending any tokens on it.
 * Returns an array of error strings; empty means valid.
 */
function validateBrief(brief) {
  const errors = [];
  for (const field of ['productName', 'productDescription', 'targetAudience', 'objective', 'tone']) {
    if (!brief[field] || typeof brief[field] !== 'string' || !brief[field].trim()) errors.push(`${field} is required`);
  }
  if (brief.objective && !OBJECTIVES.includes(brief.objective)) errors.push('objective is not a recognised value');
  if (brief.tone && !TONES.includes(brief.tone)) errors.push('tone is not a recognised value');
  if (!Array.isArray(brief.languages) || !brief.languages.includes('en')) errors.push('languages must include "en"');
  if (brief.sources && !Array.isArray(brief.sources)) errors.push('sources must be a list');
  return errors;
}

function normaliseSources(list) {
  return (list || []).map((s) => ({
    name: String(s.name || 'source'),
    kind: String(s.kind || 'paste'),
    text: String(s.text || ''),
  }));
}

// ---- Passes -----------------------------------------------------------------

/** Company context plus audience research, as one block for the writing passes. */
function contextBlock(context, aud) {
  const ctx = context || research.emptyContext();
  return [research.contextForPrompt(ctx), audience.audienceForPrompt(aud)].filter(Boolean).join('\n\n');
}

/** Pass 0. Returns the empty context (no call, no cost) when there is nothing to read. */
async function passResearch({ brief, sources, webResearch, companyUrl }) {
  const list = normaliseSources(sources);
  if (!list.length && !webResearch) {
    return { context: research.emptyContext(), usage: null, skipped: true };
  }
  const r = await callJson({
    system: research.systemPrompt({ webResearch: Boolean(webResearch) }),
    user: research.userPrompt(brief, list, { companyUrl }),
    maxTokens: 5000,
    label: 'research',
    webSearch: Boolean(webResearch),
    maxSearches: 5,
  });
  return { context: r.data, usage: withCost(r), sourceChars: list.reduce((n, s) => n + s.text.length, 0) };
}

/** Pass 0b. Understand the customer. Web search only; skipped otherwise. */
async function passAudience({ brief, context, webResearch }) {
  if (!webResearch) return { audience: null, usage: null, skipped: true };
  const r = await callJson({
    system: audience.systemPrompt(),
    user: audience.userPrompt(brief, context),
    maxTokens: 3000,
    label: 'audience',
    webSearch: true,
    maxSearches: 8,
  });
  return { audience: r.data, usage: withCost(r) };
}

/** Pass 1. */
async function passStrategy({ brief, context, audience: aud }) {
  const s = await callJson({
    system: strategy.systemPrompt(),
    user: strategy.userPrompt(brief, contextBlock(context, aud)),
    maxTokens: 1500,
    label: 'strategy',
  });
  // The asset pass executes lead_angle by name, so make sure it exists.
  const names = (s.data.angles || []).map((a) => a.name);
  if (!names.includes(s.data.lead_angle)) {
    console.warn(`[strategy] lead_angle "${s.data.lead_angle}" not in angles; defaulting to first`);
    s.data.lead_angle = names[0] || null;
  }
  return { strategy: s.data, usage: withCost(s) };
}

/** Pass 2. Validates limits in code after the model has been told them in the prompt. */
async function passAssets({ brief, strategy: strat, context, audience: aud }) {
  const a = await callJson({
    system: assetsPrompt.systemPrompt(),
    user: assetsPrompt.userPrompt(brief, strat, contextBlock(context, aud)),
    maxTokens: 6000, // 3 emails at ~150 words is most of this
    label: 'assets',
  });
  return { assets: a.data, issues: validateAssets(a.data, 'en'), usage: withCost(a) };
}

/** Pass 4. Lifecycle, handoff, measurement, experiments. UTMs are code, not model. */
async function passActivation({ brief, strategy: strat, assets, context, audience: aud, landingUrl }) {
  const a = await callJson({
    system: activation.systemPrompt(),
    user: activation.userPrompt(brief, strat, assets, contextBlock(context, aud)),
    maxTokens: 5000,
    label: 'activation',
  });
  return {
    activation: a.data,
    problems: activation.validateActivation(a.data),
    tracking: trackingPlan(brief, assets, null, landingUrl),
    usage: withCost(a),
  };
}

/** Pass 5. A month of social posts; graphics rendered in code from the brand kit. */
async function passSocial({ brief, strategy: strat, assets, context, audience: aud, brandKit }) {
  const ctx = context || research.emptyContext();
  const r = await callJson({
    system: social.systemPrompt(),
    user: social.userPrompt(brief, strat, assets, research.contextForPrompt(ctx), audience.audienceForPrompt(aud)),
    maxTokens: 12000, // 32 posts plus graphic specs
    label: 'social',
  });
  const cal = r.data || {};
  const kit = brandKit || { siteName: brief.clientName || brief.productName, palette: null, fonts: [] };
  let g = 0;
  cal.posts = (cal.posts || []).sort((a, b) => a.day - b.day).map((p) => {
    if (p.graphic && p.graphic.template) {
      p.graphic.svg = renderGraphic(p.graphic, kit, g++);
    }
    return p;
  });
  return { social: cal, issues: validateSocial(cal, 'en'), usage: withCost(r) };
}

/** Pass 3. */
async function passLocalise({ assets, glossary }) {
  const l = await callJson({
    system: localise.systemPrompt(),
    user: localise.userPrompt(assets, glossary || []),
    maxTokens: 6000,
    label: 'localise',
  });
  return { localised: l.data, issues: validateAssets(l.data, 'pt'), usage: withCost(l) };
}

// ---- Whole chain in one go ----------------------------------------------------

async function runChain(brief) {
  const started = Date.now();
  const passes = {};

  const r = await passResearch({ brief, sources: brief.sources, webResearch: brief.webResearch, companyUrl: brief.companyUrl });
  if (r.usage) passes.research = r.usage;

  const au = await passAudience({ brief, context: r.context, webResearch: brief.webResearch });
  if (au.usage) passes.audience = au.usage;

  const s = await passStrategy({ brief, context: r.context, audience: au.audience });
  passes.strategy = s.usage;

  const a = await passAssets({ brief, strategy: s.strategy, context: r.context, audience: au.audience });
  passes.assets = a.usage;
  const issues = [...a.issues];

  const so = await passSocial({ brief, strategy: s.strategy, assets: a.assets, context: r.context, audience: au.audience, brandKit: brief.brandKit });
  passes.social = so.usage;
  issues.push(...so.issues);

  const act = await passActivation({ brief, strategy: s.strategy, assets: a.assets, context: r.context, audience: au.audience, landingUrl: brief.landingUrl });
  passes.activation = act.usage;

  let localised = null;
  if (Array.isArray(brief.languages) && brief.languages.includes('pt')) {
    const l = await passLocalise({ assets: a.assets, glossary: r.context.glossary });
    passes.localise = l.usage;
    localised = l.localised;
    issues.push(...l.issues);
  }

  return {
    context: r.context,
    audience: au.audience,
    strategy: s.strategy,
    assets: a.assets,
    social: so.social,
    localised,
    activation: act.activation,
    activationProblems: act.problems,
    tracking: trackingPlan(brief, a.assets, localised, brief.landingUrl),
    issues,
    economics: summarise(passes, { generationMs: Date.now() - started, sourceChars: r.sourceChars || 0 }),
  };
}

/** Sum per-pass usage into the footer numbers. Also used by the client-driven flow. */
function summarise(passes, extra = {}) {
  const totals = Object.values(passes).reduce(
    (acc, p) => ({ input: acc.input + p.input, output: acc.output + p.output, webSearches: acc.webSearches + (p.webSearches || 0) }),
    { input: 0, output: 0, webSearches: 0 }
  );
  return {
    model: MODEL,
    passes,
    inputTokens: totals.input,
    outputTokens: totals.output,
    totalTokens: totals.input + totals.output,
    webSearches: totals.webSearches,
    costEur: Number(costEur(totals.input, totals.output, totals.webSearches).toFixed(4)),
    ...extra,
  };
}

// ---- Brief parse (outside the chain) --------------------------------------------

/**
 * Read a briefing document into brief fields. Runs on upload, before
 * Generate. Returns the fields plus the usage so the UI can count it.
 */
async function parseBrief(text) {
  const r = await callJson({
    system: briefPrompt.systemPrompt(),
    user: briefPrompt.userPrompt(text),
    maxTokens: 600,
    label: 'brief',
  });
  const f = r.data || {};
  return {
    fields: {
      productName: String(f.productName || ''),
      productDescription: String(f.productDescription || ''),
      targetAudience: String(f.targetAudience || ''),
      objective: OBJECTIVES.includes(f.objective) ? f.objective : '',
      tone: TONES.includes(f.tone) ? f.tone : '',
      languages: Array.isArray(f.languages) ? f.languages.filter((l) => ['en', 'pt'].includes(l)) : ['en'],
      notes: String(f.notes || ''),
    },
    usage: withCost(r),
  };
}

module.exports = { validateBrief, passResearch, passAudience, passStrategy, passAssets, passSocial, passActivation, passLocalise, runChain, summarise, parseBrief };
