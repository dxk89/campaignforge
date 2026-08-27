const { MODELS } = require('../../pricing');
const prompt = require('../../prompts/audience');
const { fetch_url } = require('../tools');

module.exports = {
  name: 'customer-researcher',
  fixture: 'audience',
  model: MODELS.sonnet,
  role: prompt.systemPrompt().replace('Return ONLY a JSON object, no prose, no markdown, no code fences:', 'When you are done, call the submit tool with this shape:') +
    '\n\nYou may call fetch_url to read a page in full. Every phrase, pain and objection you attribute to the audience must be traceable to one of the URLs you list in sources. If you cannot support a list with sources, keep it short and say so in "who".',
  tools: [fetch_url],
  budget: { maxTurns: 10, maxOutputTokens: 4000, maxSearches: 8 },
  schema: {
    type: 'object',
    properties: {
      who: { type: 'string' }, language: { type: 'array' }, pains: { type: 'array' }, triggers: { type: 'array' }, objections: { type: 'array' },
      where_they_gather: { type: 'array' }, content_they_consume: { type: 'array' },
      competitor_messages: { type: 'array', items: { type: 'object', properties: { competitor: { type: 'string' }, message: { type: 'string' }, weakness: { type: 'string' } } } },
      search_terms: { type: 'array' }, sources: { type: 'array', items: { type: 'string' } },
    },
    required: ['who', 'language', 'pains', 'triggers', 'objections', 'where_they_gather', 'content_they_consume', 'competitor_messages', 'search_terms', 'sources'],
  },
  packet: ({ brief, context }) => ({ user: prompt.userPrompt(brief, context), brief, context }),
  validate: (o) => {
    const p = [];
    const urls = (o.sources || []).filter((u) => /^https?:\/\//.test(u));
    if ((o.language || []).length > 3 && urls.length === 0) p.push('you list audience phrases but no source URLs; add the URLs you drew from or shorten the lists');
    return p;
  },
};
