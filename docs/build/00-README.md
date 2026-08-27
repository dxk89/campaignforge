# Build specs

One file per phase, written to be handed to Claude Code. Each has: goal, exit criteria, ordered tasks with the files they touch, contracts (schemas, routes), and the tests that prove it is done.

How to use with Claude Code, from the repo root:

```
claude
> Read CLAUDE.md and docs/build/01-week2-reviewers.md. Work through the tasks in order.
  After each task run `npm test` and show me the result. Do not start the next phase.
```

Each phase opens with the assumptions it inherits from the previous one. The builder verifies them on entry and adapts field names to what actually shipped, noting the adaptation in the first commit of the phase. Contracts within a phase are fixed.

Tools from `07-tooling.md` are incorporated into each phase as "Tooling tasks" at the end of the spec; build them in the phase where they appear, after the phase's main tasks.

Rules for the builder:
- One task at a time, in order. Each task ends with `npm test` passing and a commit.
- Contracts in these specs are fixed. If a contract cannot be met, stop and say why rather than changing it.
- Anything marked *decide* is the builder's call; note the decision in the commit message.
- When a spec and CLAUDE.md disagree, CLAUDE.md wins.

| Spec | Scope | Status |
|---|---|---|
| 01-week2-reviewers.md | Critic, Art Director, Scout, citation checks, fast path, golden sets | detailed |
| 02-phase1-foundation.md | Next.js + Firebase, client library, persisted campaigns, ledger, export | **tasks 1-8, 10 built** |
| 02b-phase1-remaining.md | The 10 tasks left to finish Phase 1: nav, source and asset wiring, brief upload, image UI, exports, tracking table, memory on Firestore, emulator run, deploy runbook | **next** |
| 03-phase2-workspace.md | Editing, regenerate, versions, claims registry, compliance gate, approvals | detailed |
| 04-phase3-authority.md | Provenance, rescan, landing page, results, verdicts, learnings, exemplars, image review, calendar | detailed |
| 05-phase4-rigour.md | Evals, gate, prompt versions, model audit, export pack, ceiling, telemetry | detailed |
| 07-tooling.md | Free repos and tools per agent, with limits, licences and the phase each lands in | detailed |
| 06-agent-training.md | v2. Universal training protocol; all 22 agents with first questions, tools in procedure, enforced self-check, junior errors, adversarial cases, graduation metrics; schedule in Part 4 | detailed |
