/**
 * Audience pass: understand the customer.
 *
 * For a third-party client the person writing the campaign has never met
 * the buyer. This pass uses web search to find out how that buyer actually
 * talks: the words they use for the problem, where they gather, what they
 * read, what competitors are already telling them, and what makes them
 * move. The output is verbatim-heavy on purpose; paraphrased pains are
 * generic, quoted ones are usable in copy.
 *
 * Runs only when web research is on. Output feeds strategy, assets and
 * social as an AUDIENCE block alongside the company context.
 */

function systemPrompt() {
  return `You are a B2B customer researcher. You have a web search tool. Your job is to understand the target audience for a campaign well enough that a copywriter could speak to them in their own words.

Use up to 8 searches. Look for: how this audience describes the problem in forums, communities, reviews, job posts and LinkedIn; what they read and where they gather; what competitors and alternatives say to them; what triggers a purchase; what stops one. Prefer primary voices (practitioners, reviews, community threads) over vendor marketing.

Return ONLY a JSON object, no prose, no markdown, no code fences:

{
  "who": "2-3 sentences: the person, their role, what a typical week looks like, who they answer to",
  "language": ["8-15 short phrases the audience actually uses for the problem or the job, as close to verbatim as you found them"],
  "pains": ["specific, concrete pains in priority order, each one sentence"],
  "triggers": ["events that make them look for a solution now"],
  "objections": ["what makes them hesitate, in their words where possible"],
  "where_they_gather": ["communities, publications, newsletters, events, podcasts, with a note on what each is used for"],
  "content_they_consume": ["formats and topics that get their attention"],
  "competitor_messages": [ { "competitor": "name or 'the status quo'", "message": "what it is telling this audience", "weakness": "where that message is thin" } ],
  "search_terms": ["phrases they type when looking, useful for Google headlines"],
  "sources": ["URLs you drew from"]
}

Rules:
- Attribute nothing to the audience that you did not find. If the search comes back thin, say so in "who" and keep the lists short rather than filling them.
- Do not repeat the campaign brief back. The brief says who the audience is; you are finding out what they are like.
- Quote, do not smooth. "Spend Friday afternoon reconciling Stripe" is more useful than "reconciliation challenges".
- British English.`;
}

function userPrompt(brief, context) {
  return `CAMPAIGN BRIEF
Product: ${brief.productName}
What it does: ${brief.productDescription}
Target audience: ${brief.targetAudience}
Objective: ${brief.objective}

WHAT WE ALREADY KNOW ABOUT THE COMPANY
${context?.company_summary || '(nothing yet)'}
Competitors named so far: ${(context?.competitors || []).join('; ') || '(none)'}

Research the audience now and return the JSON.`;
}

/** Render for later prompts. */
function audienceForPrompt(a) {
  if (!a) return '';
  const list = (arr) => (arr && arr.length ? arr.map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n') : '- (none found)');
  return `AUDIENCE RESEARCH (from web research; use their language)
Who: ${a.who || ''}
Their phrases:
${list(a.language)}
Pains:
${list(a.pains)}
Triggers:
${list(a.triggers)}
Objections:
${list(a.objections)}
Where they gather: ${(a.where_they_gather || []).join('; ') || '(none found)'}
Competitor messages:
${list((a.competitor_messages || []).map((c) => `${c.competitor}: "${c.message}" (weak on: ${c.weakness})`))}
Search terms: ${(a.search_terms || []).join('; ') || '(none found)'}`;
}

module.exports = { systemPrompt, userPrompt, audienceForPrompt };
