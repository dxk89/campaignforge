/**
 * Pass 0: Research.
 *
 * This is what makes the output specific to the company using the tool
 * rather than generic copy about a product category. Two inputs:
 *
 *   sources      text the user supplied: uploaded files, pasted text, URLs.
 *                Brand guidelines, product pages, past campaigns, customer
 *                quotes, pricing pages, competitor comparisons.
 *   web research optional. The model gets the API web search tool and a
 *                company website, and is told to look for what the sources
 *                don't cover.
 *
 * The output is a compact JSON "company context". Downstream passes get the
 * context, never the raw sources. That's the token optimisation: a 40,000
 * character brand guide is read once here and becomes a few hundred tokens of
 * distilled facts that three later passes can afford to include.
 */

// Hard ceiling on raw source text sent to the model. Roughly 15k tokens.
// Above this, the client should be trimming sources, and we truncate here as
// a backstop so a bad upload can't run up the bill.
const MAX_SOURCE_CHARS = 60_000;

function systemPrompt({ webResearch }) {
  return `You are a research analyst preparing a company context brief for a B2B campaign team. You will be given a campaign brief and source material about the company. Your job is to extract only what will change the campaign copy: real proof points, the company's own vocabulary, positioning, and audience insight.

${
  webResearch
    ? `You also have a web search tool. Use it sparingly (a handful of searches at most) to fill gaps the sources leave: what the company's website says about the product, how it describes itself, recent announcements, named competitors. Prefer the company's own pages. Anything you find on the web must be marked with source "web".`
    : `You do not have web access. Work only from the sources provided.`
}

Return ONLY a JSON object, no prose, no markdown, no code fences. Use this exact shape:

{
  "company_summary": "2-3 sentences: what the company is, who it sells to, how it positions itself",
  "positioning": "one sentence: the company's claim to difference in its own words where possible",
  "voice": {
    "observations": ["3-5 short observations about how the company writes: register, sentence length, formality, use of 'we' vs 'you'"],
    "preferred_terms": ["words or phrases the company uses that the copy should reuse"],
    "avoid_terms": ["words the company visibly avoids, or competitor terms, or claims it does not make"]
  },
  "proof_points": [
    { "claim": "a specific fact, number, customer, award or capability the copy can use", "source": "file name, URL, or 'web'" }
  ],
  "product_facts": ["concrete facts about the product: features, integrations, pricing model, deployment, limits"],
  "audience_insights": ["what the sources reveal about the buyer: pains, objections, job titles, buying triggers"],
  "competitors": ["named competitors or alternatives mentioned in the sources"],
  "glossary": [
    { "term": "product name, feature name or brand term", "treatment": "keep untranslated / translate as X / explain" }
  ],
  "gaps": ["things the campaign would benefit from that the sources do not cover, e.g. 'no customer numbers', 'no pricing'"],
  "sources_used": ["names of the sources you actually drew from"]
}

Rules:
- Every proof point must be traceable to a source. Do not invent numbers, customers or awards. If there are none, return an empty proof_points list and say so in gaps.
- Quote the company's own phrasing in preferred_terms rather than paraphrasing it.
- The glossary is for the localisation pass: list every product, feature and brand name so they are handled consistently in Portuguese.
- Keep it compact. This context is reused by three later passes; brevity here is cheaper than brevity later.
- Write in British English.`;
}

function userPrompt(brief, sources, options) {
  const parts = [];

  parts.push(`CAMPAIGN BRIEF
Product name: ${brief.productName}
Product description: ${brief.productDescription}
Target audience: ${brief.targetAudience}
Objective: ${brief.objective}
Tone: ${brief.tone}`);

  if (options.companyUrl) {
    parts.push(`COMPANY WEBSITE: ${options.companyUrl}`);
  }

  if (sources.length === 0) {
    parts.push('SOURCES: none provided.');
  } else {
    let budget = MAX_SOURCE_CHARS;
    const blocks = [];
    for (const src of sources) {
      if (budget <= 0) {
        blocks.push(`--- ${src.name} (${src.kind}) ---\n[omitted: source budget exhausted]`);
        continue;
      }
      const text = String(src.text || '');
      const slice = text.slice(0, budget);
      budget -= slice.length;
      const truncated = slice.length < text.length ? '\n[truncated]' : '';
      blocks.push(`--- ${src.name} (${src.kind}, ${text.length} chars) ---\n${slice}${truncated}`);
    }
    parts.push(`SOURCES (${sources.length})\n\n${blocks.join('\n\n')}`);
  }

  parts.push('Return the company context JSON now.');
  return parts.join('\n\n');
}

/** A neutral context for when there are no sources and no web research. */
function emptyContext() {
  return {
    company_summary: 'No company sources were provided. Copy is based on the brief alone.',
    positioning: null,
    voice: { observations: [], preferred_terms: [], avoid_terms: [] },
    proof_points: [],
    product_facts: [],
    audience_insights: [],
    competitors: [],
    glossary: [],
    gaps: ['No sources uploaded. Add brand guidelines, product pages or customer quotes to make the copy specific.'],
    sources_used: [],
  };
}

/** Render the context for inclusion in later prompts. */
function contextForPrompt(ctx) {
  if (!ctx) return 'COMPANY CONTEXT: none.';
  const list = (arr) => (arr && arr.length ? arr.map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n') : '- (none)');
  return `COMPANY CONTEXT (from research pass; treat as ground truth, do not contradict it)
Summary: ${ctx.company_summary || '(none)'}
Positioning: ${ctx.positioning || '(none)'}
Voice:
${list(ctx.voice?.observations)}
Preferred terms: ${(ctx.voice?.preferred_terms || []).join('; ') || '(none)'}
Avoid: ${(ctx.voice?.avoid_terms || []).join('; ') || '(none)'}
Proof points (use these; do not invent others):
${list((ctx.proof_points || []).map((p) => `${p.claim} [${p.source}]`))}
Product facts:
${list(ctx.product_facts)}
Audience insights:
${list(ctx.audience_insights)}
Competitors: ${(ctx.competitors || []).join('; ') || '(none)'}
Known gaps: ${(ctx.gaps || []).join('; ') || '(none)'}`;
}

module.exports = { systemPrompt, userPrompt, emptyContext, contextForPrompt, MAX_SOURCE_CHARS };
