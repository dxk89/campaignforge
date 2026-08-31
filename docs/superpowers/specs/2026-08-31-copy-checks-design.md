# Copy checks: one core, three ways in

**Status:** approved 31 Aug 2026
**Project 1 of 2.** Project 2 is platform execution (HubSpot first, LinkedIn
after Community Management API review) and gets its own spec.

## Goal

Make the deterministic checks usable on any copy, not only on copy this tool
generated.

Campaign Forge already knows a great deal about whether a line of marketing
copy is fit to publish: whether it fits the platform's limit, whether it uses
a term the client avoids, whether it names a competitor, whether it makes a
claim nobody approved, and whether it reads like a machine wrote it. All of
that runs inside an agent pass and is unreachable from anywhere else. A person
writing a LinkedIn post by hand on a Tuesday gets none of it.

Success is David using this weekly on real IntelliNews copy, and a colleague
or an interviewer being able to run it themselves from the documentation
alone.

## Non-goals

- **Rewriting copy.** This reports; a person decides. Same reasoning as
  invariant 5: flags, never silent edits.
- **Storing what is checked.** Ad-hoc copy is not a campaign asset. Nothing
  is persisted, which also makes the data answer simple.
- **New rules.** This exposes the rules that exist. Gaps found while using it
  are their own change.

## Architecture

One new module, `web/core/check.js`, exporting `checkCopy(text, opts)`. It
composes functions that already exist and are already pure:

| Source | Function | Needs |
|---|---|---|
| `core/limits.js` | `validateAssets`, `validateSocial` | a channel |
| `core/agents/tools/compliance.js` | `checkCompliance` | client rules, optional |
| `core/ai-tells.js` | `findTells` | nothing |

It lives in `core/` because `core/` is plain CommonJS shared by `web/` and
`legacy/`, and the MCP server needs to import it without a build step.

Three consumers, each thin:

1. **`POST /api/check`** — session-guarded, calls `checkCopy`, returns JSON.
2. **The clinic page** — paste box, channel selector, optional client picker.
3. **`mcp/server.js`** — a stdio MCP server exposing `check_copy` and
   `scan_site`.

The MCP server sits beside `web/` rather than inside it. Vercel builds from
the `web` root directory, and a local stdio process has no business in a
serverless build.

## The shape it returns

```js
{
  channel: 'linkedin' | null,
  length: { chars, limit, over },   // per channel when no channel is given
  flags: [ { rule, detail, severity, term } ],
  verdict: 'clean' | 'warnings' | 'violations'
}
```

`flags` is the shape `checkCompliance` already returns, so the clinic reuses
the workbench's flag styling and the MCP output stays readable as plain text.
`verdict` exists so a caller acts on one field instead of counting
severities.

Without a channel it reports length against every channel, which is the
question someone actually has: where can this line go as written.

Without client rules it runs only the rules that need no client context, and
says so in the response. A clean result that silently skipped half the checks
is worse than no result.

## Every flag says why

The humaniser flags already carry a reason. The limits and compliance ones
carry a measurement or a term. Each rule gains a short sentence saying what
the rule is for. This is the difference between a linter and a tool that
teaches the standard it enforces, and it is most of the value for anyone
using it who did not build it.

## Documentation

Documentation is a deliverable here, not a follow-up, because the point is
that other people can use it.

**`docs/COPY-CHECKS.md`, one document, layered.** A marketer reads the first
half: every rule, what trips it, why it exists, what to do about it. An
engineer keeps going: the function signature, the returned shape, how to add
a rule and where its test goes. Two documents would drift apart within a
month; the rules are the same rules for both readers.

**`mcp/README.md`.** Install, the exact Claude Desktop configuration JSON to
paste, and a worked example per tool.

**A data note in both.** `check_copy` makes no network calls: it is pure
functions over a string and nothing leaves the machine. `scan_site` fetches
the site it is pointed at. Anyone at a publisher will ask, and answering it
first is the difference between the tool being used and being quietly
avoided.

**A section in the main README**, because that is where a reviewer starts.

## Testing

- `checkCopy` is pure, so it tests directly: clean copy returns `clean`, each
  rule fires on a case that should trip it, and the channel-less path reports
  against every channel.
- The quiet case matters as much as the loud one, as it did for the
  humaniser: real headlines must come back clean, or the tool gets ignored.
- One test asserts the MCP tool schemas match `checkCopy`'s actual arguments.
  A schema drifting from its function is the failure that only appears in
  someone else's client, where nobody can debug it.

## Risks

- **The clinic gives an incomplete answer without a client.** Mitigated by
  saying which rules ran, in the response rather than only in the interface.
- **The MCP server is a second entry point into `core/`.** If a checker grows
  a dependency on request context, it breaks there first. The schema test is
  the tripwire.
