# Human actions: getting Campaign Forge running

Everything buildable is built and pushed. This is what only you can do, in order. Budget about 45 minutes for §1–3, which is the point where it works.

Repository: `github.com/dxk89/campaignforge` at `5378b9d`. Six test suites pass.

---

## 0. First, revoke the token

The classic `ghp_` token used to push has been in our chat several times and grants access to **all** your repositories. Revoke it at https://github.com/settings/tokens before anything else. If you want me pushing again later, make a fine-grained one scoped to `campaignforge` with Contents: read and write.

---

## 1. Fix the Vercel deployment (5 minutes)

The build failed because the agent runtime sat outside the deployed directory. That is fixed in code; one setting change finishes it.

1. Vercel → your `campaignforge` project → **Settings → General**.
2. **Root Directory**: set to `web`. Save.
3. Leave Framework Preset as Next.js (auto-detected). Clear any custom Build or Install command.
4. **Deployments → Redeploy** the latest commit.

It should build. If it does not, the log will name a missing environment variable, which §2 supplies.

---

## 2. Firebase (20 minutes)

Without this the app runs but forgets everything on restart.

1. **console.firebase.google.com → Add project.** Analytics not needed.
2. **Authentication → Get started → Google** → enable → set a support email → Save.
3. **Firestore Database → Create database** → *production mode* → region `europe-west3`.
4. **Storage → Get started** → same region.
5. **Project settings → General → Your apps → Add app → Web.** Copy `apiKey`, `authDomain`, `projectId`, `storageBucket`, `appId`.
6. **Project settings → Service accounts → Generate new private key.** Then, in a terminal:
   ```bash
   base64 -i serviceAccount.json | tr -d '\n'     # macOS
   base64 -w0 serviceAccount.json                 # Linux
   ```
   Keep that string; it is a full-access credential. Never commit it.
7. **Deploy the security rules.** From a clone of the repo:
   ```bash
   npm i -g firebase-tools && firebase login
   export ALLOWED_EMAIL=you@yourdomain.com
   node scripts/deploy-rules.js
   firebase use <your-project-id>
   firebase deploy --only firestore:rules,storage
   ```
   Skipping this leaves Firestore on its defaults: in production mode every read is denied and the app looks broken.
8. **Authentication → Settings → Authorised domains** → add your Vercel domain. Without it the sign-in popup closes with "unauthorised domain".

---

## 3. Environment variables in Vercel (10 minutes)

Settings → Environment Variables, all environments, then redeploy.

**Required:**

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key |
| `FIREBASE_SERVICE_ACCOUNT` | the base64 string from §2.6 |
| `FIREBASE_STORAGE_BUCKET` | `<project-id>.appspot.com` |
| `ALLOWED_EMAIL` | the only address that may sign in |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | from §2.5 |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | from §2.5 |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | from §2.5 |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | from §2.5 |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | from §2.5 |

**Optional:** `GEMINI_API_KEY` (images; without it the typographic cards still work), `JINA_API_KEY` (better site scanning, free tier), `ALLOWED_UID` (defaults to `owner`).

`docs/DEPLOY.md` has the full table including what breaks when each is missing.

---

## 4. Verify it works (10 minutes)

In this order. Each step depends on the one before.

1. `https://your-app.vercel.app/api/health` → `{"ok":true,"mock":false,"auth":true,...}`. `auth:false` means `ALLOWED_EMAIL` is missing; `mock:true` means `MOCK_CLAUDE` is set.
2. Sign in. **Then try a different Google account and confirm it is refused.** That is the only test of the allowlist that matters.
3. **New client** with a real company URL. Within ten seconds you should see their palette, fonts and page count. An empty palette means the site is client-rendered, which is reported rather than hidden.
4. Open the client: sources listed with character counts.
5. **New campaign**, fill the three text fields, **Generate campaign**. Roughly €2–3 with research on, two to four minutes.
6. **Reload the page.** Everything must still be there. That single check is what Phase 1 was for.
7. **Ledger** → the run, priced per agent.
8. **Settings → Export** → a zip downloads.

---

## 5. Run the emulator test once (10 minutes, needs Java)

Every automated test runs against the in-memory store. The Firestore path, the one production uses, has never actually executed. I could not run it here: the emulator downloads its JAR from `storage.googleapis.com`, which my sandbox blocks.

```bash
cd campaignforge && npm install && cd web && npm install && cd ..
npm run test:emulator
```

It runs the same assertions against a real Firestore. If it passes, the storage path is proven. If it fails, it will fail on a helper name or a query, which is exactly the kind of bug that would otherwise appear on your first real client.

---

## 6. Decisions only you can make

1. **Keep or delete `legacy/`.** It still runs and gives the shared runtime a second independent client, which has already caught things. The plan says delete it once Phase 2's editing work lands. No action needed now; just do not let it linger unnoticed.
2. **The calibration sets.** The training plan asks for twenty human-rated outputs per agent, scored against each agent's rubric. This is the part that checks whether the Critic and the evals agree with an actual marketer, and it cannot be delegated. Start with the Copywriter and the Critic.
3. **The worked examples are mine, not yours.** Every example in `knowledge/` is original work I wrote for fictional companies. Your own best IntelliNews work, annotated with why it worked, would be better training material. Replacing two or three of mine would measurably improve the output.
4. **Check the facts in the Data Points brief.** `Data-Points-marketing-campaign-brief.docx` has a budget, KPI targets, dates and a landing page URL I invented to give the brief its shape, plus "since 2001" as a credibility line. Fix those before it goes near Ben or Anton.
5. **Anthropic and Google API terms.** `docs/DATA-HANDLING.md` says a client's material is sent to both providers. Before you answer a client in writing about training on their data, check the terms in force for your accounts.

---

## 7. Before you show it to anyone outside

The plan is explicit about this and I would not soften it: **reach the Phase 2 exit first.** Until editing, approvals and the approved-claims registry exist, this is a demonstration of a system rather than a tool someone uses daily, and a working marketer will find that out in the first five minutes.

Phase 2 is `docs/build/03-phase2-workspace.md`, 8–10 days of work. Before it, Week 2 (`01-week2-reviewers.md`) adds the Critic, which is the single largest quality improvement available: a second model reviewing every writer's output.

Then run twenty real briefs through it and read the output yourself. You should know its failure modes before a client finds them.

---

## What is already done

For completeness, so you are not looking for it:

- Vercel build fixed in code (runtime moved inside the deployed root, verified with a clean-copy build).
- Phase 1 complete: auth, data layer, client library, persisted campaigns with resume and stale detection, eleven result tabs, image generation, all four exports, ledger, settings, data-handling statement.
- Phase 1's remaining tasks 11–17 and 19: navigation, URL and paste sources, brand assets with a file-streaming route, briefing-document upload, image UI with card/photo toggle and logo compositing, campaign exports, the UTM table, memory reading Firestore, and the deployment runbook.
- Six test suites, all passing.
- Nine build specs, the agent training plan, the tooling map, 47 knowledge files, and `HANDOVER.md` for whoever builds next.
