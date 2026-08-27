const { MODELS } = require('../../pricing');
const prompt = require('../../prompts/brief');
const OBJ = ['lead_generation', 'trial_signups', 'event_registrations', 'brand_awareness'];
const TONES = ['professional', 'direct', 'warm', 'provocative'];

module.exports = {
  name: 'brief-reader',
  fixture: 'brief',
  model: MODELS.haiku, // extraction, not writing
  role: prompt.systemPrompt().replace('Return ONLY a JSON object, no prose, no markdown, no code fences:', 'Call the submit tool with this shape:'),
  tools: [],
  budget: { maxTurns: 2, maxOutputTokens: 800 },
  schema: {
    type: 'object',
    properties: {
      productName: { type: 'string' }, productDescription: { type: 'string' }, targetAudience: { type: 'string' },
      objective: { type: 'string' }, tone: { type: 'string' }, languages: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' },
    },
    required: ['productName', 'productDescription', 'targetAudience', 'objective', 'tone', 'languages', 'notes'],
  },
  packet: ({ text }) => ({ user: prompt.userPrompt(text) }),
  postProcess: (o) => ({
    productName: String(o.productName || ''), productDescription: String(o.productDescription || ''), targetAudience: String(o.targetAudience || ''),
    objective: OBJ.includes(o.objective) ? o.objective : '', tone: TONES.includes(o.tone) ? o.tone : '',
    languages: Array.isArray(o.languages) ? o.languages.filter((l) => ['en', 'pt'].includes(l)) : ['en'], notes: String(o.notes || ''),
  }),
  validate: () => [],
};
