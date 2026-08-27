---
name: art-director-examples
checked: 2026-08-27
review: annually
kind: worked-examples
note: Original examples written for this repository. No third-party creative is reproduced.
---

# Worked examples: Art Director

---

## Example 1 — template chosen by content, then rejected on fit

**Content.** "Customers close the month four days faster on average."

**First choice: stat.** headline "4 days" (6 chars, renders at 320px), kicker "Month-end close", body "faster on average, reviewing exceptions only" (43).

**Contrast check.** Brand accents are #0f5c6b (teal) and #e4570f (orange). Scheme 1 puts the number in orange on teal: ratio 2.1:1. Fails the 3:1 display floor. Scheme 2, orange on white, is 3.4:1 and passes; the body in near-black on white is 15:1.

**Result.** Scheme 2. The card that "looked fine" would have been unreadable at feed size for a meaningful number of readers.

**Annotation.**
- The check is in code. Eyes are unreliable on saturated mid-tones, which is exactly where B2B brand palettes live.
- A junior picks the on-brand-looking combination and never measures it.

---

## Example 2 — a nine-character number

**Content.** "€1.2 million reconciled every night."

**Wrong.** stat template with headline "€1.2 million" (12 chars). At 200px it wraps to two lines and the template's layout assumes one.

**Right.** tip template: kicker "Every night", headline "€1.2 million reconciled while you sleep" (39), body carrying the mechanism.

**Annotation.**
- The stat template is for numbers short enough to be a shape: "4 days", "2,400", "23". Longer figures are sentences and belong in a sentence template.
- The `render_card` tool reports truncation; the self-check requires it to be clean before submit. Choosing a different template is the fix, not a smaller font.

---

## Example 3 — a brief rewritten to avoid a cliché and a face

**First draft brief.** "A finance team celebrating around a laptop, high-fiving, bright office."

**Problems.** Cliché (celebration stock), faces (likeness risk), mood unachievable from a still.

**Rewritten.** "A single desk at the end of the day: a closed laptop, a cold cup of coffee, a window with low evening light behind. Empty open-plan office out of focus in the background. Calm, unhurried. Desk fills the left two-thirds; lower right clear."

**Annotation.**
- Subject, setting, light, mood, composition, and both prohibitions. The mood is carried by the objects and the light, which a still image can actually do.
- The rewritten brief also happens to say something true about the product: the work is finished and nobody is still there. A good visual brief is a piece of strategy.

---

## Example 4 — review catches a generated image

**Returned image.** Matches the brief, good light, but a wall calendar in the background carries legible numbers and the word "MARCH".

**Review.** `{ ok: false, problems: ["text in image: calendar shows 'MARCH' and dates"] }`

**Regeneration.** Same brief plus "no calendars, signage, screens or printed material visible; no text of any kind in frame". Second attempt passes.

**Annotation.**
- Text in generated images is the most common failure and the least forgivable, because it usually reads as nonsense at full size and dates the image at small size.
- One corrective regeneration, then a human flag. Three attempts is a budget problem and a sign the brief is wrong, not the model.

---

## Example 5 — stock over generation

**Brief calls for.** A person at a desk, realistic, recognisable as a working office.

**Decision.** `find_photo` first. A licensed photograph of a real office beats a generated approximation on realism, costs nothing, carries no likeness risk, and the provenance is recorded with the image.

**When generation wins.** Conceptual or abstract briefs (a shape, a texture, a metaphor rendered in brand colours) where no stock library has the specific thing and realism is not the point.

---

## Self-check applied
Template matches content type; slots untruncated; contrast measured and passing; brief has five elements and both prohibitions; review ran on the submitted image; provenance recorded for stock.
