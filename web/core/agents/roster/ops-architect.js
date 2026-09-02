const { MODELS } = require('../../pricing');
const prompt = require('../../prompts/activation');
const { contextBlock } = require('../packets');
const { validate_activation } = require('../tools');

module.exports = {
  name: 'ops-architect',
  fixture: 'activation',
  model: MODELS.sonnet,
  role: prompt.systemPrompt().replace('Return ONLY a JSON object, no prose, no markdown, no code fences. Use this exact shape:', 'When the plan passes validate_activation, call the submit tool with this shape:') +
    '\n\nCall validate_activation on your draft before submitting and fix every problem it reports.',
  tools: [validate_activation],
  budget: { maxTurns: 4, maxOutputTokens: 6000 },
  schema: {
    type: 'object',
    properties: {
      lifecycle: { type: 'object', properties: { entries: { type: 'array' }, steps: { type: 'array' }, signals_used: { type: 'array' }, exit_rules: { type: 'array' } }, required: ['entries', 'steps', 'signals_used', 'exit_rules'] },
      handoff: { type: 'object', properties: { mql_definition: { type: 'array' }, lead_score: { type: 'array' }, threshold: { type: 'number' }, sla: { type: 'string' }, bdr_sop: { type: 'array' }, talk_track: { type: 'object' }, disqualifiers: { type: 'array' } }, required: ['mql_definition', 'lead_score', 'threshold', 'sla', 'bdr_sop', 'talk_track', 'disqualifiers'] },
      measurement: { type: 'object', properties: { kpi_tree: { type: 'array' }, funnel: { type: 'array' }, reporting_cadence: { type: 'string' }, data_quality: { type: 'array' }, incrementality: { type: 'object' } }, required: ['kpi_tree', 'funnel', 'reporting_cadence', 'data_quality', 'incrementality'] },
      experiments: { type: 'array' },
    },
    required: ['lifecycle', 'handoff', 'measurement', 'experiments'],
  },
  packet: ({ brief, strategy, assets, context, audience, landingUrl, memory }) => ({
    user: prompt.userPrompt(brief, strategy, assets, contextBlock(context, audience, memory)), brief, assets, landingUrl,
  }),
  validate: (o) => prompt.validateActivation(o),
};
