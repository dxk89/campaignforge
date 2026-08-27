---
name: voice-dimensions
checked: 2026-08-27
review: annually
used_by: [brand-analyst, critic, localiser]
---

# Reading a company's voice

The output is a lexicon and a profile with evidence, never a list of adjectives. "Professional and approachable" describes nothing and constrains no writer.

## The four dimensions

Nielsen Norman Group's framework, from a study that tested pairs of near-identical pages varying only the tone. (cite index="93-1">Each dimension is a scale with a neutral midpoint, so a piece of content gets a comparable profile rather than a label</cite>:

| Dimension | Scale | What to look for in the source text |
|---|---|---|
| Humour | funny ↔ serious | Any attempt at a joke, wordplay, or a knowing aside. Judge the attempt, not whether it lands |
| Formality | formal ↔ casual | Contractions, sentence length, first and second person, jargon density |
| Respectfulness | respectful ↔ irreverent | Whether the writing defers to the reader and the subject, or challenges them |
| Enthusiasm | enthusiastic ↔ matter-of-fact | Exclamation, intensifiers, superlatives, or their absence |

(cite index="93-2">The same study found measurable effects on impressions of friendliness, trustworthiness and desirability, and that trustworthiness predicts willingness to recommend</cite>. This is why voice is a campaign decision, not a preference.

Most companies sit somewhere along each scale, not at an extreme. Record the position and the quote that justifies it.

## Method

1. **Collect before judging.** Pull ten to twenty short quotes from across the sources: home, product, pricing, careers, support, blog. Careers and support pages are the most honest; marketing pages are the most performed.
2. **Position each dimension with two quotes.** One that shows the position, one that would have been written differently at the other end.
3. **Weight by page type.** A single playful blog post does not make a funny brand. Pricing and support pages are the voice under pressure.
4. **Build the lexicon from counts, not impressions.** Run the `lexicon` tool over all sources; terms that are frequent in the client's text and rare in general use are the brand's own vocabulary. Verify each by reading it in context before listing it as preferred.
5. **Avoid terms come from absence and from contrast.** Words the category uses and this company does not ("solution", "leverage", competitor names) belong in the avoid list, as do terms it explicitly disclaims.
6. **Note register shift by context.** Voice is fixed, tone flexes. If the support pages are warmer than the product pages, say so; the email writer needs it.

## Output rules

- Every observation carries a quote. No quote, no observation.
- Preferred terms are the company's words, spelled as they spell them.
- Avoid terms are specific words, not sentiments.
- Where the sources are thin, say so in gaps rather than inferring a full profile from a home page.

Sources: Nielsen Norman Group, "The Four Dimensions of Tone of Voice" and "The Impact of Tone of Voice on Users' Brand Perception" (nngroup.com). Method notes are this repository's own.
