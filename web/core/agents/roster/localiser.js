const { MODELS } = require('../../pricing');
const prompt = require('../../prompts/localise');
const copywriter = require('./copywriter');
const { validateAssets } = require('../../limits');
const { checkCompliance } = require('../tools/compliance');
const { check_limits, check_compliance, ask_critic } = require('../tools');

module.exports = {
  name: 'localiser',
  fixture: 'localise',
  model: MODELS.sonnet,
  role: prompt.systemPrompt().replace('Return ONLY the JSON object with the same shape as the input, no prose, no markdown, no code fences. Set "branch_note" in Portuguese too.', 'Set "branch_note" in Portuguese too. When every asset is within its limits and free of Brazilian forms, call the submit tool with the same shape as the input.') +
    '\n\nBefore submitting, call check_limits (language pt) and check_compliance (language pt) and fix everything they report. Then call ask_critic with kind "localised" for a register check and fix every must_fix item.',
  criticKind: 'localised',
  
  tools: [check_limits, check_compliance, ask_critic],
  budget: { maxTurns: 10, maxOutputTokens: 7000 },
  schema: copywriter.schema,
  packet: ({ assets, glossary, brief, context }) => ({
    user: prompt.userPrompt(assets, glossary), brief, assets,
    rules: { avoid: [], competitors: context?.competitors || [], brandName: brief?.clientName || brief?.productName, approvedClaims: null, claimSeverity: 'warning' },
  }),
  validate: (o, packet) => {
    const p = validateAssets(o, 'pt').filter((i) => i.severity === 'violation').map((i) => `${i.channel} ${i.field}${i.index != null ? ' ' + (i.index + 1) : ''}: ${i.length}/${i.limit}`);
    for (const f of checkCompliance(o, { ...packet.rules, language: 'pt' })) if (f.severity === 'violation' && f.rule !== 'claim') p.push(`${f.path}: ${f.detail}`);
    return p;
  },
};
