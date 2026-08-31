/**
 * Social pass: a month of posts.
 *
 * Four weeks, three channels, five content pillars, and graphics on the
 * posts that earn them. The model plans the calendar and writes the words;
 * for graphics it chooses a template and fills its slots, and graphics.js
 * draws the card in the client's brand kit.
 *
 * Why after assets and not with them? The campaign assets carry the lead
 * angle hard. A month of social has to carry it lightly: mostly useful or
 * interesting on its own terms, with the campaign woven through. Giving the
 * model the finished assets lets it echo them without repeating them.
 */

const { socialLimitsForPrompt, socialPlan } = require('../limits');
const { TEMPLATES } = require('../graphics');

const PILLARS = ['educate', 'proof', 'product', 'point-of-view', 'engage'];

function systemPrompt({ channels } = {}) {
  const plan = socialPlan(channels);
  const cadence = plan.per.map((c) => `${c.label} ${c.perWeek} a week`).join(', ');
  const always = plan.per.filter((c) => c.wantsGraphic === 'always').map((c) => c.label);
  const graphicChannels = plan.per.filter((c) => c.wantsGraphic).map((c) => c.label);
  const graphicCount = Math.round(plan.total * 0.375);
  return `You are a B2B social media lead planning one month of organic posts for a client. You are given the brief, the strategy, the campaign assets, the company context and audience research.

Plan four weeks (days 1-28) across ${plan.channels.length} channel${plan.channels.length === 1 ? '' : 's'}: ${plan.channels.join(', ')}. Cadence: ${cadence}. That is ${plan.total} posts. Spread the campaign's lead angle through the month without every post being an advert: use these pillars in roughly these shares:
- educate (35%): something useful the audience can use today
- proof (20%): a specific result, quote or number from the company context
- product (15%): what the product does, plainly
- point-of-view (20%): an opinion the company holds, from the strategy angles
- engage (10%): a question or a poll-style prompt that invites replies

Graphics: attach a graphic to about ${graphicCount} of the ${plan.total} posts${graphicChannels.length ? ', mostly ' + graphicChannels.join(' and ') : ''}${always.length ? ` (every ${always.join(' and ')} post needs one)` : ''}. Choose a template from: ${TEMPLATES.join(', ')}. Fill only the slots the template uses:
- quote: headline = the quoted line (under 90 chars), footer = attribution
- stat: kicker = context label, headline = the number (under 8 chars, e.g. "4 days", "2,400"), body = what it means (under 60 chars)
- tip: kicker, headline (under 50 chars), body (under 140 chars)
- list: kicker, headline (under 40 chars), body = array of 3-4 items (under 30 chars each)
- announce: kicker, headline (under 40 chars), body (under 100 chars), footer = CTA (under 30 chars)

Every graphic also gets "image_prompt": a one-sentence visual brief for a photograph or illustration that could replace the typographic card. Describe subject, setting, mood and composition. No text in the image. Concrete, not abstract: "a finance lead closing a laptop at 5pm in an empty office, warm evening light" not "success and efficiency".

Return ONLY a JSON object, no prose, no markdown, no code fences:

{
  "pillars": [ { "name": "educate", "theme": "one line on what this pillar covers this month" } ],
  "posts": [
    {
      "day": 1,
      "channel": "linkedin",
      "pillar": "educate",
      "text": "the post, ready to publish, with line breaks where they help",
      "hashtags": ["two to four, no #"],
      "cta": "one line or empty",
      "graphic": null
    },
    {
      "day": 2,
      "channel": "instagram",
      "pillar": "proof",
      "text": "...",
      "hashtags": ["up to eight"],
      "cta": "",
      "graphic": { "template": "stat", "kicker": "", "headline": "", "body": "", "footer": "", "image_prompt": "" }
    }
  ]
}

CHARACTER LIMITS
${socialLimitsForPrompt(plan.channels)}

Rules:
- Exactly ${plan.total} posts, days 1-28, no more than two posts on one day, channels spread evenly across each week.
${plan.channels.includes('x') ? '- X posts must be complete thoughts in 280 characters including hashtags. No threads.\n' : ''}
' : ''}- Use the company's preferred terms, never its avoid terms. Use the audience's own phrases from the research.
- Proof posts may only use proof points from the company context. If there are none, use no proof pillar and reallocate to educate.
- No emoji unless the company's voice observations say they use them. No exclamation marks.
- British English unless the brief says otherwise.`;
}

function userPrompt(brief, strategy, assets, contextBlock, audienceBlock) {
  return `CAMPAIGN BRIEF
Product name: ${brief.productName}
Product description: ${brief.productDescription}
Target audience: ${brief.targetAudience}
Objective: ${brief.objective}
Tone: ${brief.tone}

STRATEGY
${JSON.stringify(strategy, null, 2)}

CAMPAIGN ASSETS (echo the angle, do not repeat the copy)
Meta headlines: ${(assets.meta || []).map((a) => a.headline).join(' | ')}
LinkedIn headlines: ${(assets.linkedin || []).map((a) => a.headline).join(' | ')}
Email subjects: ${(assets.email?.emails || []).map((e) => e.subject).join(' | ')}

${contextBlock}

${audienceBlock || ''}

Return the social calendar JSON now.`;
}

module.exports = { systemPrompt, userPrompt, PILLARS };
