/**
 * Brief parse.
 *
 * Not part of the chain. Runs once when a briefing document is uploaded,
 * before the user has pressed Generate, and fills in the form. The user can
 * then edit anything before generating.
 *
 * Kept deliberately small: one short call, low max_tokens, JSON only. The
 * document itself is also kept as a source so the research pass reads it in
 * full; this pass only needs to find the five fields.
 */

const MAX_BRIEF_CHARS = 30_000;

function systemPrompt() {
  return `You are reading a marketing briefing document and extracting the fields a campaign builder needs. If the document does not state something, leave that field empty rather than guessing. Do not embellish.

Return ONLY a JSON object, no prose, no markdown, no code fences:

{
  "productName": "the product or service being promoted, as named in the document, or empty",
  "productDescription": "1-3 sentences on what it does, in the document's own words where possible, or empty",
  "targetAudience": "who the campaign is for: roles, company types, sectors, regions, or empty",
  "objective": "one of: lead_generation, trial_signups, event_registrations, brand_awareness, or empty if the document does not make it clear",
  "tone": "one of: professional, direct, warm, provocative, or empty if the document does not specify a tone",
  "languages": ["en"] plus "pt" if the document mentions Portugal, Portuguese, pt-PT or a Portuguese market,
  "notes": "one or two sentences on anything important in the brief that the fields above cannot hold: deadlines, mandatory messages, banned claims, budget, channels to exclude"
}`;
}

function userPrompt(text) {
  const body = String(text || '').slice(0, MAX_BRIEF_CHARS);
  return `BRIEFING DOCUMENT\n\n${body}\n\nReturn the JSON now.`;
}

module.exports = { systemPrompt, userPrompt, MAX_BRIEF_CHARS };
