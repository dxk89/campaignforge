const { MODELS } = require('../../pricing');
const prompt = require('../../prompts/research');
const { fetch_url } = require('../tools');

module.exports = {
  name: 'brand-analyst',
  fixture: 'research',
  model: MODELS.sonnet,
  role: ({ webResearch }) => prompt.systemPrompt({ webResearch }).replace('Return ONLY a JSON object, no prose, no markdown, no code fences. Use this exact shape:', 'When you are done, call the submit tool with this shape:') +
    '\n\nYou may call fetch_url to read any source URL in full before deciding. Every proof point must name its source and, where possible, quote the span it came from.',
  tools: [fetch_url],
  budget: ({ webResearch }) => ({ maxTurns: webResearch ? 6 : 4, maxOutputTokens: 5000, maxSearches: webResearch ? 5 : 0 }),
  schema: {
    type: 'object',
    properties: {
      company_summary: { type: 'string' }, positioning: { type: ['string', 'null'] },
      voice: { type: 'object', properties: { observations: { type: 'array' }, preferred_terms: { type: 'array' }, avoid_terms: { type: 'array' } }, required: ['observations', 'preferred_terms', 'avoid_terms'] },
      proof_points: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, source: { type: 'string' } }, required: ['claim', 'source'] } },
      product_facts: { type: 'array' }, audience_insights: { type: 'array' }, competitors: { type: 'array' },
      glossary: { type: 'array', items: { type: 'object', properties: { term: { type: 'string' }, treatment: { type: 'string' } } } },
      campaign_facts: { type: 'array' }, gaps: { type: 'array' }, sources_used: { type: 'array' },
    },
    required: ['company_summary', 'voice', 'proof_points', 'product_facts', 'audience_insights', 'competitors', 'glossary', 'campaign_facts', 'gaps', 'sources_used'],
  },
  packet: ({ brief, sources = [], webResearch, companyUrl }) => ({ user: prompt.userPrompt(brief, sources, { companyUrl }), brief, sources, webResearch }),
  validate: (o) => {
    const p = [];
    for (const pp of o.proof_points || []) if (!pp.source || /^(none|unknown|n\/a)$/i.test(pp.source)) p.push(`proof point "${String(pp.claim).slice(0, 60)}" has no source`);
    if (!o.company_summary || o.company_summary.length < 40) p.push('company_summary is too short');
    return p;
  },
};
