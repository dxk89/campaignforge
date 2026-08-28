const { MODELS } = require('../../pricing');
const prompt = require('../../prompts/analyst');

const S = { type: 'string' };

module.exports = {
  name: 'analyst',
  fixture: 'analyst',
  model: MODELS.sonnet,
  role: prompt.systemPrompt(),
  tools: [],
  budget: { maxTurns: 3, maxOutputTokens: 2500 },
  schema: {
    type: 'object',
    properties: {
      learnings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            statement: S,
            evidence: { type: 'object', properties: { metric: S, value: S, variants: { type: 'array', items: S }, sample: S, confidence: S }, required: ['metric', 'value', 'variants'] },
            boundary: S, hypothesis: S,
          },
          required: ['statement', 'evidence', 'boundary'],
        },
      },
      refusals: { type: 'array', items: { type: 'object', properties: { experiment: S, why: S, would_decide: S }, required: ['experiment', 'why'] } },
      confounds: { type: 'array', items: S },
    },
    required: ['learnings', 'refusals', 'confounds'],
  },
  packet: ({ verdicts, rows, campaign }) => ({ user: prompt.userPrompt({ verdicts, rows, campaign }), verdicts }),
  validate: (o, packet) => {
    const p = [];
    const decidable = new Set((packet.verdicts || []).filter((v) => v.verdict === 'met').map((v) => String(v.channel || v.experiment?.channel || '')));

    for (const l of o.learnings || []) {
      if (!l.evidence?.value || !/\d/.test(String(l.evidence.value))) p.push(`learning "${String(l.statement).slice(0, 40)}" cites no number`);
      if ((l.evidence?.variants || []).length < 2) p.push(`learning "${String(l.statement).slice(0, 40)}" names fewer than two variants`);
      if (!l.boundary || l.boundary.length < 15) p.push(`learning "${String(l.statement).slice(0, 40)}" has no usable boundary`);
      if (/\bb2b marketing\b|\bin general\b|\balways\b|\bevery (audience|client|campaign)\b/i.test(l.statement)) {
        p.push(`learning "${String(l.statement).slice(0, 40)}" generalises beyond this client`);
      }
    }
    // A learning from an undecidable experiment is the failure this agent exists to prevent.
    const insufficient = (packet.verdicts || []).filter((v) => v.verdict === 'insufficient');
    if (insufficient.length && (o.refusals || []).length === 0) {
      p.push(`${insufficient.length} experiment(s) came back insufficient and you wrote no refusal for them`);
    }
    return p;
  },
};
