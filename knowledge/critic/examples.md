---
name: critic-examples
checked: 2026-08-27
review: annually
kind: worked-examples
note: Original examples written for this repository. The twenty-case calibration set lives in knowledge/critic/calibration/ and is rated by a human.
---

# Worked examples: Critic

Ten cases. Six should produce must-fix items, four should pass. A critic that never passes work is as broken as one that never catches anything.

## Must-fix cases

**1. Invention.** Email 2 body contains "our 3,000 customers close faster". `proof_points` has no customer count. → `{ path: "email.emails[1].body", problem: "claims 3,000 customers; no approved claim supports a customer count", why: "an unsupported number in a client's email is the client's liability, not ours" }` Category: invention.

**2. Off-angle.** Strategy leads with *Four days back*; LinkedIn variant 2 leads with security certification. → must-fix, category off-angle. Note the distinction: security is a legitimate proof point, but a variant differs by hook and proof *within* the angle. This one changed the angle.

**3. Wrong register.** Client voice observations say short declarative sentences and no rhetorical questions; Meta variant 3 opens "Ever wondered why month-end takes so long?" → must-fix, wrong register, citing the voice rule.

**4. Contradiction.** Landing page says "no card required"; email 3 says "add your card to start the trial". → must-fix on the email, category contradiction. The Critic does not decide which is right; it reports the conflict and names both paths.

**5. Misreading the audience.** Audience research says the buyer is the finance lead who owns the spreadsheet; copy addresses "busy CFOs who don't have time for detail". → must-fix, misreading. The correction cites the research, not taste.

**6. Avoid term with a rule.** Copy uses "AI-powered"; the lexicon lists it under avoid. → must-fix citing the compliance flag by rule name. Where a scanner already caught it, the Critic cites the rule rather than restating the finding in its own words.

## Pass cases

**7. A tone the reviewer would not have chosen.** Provocative brief, and the copy is blunter than house style, but within the voice rules and on angle. → verdict pass; at most a suggestion. Taste is not a must-fix.

**8. An unusual structure that works.** Email 1 opens with the customer's words rather than the product. Unconventional, on angle, within the rules. → pass.

**9. Clean set with one soft-limit warning.** Meta primary text at 131 characters against a 125 soft target. The limit checker already flagged it as a warning. → pass with a suggestion; a soft-target overrun is not a must-fix.

**10. Capability-led copy where proof is absent.** No numbers, no invented claims, gaps acknowledged upstream. → pass. This is the correct response to a thin context, and a critic that demands proof here is demanding invention.

## Annotation

- Every must-fix has path, problem and why. "Tighten this" is not reviewable and not actionable.
- Where a code scanner found the issue, cite its rule. The Critic's value is what code cannot see: angle, register, audience fit, contradiction across assets.
- Cases 7 to 10 are the harder half of the training. The failure mode of a review agent is enthusiasm.

## Calibration

`knowledge/critic/calibration/` holds twenty outputs with a human's must-fix list for each. The Critic's agreement with those lists is its graduation metric (≥ 0.85) and its false-positive rate is capped at 0.15. Re-rate a fresh twenty each quarter.
