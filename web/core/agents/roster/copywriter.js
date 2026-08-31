const { MODELS } = require('../../pricing');
const prompt = require('../../prompts/assets');
const { contextBlock, buildRules } = require('../packets');
const { validateAssets, adChannelsFor, DEFAULT_AD_CHANNELS } = require('../../limits');
const { checkCompliance } = require('../tools/compliance');
const { check_limits, check_compliance, ask_critic } = require('../tools');

const AD = (props, req) => ({ type: 'object', properties: props, required: req });
const S = { type: 'string' };

module.exports = {
  name: 'copywriter',
  fixture: 'assets',
  model: MODELS.sonnet,
  role: ({ brief }) => prompt.systemPrompt({ channels: brief?.adChannels }).replace('Return ONLY a JSON object, no prose, no markdown, no code fences. Use this exact shape:', 'When every asset is within its limits and clean, call the submit tool with this shape:') +
    '\n\nBefore submitting, call check_limits and check_compliance on your draft and fix everything they report, then submit a clean set. ask_critic with kind "assets" is available and worth a call if the set is close but you are unsure of it; it is not required. Every turn is an API round trip of about forty seconds and the pass is stopped at four minutes, so spend them on getting the copy inside its limits first.',
  criticKind: 'assets',
  
  tools: [check_limits, check_compliance, ask_critic],
  budget: { maxTurns: 10, maxOutputTokens: 7000 },
  schema: (packet) => ({
    type: 'object',
    properties: {
      meta: { type: 'array', minItems: 3, maxItems: 3, items: AD({ primary_text: S, headline: S, description: S }, ['primary_text', 'headline', 'description']) },
      linkedin: { type: 'array', minItems: 3, maxItems: 3, items: AD({ intro_text: S, headline: S }, ['intro_text', 'headline']) },
      google: AD({ headlines: { type: 'array', minItems: 8, maxItems: 8, items: S }, descriptions: { type: 'array', minItems: 4, maxItems: 4, items: S } }, ['headlines', 'descriptions']),
      email: AD({ emails: { type: 'array', minItems: 3, maxItems: 3, items: AD({ subject: S, preview_text: S, body: S }, ['subject', 'preview_text', 'body']) }, branch_note: S }, ['emails', 'branch_note']),
    },
    required: adChannelsFor(packet?.brief?.adChannels),
  }),
  packet: ({ brief, strategy, context, audience, memory }) => ({
    user: prompt.userPrompt(brief, strategy, contextBlock(context, audience, memory)),
    brief, strategy, context, rules: buildRules(brief, context, memory?.approvedClaims),
  }),
  // Gate: hard limit breaches and compliance violations block; warnings pass through to the UI.
  validate: (o, packet) => {
    // A channel the campaign is not running is not a missing asset. The
    // schema still lists all four so the model gets one stable shape; the
    // brief decides which of them have to be filled.
    const wanted = adChannelsFor(packet.brief?.adChannels);
    const missing = wanted.filter((c) => !o[c]);
    const p = validateAssets(o, 'en').filter((i) => i.severity === 'violation').map((i) => `${i.channel} ${i.field}${i.index != null ? ' ' + (i.index + 1) : ''}: ${i.length}/${i.limit}${i.note ? ' (' + i.note + ')' : ''}`);
    const flags = checkCompliance(o, { ...packet.rules, language: 'en' });
    for (const f of flags) if (f.severity === 'violation' && (f.rule !== 'claim' || packet.rules.claimSeverity === 'violation')) p.push(`${f.path}: ${f.detail}`);
    if (missing.length) p.push(`missing ${missing.join(', ')}: the campaign runs ${wanted.join(', ')}`);
    // And extras are not a bonus. A live run asked for LinkedIn and email and
    // got Google as well: the schema requires only the chosen keys but does
    // not forbid the others, so nothing stopped it writing work nobody asked
    // for and paying for the tokens.
    const extra = DEFAULT_AD_CHANNELS.filter((c) => o[c] && !wanted.includes(c));
    if (extra.length) p.push(`remove ${extra.join(', ')}: this campaign runs ${wanted.join(', ')} only`);
    return p;
  },
};
