const { MODELS } = require('../../pricing');
const prompt = require('../../prompts/strategy');
const { contextBlock } = require('../packets');

module.exports = {
  name: 'strategist',
  fixture: 'strategy',
  model: MODELS.sonnet,
  role: prompt.systemPrompt().replace('Return ONLY a JSON object, no prose, no markdown, no code fences. Use this exact shape:', 'When you are done, call the submit tool with this shape:'),
  tools: [],
  budget: { maxTurns: 3, maxOutputTokens: 2000 },
  schema: {
    type: 'object',
    properties: {
      angles: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: { name: { type: 'string' }, summary: { type: 'string' }, why_it_works: { type: 'string' } }, required: ['name', 'summary', 'why_it_works'] } },
      lead_angle: { type: 'string' }, lead_reasoning: { type: 'string' },
      hooks: { type: 'object', properties: { meta: { type: 'string' }, linkedin: { type: 'string' }, google: { type: 'string' }, email: { type: 'string' } }, required: ['meta', 'linkedin', 'google', 'email'] },
      key_messages: { type: 'array' },
    },
    required: ['angles', 'lead_angle', 'lead_reasoning', 'hooks', 'key_messages'],
  },
  packet: ({ brief, context, audience, memory }) => ({ user: prompt.userPrompt(brief, contextBlock(context, audience, memory)), brief, context }),
  validate: (o) => {
    const p = [];
    const names = (o.angles || []).map((a) => a.name);
    if (names.length !== 3) p.push('exactly three angles are required');
    if (!names.includes(o.lead_angle)) p.push(`lead_angle "${o.lead_angle}" must be one of: ${names.join(', ')}`);
    if (String(o.hooks?.google || '').length > 30) p.push('hooks.google must be under 30 characters');
    if (String(o.hooks?.email || '').length > 60) p.push('hooks.email must be under 60 characters');
    return p;
  },
};
