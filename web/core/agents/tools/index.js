/**
 * Tools agents can call. Each is { name, description, input_schema, run }.
 * `run(input, packet)` gets the agent's packet so tools can reach the brief,
 * context, brand kit and rules without the agent re-sending them.
 *
 * The validators here are the same functions the runtime uses as submit
 * gates. An agent that calls them mid-run just sees the failure earlier.
 */

const { validateAssets, validateSocial, LIMITS, SOCIAL_LIMITS } = require('../../limits');
const { validateActivation } = require('../../prompts/activation');
const { checkCompliance } = require('./compliance');
const { extractUrl } = require('../../sources');
const { scanSite } = require('../../scraper');
const { trackingPlan } = require('../../utm');
const { renderGraphic, TEMPLATES } = require('../../graphics');
const { generateImage, available: imagesAvailable } = require('../../images');

const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: true });

const check_limits = {
  name: 'check_limits',
  description: 'Check a campaign asset set (meta, linkedin, google, email) against every character and count limit. Returns issues; empty means clean.',
  input_schema: obj({ assets: { type: 'object' }, language: { type: 'string', enum: ['en', 'pt'] } }, ['assets']),
  run: ({ assets, language = 'en' }) => ({ issues: validateAssets(assets, language), limits: LIMITS }),
};

const check_social_limits = {
  name: 'check_social_limits',
  description: 'Check a social calendar (posts[]) against per-channel limits: X 280 including hashtags, LinkedIn 3000, Instagram 2200; counts and hashtags. Returns issues; empty means clean.',
  input_schema: obj({ posts: { type: 'array' } }, ['posts']),
  run: ({ posts }) => ({ issues: validateSocial({ posts }, 'en'), limits: SOCIAL_LIMITS }),
};

const check_compliance = {
  name: 'check_compliance',
  description: "Scan any output for the client's avoid terms, competitor names, superlatives, placeholders, brand-name casing, unapproved claims (when an approved list exists) and Brazilian Portuguese forms (when language is pt). Returns flags; violations must be fixed, warnings are advisory.",
  input_schema: obj({ output: { type: 'object' }, language: { type: 'string', enum: ['en', 'pt'] } }, ['output']),
  run: ({ output, language = 'en' }, packet) => ({ flags: checkCompliance(output, { ...(packet.rules || {}), language }) }),
};

const validate_activation = {
  name: 'validate_activation',
  description: 'Structural check of an activation plan: unique step ids, branches point at real steps, workflow terminates, lead score threshold reachable, KPI tree reaches pipeline or revenue. Returns problems; empty means sound.',
  input_schema: obj({ activation: { type: 'object' } }, ['activation']),
  run: ({ activation }) => ({ problems: validateActivation(activation) }),
};

const fetch_url = {
  name: 'fetch_url',
  description: 'Fetch a web page and return its readable text (capped). Use to read a source in full when a snippet is not enough.',
  input_schema: obj({ url: { type: 'string' } }, ['url']),
  run: async ({ url }) => { const s = await extractUrl(url); return { url: s.name, chars: s.chars, text: s.text.slice(0, 12000) }; },
};

const scan_site = {
  name: 'scan_site',
  description: "Crawl a website's important pages (up to 8) for text and extract a brand kit (palette, fonts, logo). Returns sources[] and brandKit.",
  input_schema: obj({ url: { type: 'string' }, maxPages: { type: 'integer' } }, ['url']),
  run: async ({ url, maxPages }) => { const r = await scanSite(url, { maxPages }); return { brandKit: r.brandKit, sources: r.sources.map((s) => ({ name: s.name, chars: s.chars, text: s.text.slice(0, 6000) })) }; },
};

const utm_plan = {
  name: 'utm_plan',
  description: 'Generate the deterministic UTM tracking plan for an asset set. Use when you need the exact campaign name or content tags to reference.',
  input_schema: obj({}),
  run: (_, packet) => trackingPlan(packet.brief, packet.assets || {}, null, packet.landingUrl),
};

const render_card = {
  name: 'render_card',
  description: `Render a social graphic from a template and slots in the client's brand kit. Templates: ${TEMPLATES.join(', ')}. Returns the SVG length and whether any slot text was truncated.`,
  input_schema: obj({ graphic: obj({ template: { type: 'string' }, kicker: { type: 'string' }, headline: { type: 'string' }, body: {}, footer: { type: 'string' } }, ['template', 'headline']) }, ['graphic']),
  run: ({ graphic }, packet) => { const svg = renderGraphic(graphic, packet.brandKit, 0); return { ok: true, chars: svg.length, truncated: svg.includes('…') }; },
};

const generate_image = {
  name: 'generate_image',
  description: 'Generate a picture from a visual brief using the image model, guided by the brand kit. Costs money; only when asked to. Returns a data URL.',
  input_schema: obj({ prompt: { type: 'string' }, aspect: { type: 'string', enum: ['1:1', '4:5', '16:9'] } }, ['prompt']),
  run: async ({ prompt, aspect }, packet) => {
    if (!imagesAvailable()) return { error: 'image generation is not configured' };
    const r = await generateImage({ prompt, brandKit: packet.brandKit, aspect });
    return { image: `data:${r.mime};base64,${r.data}`, usage: r.usage };
  },
};

const ask_critic = {
  name: 'ask_critic',
  description: 'Ask the editor to review your draft before you submit it. Returns must_fix items you must fix and suggestions you may take or leave. Call this once, on your near-final draft.',
  input_schema: obj({ output: { type: 'object' }, kind: { type: 'string', enum: ['assets', 'social', 'strategy', 'localised', 'landing'] } }, ['output', 'kind']),
  run: async ({ output, kind }, packet) => {
    // Lazy require: the orchestrator requires the roster, which requires this file.
    const orchestrator = require('../orchestrator');
    const r = await orchestrator.runAgent('critic', {
      ws: packet.ws, output, kind, brief: packet.brief, context: packet.context, audience: packet.audience, rules: packet.rules,
    });
    return { verdict: r.output?.verdict, must_fix: r.output?.must_fix || [], suggestions: r.output?.suggestions || [], usage: r.usage };
  },
};

const TOOLS = { ask_critic, check_limits, check_social_limits, check_compliance, validate_activation, fetch_url, scan_site, utm_plan, render_card, generate_image };

module.exports = { TOOLS, ...TOOLS };
