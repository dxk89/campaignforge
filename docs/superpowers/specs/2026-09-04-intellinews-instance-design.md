# A second instance: IntelliNews

Written 4 September 2026.

## What this is

A separate Campaign Forge for IntelliNews client work, living inside the same
repository and the same Vercel project as the portfolio deployment. It has its
own door, its own library, its own branding, and no spend ceiling. It is not a
second deployment and not a fork: one push deploys both, and every fix reaches
both.

It also raises the security floor for both instances. The portfolio deployment
is a demonstration behind a password; this one holds a client's unpublished
work, and the controls that were adequate for the first are not adequate for
the second. Those changes are shared, not tenant-specific, because a weakness
in the login route is a weakness at both doors.

## Why not a second deployment

The obvious shape is a second Vercel project with its own domain and its own
Firestore. It was rejected because it doubles the operational surface -- two sets
of environment variables, two places a secret can be stale, two builds to watch
-- to separate data that `server/db.ts` already separates by workspace. The
isolation was built in when sign-in gave every visitor their own workspace, and
survived the move to shared passwords. This design uses it rather than
rebuilding it at the infrastructure layer.

## The one idea

**The workspace id in the session cookie is the instance.** Everything else
follows from it. `server/db.ts` nests every client, campaign, source and image
under `users/{ws}`, so two workspaces cannot see each other's work without a
code change. The login route currently hardcodes `workspaceId: 'owner'`. Signing
a cookie with `'intellinews'` instead is the entire separation.

Nothing new goes into the JWT. Existing cookies keep working and stay on
`'owner'`, so this ships without a migration or a forced sign-out.

## Components

### `web/server/tenant.ts` (new)

The single source of truth. A record keyed by workspace id:

```ts
export type Tenant = {
  id: string;            // the workspace id, and the value in the cookie
  label: string;         // shown in the header and the page title
  strapline: string;     // the brand-sub line
  doorPath: string;      // where sign-in and sign-out live
  adminOnly: boolean;    // reject ACCESS_PASSWORD at this door
  exemptFromCeiling: boolean;
};
```

Two entries. `owner`: label "Campaign Forge", strapline "brief in, campaign
out", door `/login`, not admin-only, governed by the ceiling -- exactly what
ships today. `intellinews`: label "IntelliNews Campaign Forge", strapline
"client work", door `/intellinews-CampaignF`, admin-only, exempt from the
ceiling. Exported helpers:
`tenantFor(session)`, `tenantByDoor(pathname)`, and `isExempt(ws)`.

Everything that needs to know which instance it is asks this module. The
alternative -- `if (workspaceId === 'intellinews')` at each of the six call
sites -- is how the two instances would drift apart.

### The door: `web/app/intellinews-CampaignF/page.tsx` (new)

A copy of the login page's form with IntelliNews wording, posting
`{ password, tenant: 'intellinews' }`. Added to the `PUBLIC` list in
`proxy.ts` alongside `/login`.

Only the door is prefixed. Once signed in, the normal paths (`/clients`,
`/check`) serve IntelliNews data, because the cookie says so. Putting every
page under the prefix was considered and rejected: it would make every internal
link, redirect and sign-out path tenant-aware, which is a large surface for a
cosmetic gain.

### `web/app/api/auth/login/route.ts` (changed)

Accepts an optional `tenant` field, defaulting to `owner`. An unknown value is
a 400. The throttle, the IP handling and `checkPassword` are untouched.

The new rule: when the tenant is `adminOnly` and `checkPassword` returns
`'user'`, the response is the same 401 and the same "That password was not
recognised" message as a wrong password, and it records a throttle failure.
A distinct message would tell a holder of the reviewer password that they had
found a real door and guessed the wrong secret.

The cookie is then signed with the tenant's id as `workspaceId`. The route
also sets `cf_door` to the tenant's door path. It holds a path and no secret,
and is read only by the proxy, to decide where an expired session lands.

### `web/server/spend.ts` (changed)

`checkCeiling(ws, agent)` returns `{}` immediately when `isExempt(ws)`.

`listLedgerAllWorkspaces` gains an exclusion so the running total ignores
exempt workspaces. This is not optional tidiness: without it, IntelliNews
spend would consume the portfolio's allowance and a busy client month would
silently refuse runs on the deployment sent to reviewers. Exempt means neither
blocked nor counted.

The Ledger page is unchanged. IntelliNews runs are still priced, still logged,
still visible. The ceiling is a gate, not the accounting.

### Branding: `Nav.tsx`, `layout.tsx`, `SignOut.tsx`, `globals.css` (changed)

`Nav` already awaits `currentSession()`, so it calls `tenantFor` and renders
that label and strapline, with `data-tenant` on the `<header>` for the accent
colour. `layout.tsx` moves from a static `metadata` export to
`generateMetadata()` for the same reason. The `robots: noindex` block stays
exactly as it is and applies to both.

`SignOut` posts to the door the tenant names, so signing out of IntelliNews
returns to the IntelliNews door.

### `web/proxy.ts` (changed)

An expired session currently redirects to `/login`. It will carry the tenant so
an expired IntelliNews session returns to the IntelliNews door: the proxy runs
on the edge and cannot verify the JWT, so it reads a second, non-sensitive
cookie (`cf_door`) written beside the session at sign-in. It holds a door path
and grants nothing; the session cookie remains the only credential.

## Data flow

    /intellinews-CampaignF
      -> POST /api/auth/login { password, tenant: 'intellinews' }
      -> throttle by IP
      -> checkPassword() -> 'admin' | 'user' | null
      -> 'user' or null, on an adminOnly tenant -> 401, throttle failure
      -> 'admin' -> cookie { workspaceId: 'intellinews', admin: true }
      -> every db call scopes to users/intellinews/*
      -> checkCeiling sees an exempt workspace and returns {}

## Error handling

- Unknown tenant in the login body: 400. No cookie.
- Reviewer password at the IntelliNews door: 401, message identical to a wrong
  password, throttle failure recorded.
- Expired or forged cookie: unchanged. `verifySession` returns null, the proxy
  redirects to the door named by `cf_door`, defaulting to `/login`.
- A `cf_door` naming an unknown door: fall back to `/login` rather than trust it.

## Testing

Added to the existing suites, all offline against the in-memory store:

1. The IntelliNews door refuses `ACCESS_PASSWORD`, with the same status and
   body as a wrong password.
2. It accepts `ADMIN_PASSWORD` and signs `workspaceId: 'intellinews'`.
3. An unknown tenant is a 400 and sets no cookie.
4. A client created under `owner` is not listed under `intellinews`, and the
   reverse.
5. `checkCeiling` refuses an `owner` run over the ceiling and permits the same
   run under `intellinews`.
6. Ledger totals for the ceiling exclude exempt workspaces, while the Ledger
   page's own totals still include them.
7. The header renders each tenant's label.

## Security

The portfolio deployment is a demonstration behind a password. This instance
holds a client's brand material, unpublished copy and briefs, so the bar
rises. Everything below was found by reading the current code, not assumed.

### The password is the whole model, so bound the guessing

`server/throttle.ts` counts failures per IP: ten in fifteen minutes and that
address is locked. Rotating addresses defeats it entirely, and a shared secret
with no username is precisely the target that suits.

A second, global counter is added beside the per-IP one. It deliberately does
**not** lock the door. A global lockout would let anyone on the internet shut
the owner out by failing two hundred times, trading a guessing risk for a
denial-of-service certainty. Instead, past a high threshold (100 failures in
the window) every attempt at every door takes a fixed two-second delay before
the password is checked. Guessing at scale becomes uneconomic; one person with
the right password waits two seconds.

`ADMIN_PASSWORD` also gains a minimum length, refusing to boot below sixteen
characters, exactly as `SESSION_SECRET` already refuses below thirty-two. It is
odd that the signing key is bounded and the password guarding everything is
not.

**Operational note, and it must be checked before this deploys:** if the
current `ADMIN_PASSWORD` is shorter than sixteen characters, adding this check
takes production down on the next deploy. Set a longer one first. This is also
the moment to rotate it, since it stops guarding a demo and starts guarding
client work, and to flip it and `R2_SECRET_ACCESS_KEY` to Sensitive in Vercel
where HANDOVER notes they are still readable from the dashboard.

### Sessions can be ended

The cookie is a seven-day JWT and nothing can invalidate it. A lost laptop
means rotating `SESSION_SECRET`, which signs out every instance at once.

The session gains an `epoch` claim, an integer stored per workspace at
`system/auth/epoch/{ws}`. `verifySession` rejects a token whose epoch is below
the stored one, so bumping it ends every session for that instance and no
other. Settings gets a "Sign out everywhere" button for the current workspace.

The stored epoch is cached in a module global for sixty seconds rather than
read on every request. The trade is explicit: revocation takes up to a minute
to bite, and in exchange the common path adds no Firestore read. For a
single-operator tool that is the right side of the trade, and the number is one
constant if it ever is not.

Session lifetime moves into the tenant record: seven days for `owner`,
unchanged; twenty-four hours for `intellinews`. Both the JWT expiry and the
cookie `maxAge` read from it, so they cannot drift apart.

### Response headers

`next.config.mjs` sets none today, so the app can be framed by any site.
An `async headers()` block adds `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, `Permissions-Policy` denying camera,
microphone and geolocation, `Strict-Transport-Security` with a two-year
max-age, and a Content-Security-Policy with `frame-ancestors 'none'`.

The CSP is nonce-based: the proxy already runs on every request, so it
generates a nonce per request and passes it through a request header for the
layout to place on Next's scripts. `style-src` and `font-src` must admit
`fonts.googleapis.com` and `fonts.gstatic.com`, which `layout.tsx` loads.

**It ships in report-only mode first.** Next inlines bootstrap and hydration
scripts, and a CSP written from first principles and enforced immediately is a
white page in production. Report-only for one deploy, read what the browser
complains about, then enforce. The plan carries both steps; the second is not
optional and must not be left undone.

### Uploads are bounded and typed

`app/api/clients/[id]/sources/route.ts` accepts any file of any size and hands
it to `pdf-parse` or `mammoth`. Both are parsers, and an unbounded parser on a
function with an eight-hundred-second timeout is a cheap way to burn the
account.

Files are capped at ten megabytes each, and the type is checked against an
allowlist of PDF, DOCX, plain text and Markdown -- what `lib/sources.js` can
actually read -- by declared MIME type *and* extension, with anything else
refused as a 415 before a parser sees a byte.

Storage keys stop using the raw `file.name`. This is hygiene rather than a
hole: R2 keys are literal strings, so `../` in a filename cannot escape the
`users/{ws}/` prefix and the read guard in `getFile` holds. But two uploads
called `brand.pdf` silently overwrite one another today, and the name length is
unbounded. Names are reduced to `[A-Za-z0-9._-]`, truncated to 120 characters,
and prefixed with a short random id.

### A record of who came in

`system/auth/signins` gains one document per attempt: time, tenant, outcome,
IP and user agent, kept for ninety days. Settings shows the most recent fifty
to an admin. It is written on success and on failure, so a run of failures
followed by a success is visible as one story.

This is the cheapest security control here and the only one that helps *after*
something has gone wrong.

### Deliberately not included

A second factor on the IntelliNews door was considered and rejected for now.
It is the strongest available control and the argument against it is honest
rather than technical: it adds an enrolment step and a recovery code whose loss
locks the owner out of client work. Worth revisiting if the instance is ever
shared with anyone.

### Security tests

8. A global failure count past the threshold delays a sign-in without
   refusing it, and a correct password still succeeds while delayed.
9. Boot fails when `ADMIN_PASSWORD` is under sixteen characters.
10. A token carrying a stale epoch is rejected; bumping one workspace's epoch
    leaves the other's sessions valid.
11. An `intellinews` cookie expires in twenty-four hours, an `owner` one in
    seven days.
12. An oversized upload is refused with 413, a disallowed type with 415, and
    neither reaches a parser.
13. Two uploads of the same filename produce two distinct keys.
14. A sign-in and a failed attempt each write one audit row.

## Out of scope

- The IntelliNews client already in the shared portfolio library stays there.
  The new workspace starts empty.
- No IntelliNews brief, voice or avoid-terms are pre-loaded.
- The Anthropic key stays a single `ANTHROPIC_API_KEY` for both instances.
  Switching it to a company key later is an environment change in Vercel and
  needs nothing from this design.
- No separate domain, and no path prefix on any page but the door.
