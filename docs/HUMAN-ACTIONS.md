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
3. **Framework Preset: Next.js.** If it says Other, change it: that is the
   leftover from when this repo was an Express app, and it fails the build with
   "No entrypoint found". Clear any custom Build or Install command.
4. **Deployments → Redeploy** the latest commit.

It should build. If it does not, the log will name a missing environment variable, which §2 supplies.

---

## 2. Firebase (20 minutes)

Without this the app runs but forgets everything on restart.

1. **console.firebase.google.com → Add project.** Analytics not needed.
2. **Firestore Database → Create database** → *production mode* → region `europe-west3`.
3. **Object storage is Cloudflare R2, not Firebase Storage.** At
   dash.cloudflare.com → R2, create a bucket, then **Manage API Tokens** →
   create a token with Object Read & Write scoped to it. Note the Account ID,
   Access Key ID, Secret Access Key and bucket name for the variables below.
   *R2 gives 10 GB at no cost and charges nothing for egress, which matters
   because every image the workbench renders is a download through
   /api/files. Leave these unset and uploads go to memory and vanish on the
   next cold start; the app refuses to start rather than let that happen
   silently once Firestore is configured.*
4. **Project settings → Service accounts → Generate new private key.** Then, in a terminal:
   ```bash
   base64 -i serviceAccount.json | tr -d '\n'     # macOS
   base64 -w0 serviceAccount.json                 # Linux
   ```
   Keep that string; it is a full-access credential. Never commit it.
5. **Deploy the security rules.** From a clone of the repo:
   ```bash
   npm i -g firebase-tools && firebase login
   node scripts/deploy-rules.js
   firebase use <your-project-id>
   firebase deploy --only firestore:rules
   ```
   These rules are a deny-all: Firestore is reached only through the Admin
   SDK on the server, which bypasses them. Workspace isolation is enforced by
   the `ws` parameter in application code, not by these rules. Skipping the
   deploy leaves Firestore on the project's defaults, which are more
   permissive than the deny-all this app relies on.

---

## 3. Environment variables in Vercel (10 minutes)

Settings → Environment Variables, all environments, then redeploy.

**Required:**

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key |
| `FIREBASE_SERVICE_ACCOUNT` | the JSON file contents, pasted whole (base64 of it also works) |
| `R2_ACCOUNT_ID` | Cloudflare → R2 → Account ID |
| `R2_ACCESS_KEY_ID` | R2 → Manage API Tokens |
| `R2_SECRET_ACCESS_KEY` | shown once at token creation |
| `R2_BUCKET` | your bucket name |
| `ADMIN_USERNAME` | the owner's sign-in username |
| `ADMIN_PASSWORD` | the owner's sign-in password |
| `SESSION_SECRET` | at least 32 characters; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

**Optional:** `GEMINI_API_KEY` (images; without it the typographic cards still work), `JINA_API_KEY` (better site scanning, free tier).

`docs/DEPLOY.md` has the full table including what breaks when each is missing.

---

## 4. Verify it works (10 minutes)

In this order. Each step depends on the one before.

1. `https://your-app.vercel.app/api/health` → `{"ok":true,"mock":false,"auth":true,...}`. `auth:false` means `ADMIN_USERNAME` or `ADMIN_PASSWORD` is missing; `mock:true` means `MOCK_CLAUDE` is set.
2. Sign in as the owner with `ADMIN_USERNAME`/`ADMIN_PASSWORD`. **Then try a wrong password and confirm it is refused.** That is the only test of the credential check that matters.
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

The Phase 2 gate is now met: editing, approvals and the claims registry exist, and the Critic reviews every writer. It is a tool someone can use daily.

One thing still stands between it and a client: **run twenty real briefs through it and read the output yourself.** The fixtures are polished; real output on real clients is what a marketing company will judge, and you should know its failure modes before they find them.

While you do that, run the evals once for real (`npm run evals`, about EUR 10–15) so you have a baseline. After that, `npm run gate` before keeping any prompt change.

## 8. The largest remaining quality lever, and it is yours

`docs/build/06-agent-training.md` asks for two things I cannot produce:

1. **Calibration sets.** Twenty outputs per agent, rated by hand against that agent's rubric. This is what checks whether the Critic and the evals agree with an actual marketer. Start with the Copywriter and the Critic.
2. **Worked examples from your own work.** Every example in `knowledge/` is original work I wrote for fictional companies. Two or three of yours, annotated with why they worked, would measurably improve the output.

Everything else in the backlog is in `HANDOVER.md` §6 and can be delegated.

---

## What is already done

For completeness, so you are not looking for it:

- Vercel build fixed in code (runtime moved inside the deployed root, verified with a clean-copy build).
- Phase 1 complete: auth, data layer, client library, persisted campaigns with resume and stale detection, eleven result tabs, image generation, all four exports, ledger, settings, data-handling statement.
- Phase 1's remaining tasks 11–17 and 19: navigation, URL and paste sources, brand assets with a file-streaming route, briefing-document upload, image UI with card/photo toggle and logo compositing, campaign exports, the UTM table, memory reading Firestore, and the deployment runbook.
- Six test suites, all passing.
- Nine build specs, the agent training plan, the tooling map, 47 knowledge files, and `HANDOVER.md` for whoever builds next.
