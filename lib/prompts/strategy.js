/**
 * Pass 1: Strategy.
 *
 * Why a separate pass? If you ask a model for "three angles and all the ad
 * copy" in one call, it commits to an angle in the first few tokens and never
 * reconsiders. Splitting strategy from execution forces it to compare angles
 * before writing anything, and gives the asset pass a fixed brief to execute
 * against, so every channel is telling the same story.
 *
 * The output is JSON because the next pass consumes it verbatim.
 */

const OBJECTIVE_GUIDANCE = {
  lead_generation:
    'The reader should hand over contact details in exchange for something. Emphasise value of the offer and low friction.',
  trial_signups:
    'The reader should start using the product. Emphasise time-to-value and what they can do in the first session.',
  event_registrations:
    'The reader should register for a date. Emphasise who else will be there, what they will learn, and scarcity of the slot.',
  brand_awareness:
    'No immediate action required. Emphasise a memorable point of view; the goal is recall, not clicks.',
};

const TONE_GUIDANCE = {
  professional: 'Measured, credible, no slang. Think trade press, not consumer social.',
  direct: 'Short sentences. Say the thing. Cut every hedge.',
  warm: 'Human and conversational. Address the reader as a person with a problem, not a persona.',
  provocative: 'Challenge an assumption the audience holds. Be willing to be slightly uncomfortable, never rude.',
};

function systemPrompt() {
  return `You are a senior B2B campaign strategist. You are given a campaign brief and must return a strategy that a copywriter can execute across paid social, search and email without further questions.

Return ONLY a JSON object, no prose, no markdown, no code fences. Use this exact shape:

{
  "angles": [
    {
      "name": "short label, 2-5 words",
      "summary": "one sentence describing the angle",
      "why_it_works": "one sentence on why this audience would respond"
    }
  ],
  "lead_angle": "the name of the angle from the list above that should lead the campaign",
  "lead_reasoning": "2-3 sentences explaining why this angle leads and what the trade-off is versus the others",
  "hooks": {
    "meta": "the strongest single hook line for Meta ads, under 15 words",
    "linkedin": "the strongest single hook line for LinkedIn ads, under 15 words",
    "google": "the strongest search headline idea, under 30 characters",
    "email": "the strongest subject line concept, under 60 characters"
  },
  "key_messages": [
    "three to five proof points or claims the campaign will repeat, each one sentence"
  ]
}

Rules:
- Exactly three angles. They must be genuinely different, not three phrasings of one idea.
- lead_angle must match one of the three angle names exactly.
- Hooks must reflect the lead angle. Do not hedge across angles.
- Do not invent statistics, customer names or awards. If the brief gives no proof points, key_messages should describe the product's capability, not fabricated results.
- Write in British English.`;
}

function userPrompt(brief, contextBlock) {
  const objective = OBJECTIVE_GUIDANCE[brief.objective] || '';
  const tone = TONE_GUIDANCE[brief.tone] || '';

  return `CAMPAIGN BRIEF

Product name: ${brief.productName}
Product description: ${brief.productDescription}
Target audience: ${brief.targetAudience}
Campaign objective: ${brief.objective}
${objective}

Tone: ${brief.tone}
${tone}

${contextBlock}

Angles must be grounded in the company context above. If the context lists proof points, at least one angle should be built on them. If it lists competitors, consider a contrast angle. Do not use claims the context marks as gaps.

Return the strategy JSON now.`;
}

module.exports = { systemPrompt, userPrompt };
