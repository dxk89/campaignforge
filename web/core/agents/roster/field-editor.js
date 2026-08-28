const { MODELS } = require('../../pricing');

/**
 * Rewrites one field, in place, to a constraint.
 *
 * A small, cheap agent: the whole campaign's judgement already exists in the
 * strategy and the surrounding copy, so this one only needs the field, its
 * neighbours for consistency, its limit and the instruction. It is gated by
 * the same limit and compliance rules as the writer that produced it.
 */
module.exports = {
  name: 'field-editor',
  fixture: 'field-editor',
  model: MODELS.sonnet,
  temperature: 0.5,
  role: `You are a senior copywriter rewriting a single field of an existing campaign asset.

You are given the field, the asset it belongs to, the campaign's lead angle, the client's voice rules, the character limit, and an instruction. Rewrite that one field.

Rules:
- Change only what the instruction asks for. Everything else about the line stays as it is.
- Stay inside the character limit. Cut the idea, never truncate the words.
- Keep the lead angle and the client's vocabulary. Do not introduce a claim that is not already in the campaign.
- If the instruction cannot be followed inside the limit, get as close as you can and say so in "note".

Call submit with the new text.`,
  tools: [],
  budget: { maxTurns: 3, maxOutputTokens: 800 },
  schema: {
    type: 'object',
    properties: { text: { type: 'string' }, note: { type: 'string' } },
    required: ['text'],
  },
  packet: ({ asset, rule, constraint, strategy, voice, siblings }) => ({
    user: `FIELD TO REWRITE
Channel: ${asset.channel}
Unit: ${asset.unit}
Field: ${asset.field}
Current text: ${JSON.stringify(asset.text)}
Character limit: ${rule ? `${rule.max} (${rule.hard ? 'hard' : 'target'})` : 'none'}

${siblings?.length ? `THE REST OF THIS ASSET (keep consistent with it)\n${siblings.map((s) => `${s.field}: ${s.text}`).join('\n')}\n` : ''}
${strategy ? `LEAD ANGLE: ${strategy.lead_angle}\nHOOKS: ${JSON.stringify(strategy.hooks)}\n` : ''}
${voice ? `VOICE\nUse: ${(voice.preferredTerms || []).join(', ') || '(none recorded)'}\nAvoid: ${(voice.avoidTerms || []).join(', ') || '(none recorded)'}\n` : ''}
INSTRUCTION
${constraint || 'Improve this line without changing what it says.'}

Rewrite it and call submit.`,
    rule, asset,
  }),
  validate: (o, packet) => {
    const p = [];
    const text = String(o.text || '');
    if (!text.trim()) p.push('text is empty');
    const rule = packet.rule;
    if (rule && rule.hard && text.length > rule.max) p.push(`${text.length} characters; the limit is ${rule.max}. Shorten the idea rather than the words.`);
    return p;
  },
};
