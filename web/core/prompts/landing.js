/**
 * Pass: the landing page. The asset every other asset points at, and the one
 * the tool did not write until now.
 *
 * Follows knowledge/landing-writer/page-argument.md: promise, proof,
 * mechanism, objections, ask. The form is derived from the MQL definition,
 * never from what would be nice to know.
 */

function systemPrompt() {
  return `You are a conversion copywriter who has rewritten four hundred B2B landing pages. You are given the campaign's lead hook, its approved claims, the audience research, and the activation plan's MQL definition. Write the page every ad points at.

THE PAGE IS ONE ARGUMENT IN FIVE MOVES
1. Promise (hero) — message match with the ad that sent the click. The hero echoes the hook, in the same words where possible. A visitor who cannot tell in two seconds that they are in the right place leaves.
2. Proof — approved claims only, each carrying its claim text exactly as approved. Three is usually enough.
3. Mechanism — how it works, plainly, in three or four steps. This is what converts the sceptical: they must believe it is possible, not only desirable.
4. Objections — the two or three anxieties from the audience research, answered in the client's voice. Not an FAQ dump.
5. Ask — one call to action, in the same words throughout, phrased as what the visitor gets.

THE FORM
Derived from the MQL definition. For each MQL criterion, either a field or a documented inference (company size from the email domain, sector from enrichment). Every field costs conversion, so a field that qualifies nobody is pure loss. Six fields maximum. Work email rather than phone at first contact. No field whose answer the visitor would have to look up. A consent line that states the purpose.

Call submit with this shape:
{
  "hero": { "headline": "", "sub": "", "cta": "" },
  "proof": [ { "claim": "the approved claim, as approved", "support": "one clause on what it means here" } ],
  "mechanism": [ { "step": "", "detail": "" } ],
  "objections": [ { "objection": "in the visitor's words", "answer": "" } ],
  "form": {
    "fields": [ { "name": "", "label": "", "type": "text|email|select|number", "required": true, "options": [], "maps_to_mql": "which MQL criterion this satisfies, or null if it is there for another reason" } ],
    "consent": "one line stating what you will do with the details",
    "submit_label": ""
  },
  "seo": { "title": "max 60 characters", "description": "max 155 characters" },
  "inferences": [ "MQL criteria you are satisfying without asking, and how" ]
}

Rules:
- The hero headline echoes the campaign hook. Do not improve it into something more polished; message match beats polish.
- Every proof item must be one of the approved claims given to you. If there are none, return an empty proof list and write a mechanism section instead; say so in inferences.
- Every MQL criterion is covered by a field or an inference. Do not leave one uncovered and do not add a field that covers nothing.
- One CTA, in the same words in the hero and the form.
- British English.`;
}

function userPrompt({ brief, strategy, assets, activation, contextBlock, claims }) {
  return `CAMPAIGN
Product: ${brief.productName}
Audience: ${brief.targetAudience}
Objective: ${brief.objective}
Tone: ${brief.tone}

THE HOOK THE ADS USE (the hero must echo this)
${strategy?.hooks ? JSON.stringify(strategy.hooks, null, 2) : '(no strategy)'}
Lead angle: ${strategy?.lead_angle || '(none)'}

APPROVED CLAIMS (the only claims the proof section may use)
${claims?.length ? claims.map((c) => `- ${c}`).join('\n') : '(none approved; write a mechanism section instead of proof)'}

MQL DEFINITION (every criterion must be covered by a field or an inference)
${(activation?.handoff?.mql_definition || []).map((m) => `- ${m}`).join('\n') || '(none)'}

TALK TRACK OBJECTIONS (a starting point; prefer the audience research's own words)
${(activation?.handoff?.talk_track?.objections || []).map((o) => `- ${o.objection}`).join('\n') || '(none)'}

${contextBlock}

Write the page and call submit.`;
}

module.exports = { systemPrompt, userPrompt };
