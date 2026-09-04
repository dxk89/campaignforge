# A second instance: IntelliNews

Written 4 September 2026.

## What this is

A separate Campaign Forge for IntelliNews client work, living inside the same
repository and the same Vercel project as the portfolio deployment. It has its
own door, its own library, its own branding, and no spend ceiling. It is not a
second deployment and not a fork: one push deploys both, and every fix reaches
both.

## Why not a second deployment

The obvious shape is a second Vercel project with its own domain and its own
Firestore. It was rejected because it doubles the operational surface -- two sets
of environment variables, two places a secret can be stale, two builds to watch
—- to separate data that `server/db.ts` already separates by workspace. The
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

Two entries: `owner` (Campaign Forge, `/login`, not admin-only, governed by the
ceiling) and `intellinews` (admin-only, exempt). Exported helpers:
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

The cookie is then signed with the tenant's id as `workspaceId`.

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

## Out of scope

- The IntelliNews client already in the shared portfolio library stays there.
  The new workspace starts empty.
- No IntelliNews brief, voice or avoid-terms are pre-loaded.
- The Anthropic key stays a single `ANTHROPIC_API_KEY` for both instances.
  Switching it to a company key later is an environment change in Vercel and
  needs nothing from this design.
- No separate domain, and no path prefix on any page but the door.
