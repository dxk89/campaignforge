const { MODELS } = require('../../pricing');
const prompt = require('../../prompts/assets');
const { contextBlock, buildRules } = require('../packets');
const { validateAssets } = require('../../limits');
const { checkCompliance } = require('../tools/compliance');
const { check_limits, check_compliance } = require('../tools');

const AD = (props, req) => ({ type: 'object', properties: props, required: req });
const S = { type: 'string' };

module.exports = {
  name: 'copywriter',
  fixture: 'assets',
  model: MODELS.sonnet,
  role: prompt.systemPrompt().replace('Return ONLY a JSON object, no prose, no markdown, no code fences. Use this exact shape:', 'When every asset is within its limits and clean, call the submit tool with this shape:') +
    '\n\nBefore submitting, call check_limits and check_compliance on your draft and fix everything they report. Submit only a clean set.',
  tools: [check_limits, check_compliance],
  budget: { maxTurns: 5, maxOutputTokens: 7000 },
  schema: {
    type: 'object',
    properties: {
      meta: { type: 'array', minItems: 3, maxItems: 3, items: AD({ primary_text: S, headline: S, description: S }, ['primary_text', 'headline', 'description']) },
      linkedin: { type: 'array', minItems: 3, maxItems: 3, items: AD({ intro_text: S, headline: S }, ['intro_text', 'headline']) },
      google: AD({ headlines: { type: 'array', minItems: 8, maxItems: 8, items: S }, descriptions: { type: 'array', minItems: 4, maxItems: 4, items: S } }, ['headlines', 'descriptions']),
      email: AD({ emails: { type: 'array', minItems: 3, maxItems: 3, items: AD({ subject: S, preview_text: S, body: S }, ['subject', 'preview_text', 'body']) }, branch_note: S }, ['emails', 'branch_note']),
    },
    required: ['meta', 'linkedin', 'google', 'email'],
  },
  packet: ({ brief, strategy, context, audience, memory }) => ({
    user: prompt.userPrompt(brief, strategy, contextBlock(context, audience, memory)),
    brief, strategy, context, rules: buildRules(brief, context, memory?.approvedClaims),
  }),
  // Gate: hard limit breaches and compliance violations block; warnings pass through to the UI.
  validate: (o, packet) => {
    const p = validateAssets(o, 'en').filter((i) => i.severity === 'violation').map((i) => `${i.channel} ${i.field}${i.index != null ? ' ' + (i.index + 1) : ''}: ${i.length}/${i.limit}${i.note ? ' (' + i.note + ')' : ''}`);
    const flags = checkCompliance(o, { ...packet.rules, language: 'en' });
    for (const f of flags) if (f.severity === 'violation' && (f.rule !== 'claim' || packet.rules.claimSeverity === 'violation')) p.push(`${f.path}: ${f.detail}`);
    return p;
  },
};
