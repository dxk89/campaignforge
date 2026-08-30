const { MODELS } = require('../../pricing');
const prompt = require('../../prompts/landing');
const { contextBlock, buildRules } = require('../packets');
const { checkCompliance } = require('../tools/compliance');
const { check_compliance, ask_critic } = require('../tools');

const S = { type: 'string' };

module.exports = {
  name: 'landing-writer',
  fixture: 'landing',
  model: MODELS.sonnet,
  criticKind: 'landing',
  role: prompt.systemPrompt() + '\n\nBefore submitting, call check_compliance on your draft and fix every violation, then call ask_critic with kind "landing" and fix every must_fix item.',
  tools: [check_compliance, ask_critic],
  budget: { maxTurns: 8, maxOutputTokens: 3500 },
  schema: {
    type: 'object',
    properties: {
      hero: { type: 'object', properties: { headline: S, sub: S, cta: S }, required: ['headline', 'sub', 'cta'] },
      proof: { type: 'array', items: { type: 'object', properties: { claim: S, support: S }, required: ['claim'] } },
      mechanism: { type: 'array', items: { type: 'object', properties: { step: S, detail: S }, required: ['step'] } },
      objections: { type: 'array', items: { type: 'object', properties: { objection: S, answer: S }, required: ['objection', 'answer'] } },
      form: {
        type: 'object',
        properties: {
          fields: {
            type: 'array', maxItems: 6,
            items: {
              type: 'object',
              properties: { name: S, label: S, type: { type: 'string', enum: ['text', 'email', 'select', 'number'] }, required: { type: 'boolean' }, options: { type: 'array', items: S }, maps_to_mql: { type: ['string', 'null'] } },
              required: ['name', 'label', 'type', 'required'],
            },
          },
          consent: S, submit_label: S,
        },
        required: ['fields', 'consent', 'submit_label'],
      },
      seo: { type: 'object', properties: { title: S, description: S }, required: ['title', 'description'] },
      inferences: { type: 'array', items: S },
    },
    required: ['hero', 'proof', 'mechanism', 'objections', 'form', 'seo', 'inferences'],
  },
  packet: ({ brief, strategy, assets, activation, context, audience, memory }) => ({
    user: prompt.userPrompt({
      brief, strategy, assets, activation,
      contextBlock: contextBlock(context, audience, memory),
      claims: (memory?.approvedClaims || (context?.proof_points || []).map((p) => p.claim)).map((c) => (typeof c === 'string' ? c : c.text)),
    }),
    brief, context, audience, activation,
    rules: buildRules(brief, context, memory?.approvedClaims),
  }),
  validate: (o, packet) => {
    const p = [];
    const fields = o.form?.fields || [];
    if (fields.length > 6) p.push(`${fields.length} form fields; six is the maximum. Infer what you can from the work email.`);
    if (!fields.length) p.push('the form has no fields');

    // Every MQL criterion must be covered by a field or a stated inference.
    const mql = packet.activation?.handoff?.mql_definition || [];
    const covered = new Set([
      ...fields.map((f) => String(f.maps_to_mql || '').toLowerCase()).filter(Boolean),
      ...(o.inferences || []).map((i) => String(i).toLowerCase()),
    ]);
    for (const criterion of mql) {
      const words = String(criterion).toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      const hit = [...covered].some((c) => words.filter((w) => c.includes(w)).length >= 1);
      if (!hit) p.push(`MQL criterion "${criterion}" is covered by no field and no stated inference`);
    }

    if (String(o.seo?.title || '').length > 60) p.push(`seo.title is ${o.seo.title.length} characters; 60 is the maximum`);
    if (String(o.seo?.description || '').length > 155) p.push(`seo.description is ${o.seo.description.length} characters; 155 is the maximum`);

    // Proof may only use approved claims.
    const allowed = (packet.rules?.approvedClaims || []).map((c) => String(typeof c === 'string' ? c : c.text).toLowerCase());
    for (const item of o.proof || []) {
      const claim = String(item.claim || '').toLowerCase();
      const ok = allowed.some((a) => {
        const words = a.split(/\s+/).filter((w) => w.length > 3);
        return words.length && words.filter((w) => claim.includes(w)).length >= Math.min(3, words.length);
      });
      if (!ok) p.push(`proof item "${String(item.claim).slice(0, 50)}" is not one of the approved claims`);
    }

    for (const f of checkCompliance(o, { ...packet.rules, language: 'en' })) {
      if (f.severity === 'violation' && f.rule !== 'claim') p.push(`${f.path}: ${f.detail}`);
    }
    return p;
  },
};
