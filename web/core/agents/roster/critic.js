const { MODELS } = require('../../pricing');
const prompt = require('../../prompts/critic');
const { contextBlock } = require('../packets');
const { checkCompliance } = require('../tools/compliance');

module.exports = {
  name: 'critic',
  fixture: 'critic',
  model: process.env.CRITIC_MODEL || MODELS.sonnet,
  temperature: 0.2,
  role: (inputs) => prompt.systemPrompt(inputs?.kind || 'assets'),
  tools: [],
  budget: { maxTurns: 2, maxOutputTokens: 2500 },
  schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['pass', 'revise'] },
      must_fix: {
        type: 'array',
        items: {
          type: 'object',
          properties: { path: { type: 'string' }, problem: { type: 'string' }, why: { type: 'string' } },
          required: ['path', 'problem', 'why'],
        },
      },
      suggestions: { type: 'array', items: { type: 'string' } },
    },
    required: ['verdict', 'must_fix', 'suggestions'],
  },
  packet: ({ output, kind = 'assets', brief, context, audience, memory, rules }) => ({
    user: prompt.userPrompt({
      output, kind, brief,
      contextBlock: contextBlock(context, audience, memory),
      // Give the Critic what the scanners found so it cites rules instead of
      // rediscovering them in its own words.
      flags: rules ? checkCompliance(output, { ...rules, language: kind === 'localised' ? 'pt' : 'en' }) : [],
    }),
    brief, context, kind,
  }),
  validate: (o) => {
    const p = [];
    const n = (o.must_fix || []).length;
    if (o.verdict === 'revise' && n === 0) p.push('verdict "revise" requires at least one must_fix item');
    if (o.verdict === 'pass' && n > 0) p.push('verdict "pass" requires must_fix to be empty');
    for (const m of o.must_fix || []) {
      if (!m.why || m.why.length < 10) p.push(`must_fix for ${m.path} has no usable "why"`);
    }
    return p;
  },
};
