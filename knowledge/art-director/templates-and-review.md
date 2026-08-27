---
name: templates-and-review
checked: 2026-08-27
review: quarterly
used_by: [art-director, social-planner]
---

# Card templates, contrast and image review

## Template by content type

| Content | Template | Why |
|---|---|---|
| One number that is the point | stat | The number at 200–320px is the whole design |
| A sentence worth quoting | quote | Attribution earns the trust the sentence claims |
| Three or four parallel items | list | Anything longer belongs in the caption |
| An offer with a date or a deadline | announce | The CTA pill is the only place a CTA belongs on a card |
| A useful idea in one line plus explanation | tip | The default when nothing else fits |

Choosing by content, not by variety. Five stat cards in a month is fine if there are five numbers; rotating templates for their own sake produces a quote card with no quote.

## Legibility rules

- One idea per card. If it needs two sentences to be understood, it is a caption, not a card.
- Headline size falls as line count rises; never below the floor where a 1080px card is unreadable at feed size (roughly 150px on a phone).
- Contrast: WCAG 2 ratios, 4.5:1 for body text, 3:1 for large display text, measured against the actual background. Check in code (`wcag-contrast`), never by eye. Brand palettes routinely produce accent-on-accent combinations that fail.
- The lower-right corner stays clear for the logo. Nothing else goes there.
- Truncation is a failure, not a fallback. If the text does not fit, shorten the idea or change template.

## Safe zones

Feeds crop and overlay. Keep meaningful content inside a margin of roughly 10% on all sides for 1:1, and further from the bottom for 4:5 and 9:16 where platform UI sits. A card that reads perfectly in the file and loses its last line in the feed has failed.

## Writing a visual brief

Five elements, two prohibitions:

1. **Subject** — a person doing something specific, or an object in use. Not a concept.
2. **Setting** — a real place with detail.
3. **Light** — time of day and quality.
4. **Mood** — one word, and it must be achievable ("calm", "focused", not "innovative").
5. **Composition** — where the subject sits, what is behind it, room for the logo.

Prohibitions: no text, letters or numbers in the image; nothing in the lower-right corner.

Clichés to refuse: handshakes, people pointing at screens, glowing brains, arrows going up, rows of stock-smiling colleagues at a whiteboard, anyone in a headset. If the brief could describe a stock photo from 2011, rewrite it.

## Reviewing a generated or stock image

Six criteria, all of which must pass:

1. No text, letters or numbers.
2. No recognisable face unless the brief asked for a person and the licence allows it.
3. Palette within reach of the brand accents.
4. Subject matches the brief.
5. Not a cliché from the list above.
6. Mood matches.

Fail any one and regenerate with the failure named, once. If the second attempt fails, submit with a "needs a human" flag rather than shipping it. Prefer stock over generation for realistic human subjects: it is licensed, it looks real, and it carries no likeness risk.

Sources: WCAG 2 contrast ratios (W3C); platform safe-zone guidance from Meta, LinkedIn and Instagram documentation. Template and brief rules are this repository's own.
