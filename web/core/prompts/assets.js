/**
 * Pass 2: Assets.
 *
 * One call produces every channel. Why not one call per channel? Because the
 * value of the chain is consistency: the same lead angle, the same proof
 * points, the same vocabulary across Meta, LinkedIn, Google and email. A
 * single call with the strategy in front of it keeps them aligned. Four calls
 * would each drift a little, and cost four lots of shared context.
 *
 * Character limits are stated in the prompt AND validated in code afterwards
 * (see limits.js). The prompt gets most of them right; the validator catches
 * the rest and the UI flags them rather than silently shipping a 44-char
 * Meta headline that the platform would truncate.
 */

const { limitsForPrompt } = require('../limits');

function systemPrompt() {
  return `You are a senior B2B copywriter. You are given a campaign brief, a strategy that has already chosen the lead angle, and company context with the proof points and vocabulary you are allowed to use. Write the full asset set for the campaign.

Return ONLY a JSON object, no prose, no markdown, no code fences. Use this exact shape:

{
  "meta": [
    { "primary_text": "", "headline": "", "description": "" }
  ],
  "linkedin": [
    { "intro_text": "", "headline": "" }
  ],
  "google": {
    "headlines": ["", "", "", "", "", "", "", ""],
    "descriptions": ["", "", "", ""]
  },
  "email": {
    "emails": [
      { "subject": "", "preview_text": "", "body": "" }
    ],
    "branch_note": "one line describing the condition that decides which email 3 a reader gets, e.g. 'if clicked email 2 -> case-study email; if not -> objection-handling email'"
  }
}

Counts: exactly 3 meta variants, 3 linkedin variants, 8 google headlines, 4 google descriptions, 3 emails.

CHARACTER LIMITS
${limitsForPrompt()}

Rules:
- Every asset executes the lead angle from the strategy. Variants differ in hook and proof, not in angle.
- Use the company's preferred terms. Never use terms listed under avoid.
- Only use proof points from the company context. If there are none, write capability-led copy and do not invent numbers, logos or awards.
- Google headlines must work in any combination and any order; do not write them as a sequence. Include the product name in at least two.
- Email bodies are plain text with paragraph breaks. Sign off generically ("The [product] team"). One call to action per email.
- Email 1 introduces the angle, email 2 delivers the strongest proof, email 3 handles the main objection or makes the direct ask.
- Count characters carefully before returning. Being 1 over a hard limit is a failure.
- Write in British English unless the brief says otherwise.`;
}

function userPrompt(brief, strategy, contextBlock) {
  return `CAMPAIGN BRIEF
Product name: ${brief.productName}
Product description: ${brief.productDescription}
Target audience: ${brief.targetAudience}
Objective: ${brief.objective}
Tone: ${brief.tone}

STRATEGY (already decided; execute it)
${JSON.stringify(strategy, null, 2)}

${contextBlock}

Return the asset JSON now.`;
}

module.exports = { systemPrompt, userPrompt };
