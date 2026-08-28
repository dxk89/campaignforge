# Demo access: shared credentials, isolated workspaces

Written 28 August 2026.

## Why

Campaign Forge is going in front of a company as part of an interview. They need
to build a campaign end to end without being handed a Google account, and two
interviewers looking at it at the same time must not see each other's work, or
any real client work already in the tool.

Today there is one operator, one allowed email, and one workspace. Every
Firestore path and R2 key is built from `uid()`, which returns
`ALLOWED_UID || 'owner'` — a module-level function reading an environment
variable, so every request in the process resolves to the same place. That is
the single-tenant assumption this design removes.

## What this is not

Not multi-user in the product sense. There are no roles, no sharing, no
invitations, no per-user billing. A demo account is a disposable container for
one person's evaluation of the tool, created and revoked by the owner. The
product remains, by design, one marketer running several clients.

## How access works

Google sign-in is removed. All real access is username and password; mock
mode remains for tests and local runs.

| Mode | Credential | Workspace |
|---|---|---|
| Mock | `MOCK_AUTH=1` | `owner` |
| Owner | `ADMIN_USERNAME` + `ADMIN_PASSWORD` from the environment | `owner` |
| Demo account | username + password, stored in Firestore | `ws_<random>` |

`currentSession()` returns one shape regardless of route:

```ts
type Session = {
  kind: 'owner' | 'account';
  workspaceId: string;
  username: string;
};
```

Everything downstream reads `workspaceId` and does not care how the caller got
in. That is what keeps the data layer free of auth concepts.

**Fail closed.** When the store is enabled and neither admin credentials nor
mock mode are configured, the app throws at load rather than serving an open
instance. This follows the existing precedent in `web/core/claude.js` and
`web/server/storage.ts`.

### What removing Google sign-in takes with it

- `verifyIdToken`, `createSessionCookie` and the `firebase-admin/auth` import.
- The Firebase client SDK on the login page, and with it the five
  `NEXT_PUBLIC_FIREBASE_*` variables.
- `ALLOWED_EMAIL` / `ALLOWED_EMAILS`, and the email comparison in the Firestore
  rules.
- Two setup steps: enabling the Google provider, and adding authorised domains.
  `docs/HUMAN-ACTIONS.md` and `docs/DEPLOY.md` are updated to drop both.

Firebase is now used for Firestore only. Whether the `firebase` client package
can be dropped from `web/package.json` is checked during implementation rather
than assumed here.

## Data model

```
users/owner/…                  existing owner data, untouched by this change
users/ws_<random>/…            one root per demo account, same shape
system/accounts/{id}           username, salt, hash, workspaceId, timestamps
system/spend/global            the shared spend ceiling
system/login_attempts/{ip}     throttling counters
```

Accounts live under `system/`, deliberately outside every workspace tree, so no
path bug in the data layer can reach them from a workspace.

`workspaceId` is generated (`ws_` plus random), never derived from the username.
Usernames therefore never appear in Firestore paths or R2 keys, so reusing or
renaming one cannot collide with a previous account's data.

## Workspace threading

`uid()` is deleted. Path builders take the workspace explicitly:

```ts
// before
const root = () => `users/${uid()}`;
// after
const root = (ws: string) => `users/${ws}`;
```

Seven modules change signature: `db.ts`, `storage.ts`, `assets.ts`,
`exemplars.ts`, `resultsStore.ts`, `spend.ts`, `telemetry.ts`. Their callers —
route handlers and server components — pass `session.workspaceId`, which they
already have from `requireSession()`.

**Why explicit rather than AsyncLocalStorage.** ALS gives a far smaller diff:
`uid()` stays synchronous and no call site changes. It was the original
recommendation and it is the wrong trade here. `enterWith()` sets the store for
the current execution context, and in a server that reuses contexts a store can
outlive the request that set it. The failure mode that matters is not "context
missing", which throws safely — it is "context carries the previous request's
workspace", which throws nothing and quietly serves one account another's data.

Explicit threading makes that class of bug unrepresentable. It also enlists the
compiler: deleting `uid()` breaks the build at every one of its call sites, and
each must be given a real workspace before the project compiles again. Nothing
can be forgotten silently, because nothing has a default.

## Admin panel

A "Demo accounts" section in Settings, rendered only when `kind === 'owner'`.

- Create: enter a username, receive a generated password displayed exactly once.
- List: username, created date, last seen. Never the hash.
- Revoke: immediate; the account's sessions stop validating on the next request.

Routes live under `/api/admin/accounts`. Every handler calls `requireOwner()`,
which throws 403 for any `kind: 'account'` session. **Enforcement is
server-side, not by hiding the panel** — a demo account that guesses the URL
receives a 403, not a form.

Revocation sets `revokedAt` rather than deleting the document, so the workspace
and its campaigns survive for the owner to inspect afterwards.

## Passwords and sessions

Passwords are hashed with scrypt and a per-account salt via Node's `crypto`. No
new dependency. `ADMIN_PASSWORD` is compared with `crypto.timingSafeEqual`.

The session cookie is a JWT signed with `jose`, already a dependency, keyed by
`SESSION_SECRET`. Cookie flags are `httpOnly`, `secure`, `sameSite: lax`, with a
seven-day expiry. The cookie carries `kind`, `workspaceId` and `username`; it
does not carry the password or hash.

Failed logins are counted per IP in `system/login_attempts` and locked after ten
failures in fifteen minutes. A shared password without throttling is a weekend's
work to crack.

**`ADMIN_PASSWORD` is stored in plain text in the environment.** That is
weaker than a hash, and weaker still than a credential with 2FA. It is accepted
because the same environment already holds `ANTHROPIC_API_KEY` and
`FIREBASE_SERVICE_ACCOUNT`, both of which are more valuable to an attacker: the
admin password is not the weakest thing in that store, and hashing it there
would protect nothing that is not already exposed by the rest.

## The ceiling must be global

`spend.ts` currently reads the ceiling from `users/{uid}/settings/user`, which is
per workspace. Left alone, every new demo account would receive its own fresh
allowance and the ceiling would bound nothing.

The ceiling moves to `system/spend/global` and is evaluated across all
workspaces. A per-workspace ceiling remains available as an optional additional
limit. This is a security control as much as a budget one: it is what bounds the
damage if a demo credential leaks.

## Firestore rules

With Firebase Auth gone there is no `request.auth` to check, and the server
reaches Firestore through the Admin SDK, which bypasses rules entirely. The
rules are therefore reduced to denying all direct client access, and `CLAUDE.md`
records that workspace isolation is enforced in application code, so nobody
later mistakes the rules for protection they do not provide.

## Testing

Units: scrypt round-trip, JWT sign and verify, throttle counter behaviour.

Contract tests, in `test/`, following the existing scripted-model pattern:

1. An account signs in and lands in its own workspace.
2. **Account A cannot read account B's clients, campaigns, ledger or files.**
3. An account session receives 403 from every `/api/admin/*` route.
4. Login locks after the configured number of failures.
5. The global ceiling refuses a run regardless of which workspace requests it.

The existing eleven suites must stay green, and `npm run test:emulator` must
still pass against real Firestore.

## Back-compatibility

- `MOCK_AUTH=1` behaves exactly as now — workspace `owner`, no credentials.
- Existing data at `users/owner` is untouched. No migration.
- A deployment with no demo accounts behaves as it does today, except that the
  owner signs in with a username instead of Google.
- `ALLOWED_EMAIL`, `ALLOWED_UID` and the `NEXT_PUBLIC_FIREBASE_*` variables
  become unused. They are removed from the docs and can be deleted from Vercel;
  leaving them set does nothing.

## Risks

- **Largest change to date.** New auth path, admin UI, signature change across
  seven data modules, new tests. Bigger than everything else done this session
  combined.
- **A shared password is weaker than Google sign-in**, which this replaces. No
  2FA, and a forwarded credential is indistinguishable from a legitimate one.
  The throttle, the global ceiling and one account per interviewer are what
  contain it.
- **The admin panel is new attack surface.** Mitigated by server-side
  `requireOwner()` on every route rather than UI-level hiding.
- **Sign-in becomes reachable by anyone with the URL.** Previously an attacker
  needed a Google account on the allowlist; now they need a username and
  password, submitted to a public form. The throttle is what makes that safe,
  so it is not optional.
