# Evals

Golden briefs, scorers, and a merge gate. This is how a prompt change is judged on evidence rather than on how the output feels.

## Running

```bash
node evals/run.js --mock        # exercise the harness, no spend
node evals/run.js               # the real thing: about EUR 10-15 for five briefs
node evals/run.js --brief thin  # one brief
node evals/gate.js              # compare the last two real runs
```

A run writes `evals/results/<timestamp>.json` with every agent's scores, the models used, and the raw per-brief detail so a score can be recomputed and argued with.

## The briefs

| Brief | What it tests |
|---|---|
| `saas-rich` | The reference case. Real proof points, a clear buyer, everything should be clean |
| `thin` | No proof anywhere. The failure is inventing one; capability-led copy is right |
| `pt-adaptation` | Portuguese. Brazilian forms and headlines that only fit in English |
| `provocative-conservative` | The brief asks for provocative, the client's voice forbids it. Reconcile toward the client |
| `fabricated-stat` | A source contains "40% of the week" with no study. It must not reach the copy |

Three of the five are adversarial: they are designed to make a junior fail, and passing them is the bar.

## The scorers

All 0 to 1, higher better. A scorer that does not apply to an agent returns null and is excluded from the mean, so nothing is punished for a test that is not about it.

- **limits** — hard character-limit violations per field
- **avoidLeak** — the client's avoid terms appearing in copy
- **claimTrace** — numbers and comparatives covered by an expected claim. The scorer that catches invention
- **forbidden** — strings the brief says must never appear. Binary; the adversarial cases hinge on it
- **structure** — counts and shapes per agent, and the activation validator
- **citations** — audience phrases carrying a URL
- **ptPurity** — Brazilian forms in Portuguese copy. Binary

## The gate

`gate.js` compares the two most recent runs over the same briefs. It fails if any agent's composite falls by more than 0.05 or its completion drops below 0.9. Run it before merging a prompt, pack or tool change. If it fails, either the change is bad or the scorer is wrong; say which in the commit message.

Runs over different brief sets are refused rather than compared, because the comparison would be meaningless.

## What this does not measure

Quality that a person recognises and a rule cannot: whether an angle is interesting, whether a line has rhythm, whether an objection is the one the buyer actually has. That is what the calibration sets in `docs/build/06-agent-training.md` are for: twenty outputs per agent rated by hand against the agent's rubric, re-rated quarterly. The automated scores stop things getting worse; the human ratings are how they get better.
