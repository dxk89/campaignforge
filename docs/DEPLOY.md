# Deploying Campaign Forge

Written for someone who has not read this repository. Roughly 30 minutes. Every step says what breaks if you skip it.

You need: a Google account, a GitHub account with the repo, a Vercel account, and an Anthropic API key.

---

## 1. Firebase project

1. console.firebase.google.com → **Add project**. Name it anything; Google Analytics is not needed.
2. **Build → Firestore Database → Create database** → production mode → choose a region near you (`europe-west3` for Portugal). The rules you deploy in step 2 replace the defaults.
3. **Object storage is Cloudflare R2, not Firebase Storage.** At
   dash.cloudflare.com → R2, create a bucket, then **Manage API Tokens** →
   create a token with Object Read & Write scoped to it. Note the Account ID,
   Access Key ID, Secret Access Key and bucket name for the variables below.
   *R2 gives 10 GB at no cost and charges nothing for egress, which matters
   because every image the workbench renders is a download through
   /api/files. Leave these unset and uploads go to memory and vanish on the
   next cold start; the app refuses to start rather than let that happen
   silently once Firestore is configured.*
4. **Project settings → Service accounts → Generate new private key**. A JSON file downloads. Convert it to one line:
   ```bash
   base64 -w0 serviceAccount.json          # Linux
   base64 -i serviceAccount.json | tr -d '\n'   # macOS
   ```
   *This is a credential with full project access. Never commit it.*

## 2. Security rules

Firestore is reached only through the Admin SDK on the server, so these rules
are a deny-all; they exist to stop a browser reaching Firestore directly, not
to protect tenant data (that is the `ws` parameter in application code — see
`firestore.rules` and `CLAUDE.md`). Deploying them is still required, because
the project's defaults are more permissive than the deny-all this app relies
on.

From the repo root, with the Firebase CLI installed (`npm i -g firebase-tools`, then `firebase login`):

```bash
node scripts/deploy-rules.js
firebase use <your-project-id>
firebase deploy --only firestore:rules
```

The script copies `firestore.rules` into `.rules-build/`, which is gitignored.

*Skip this and Firestore stays on its default rules. In production mode that means every read and write is denied and the app looks broken; in test mode it means anyone can read your clients' data.*

## 3. Vercel

1. vercel.com/new → import the GitHub repository.
2. **Root Directory: `web`.** This is the one setting that must be right. The framework preset (Next.js) is detected automatically. Leave build and install commands empty.
   *Get this wrong and the build fails: the runtime in `web/core/` is only traced and installed when `web` is the root.*
3. Add environment variables (Settings → Environment Variables), all environments:

| Variable | Value | If missing |
|---|---|---|
| `ANTHROPIC_API_KEY` | your key | Every agent run fails at startup |
| `FIREBASE_SERVICE_ACCOUNT` | the JSON file contents, pasted whole (base64 of it also works) | Runs in memory; nothing survives a restart |
| `R2_ACCOUNT_ID` | Cloudflare dashboard → R2 → Account ID | Uploads and images are lost on restart |
| `R2_ACCESS_KEY_ID` | R2 → Manage API Tokens | Same |
| `R2_SECRET_ACCESS_KEY` | shown once when the token is created | Same |
| `R2_BUCKET` | the bucket name you created | Same |
| `ACCESS_PASSWORD` | the password given to reviewers | Only the admin password works |
| `ADMIN_PASSWORD` | the owner's sign-in password | Owner sign-in is refused |
| `SESSION_SECRET` | at least 32 characters; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | The app throws at startup rather than run with a weak or missing secret |
| `GEMINI_API_KEY` | optional | Image generation is off; cards still work |
| `GEMINI_IMAGE_MODEL` | optional override | Uses the default |
| `JINA_API_KEY` | optional | Scanner falls back to plain fetch |
| `PEXELS_API_KEY` | optional (Phase 3) | Stock photography unavailable |
| `LANGUAGETOOL_URL` | optional (Phase 2) | Uses the public API's rate limit |
| `MOCK_CLAUDE` | leave unset | `1` returns fixtures and spends nothing |

4. Deploy.

**If you are redeploying an existing instance that already had a monthly
ceiling set:** the ceiling moved from a per-workspace document to a single
global one (`system/spend/global`), and nothing migrates the old value
across. It comes back as "none" with no error, no log line, and no warning
in the UI. Go to **Settings** straight after deploying and re-enter the
monthly ceiling, or the spend cap is silently off until you do.

## 4. Verify, in order

1. `https://your-app.vercel.app/api/health` → expect `{"ok":true,"mock":false,"images":true|false,"auth":true,"stack":"next"}`.
   `auth:false` means neither `ADMIN_PASSWORD` nor `ACCESS_PASSWORD` is set. `mock:true` means `MOCK_CLAUDE` is set.
2. Open the app. Sign in with `ADMIN_PASSWORD`. A wrong password must be refused; try one. Then sign in with `ACCESS_PASSWORD` and confirm Settings will not let you change the ceiling.
3. **Clients → New client**, paste a real company URL. Within about ten seconds you should see their palette, fonts and page count. If the palette is empty, the site is probably client-rendered; that is expected and reported.
4. Open the client, check the sources list has pages with character counts.
5. **New campaign**, fill the three text fields, press **Generate campaign**. Watch the stepper. First run costs roughly €2–3 with online research on.
6. **Ledger** → the run appears, priced per agent.
7. Reload the campaign page. Everything must still be there. That is the whole point of Phase 1.
8. **Settings → Export** → a zip downloads.

## 5. Running costs

Vercel Hobby and Firebase Spark are free at this volume. Model spend is the real cost: roughly €2–3 per campaign with research, plus about €0.06 per generated image. The ledger page is the record.

## 6. Stopping spend without taking the app down

Set `MOCK_CLAUDE=1` in Vercel and redeploy. The app keeps working and returns fixture campaigns at zero cost. Unset it to resume.

## 7. If something fails

| Symptom | Cause |
|---|---|
| Build fails on Vercel | Root Directory is not `web` |
| Sign-in refused | `ADMIN_PASSWORD` missing or wrong |
| Signed in but every page is empty | `FIREBASE_SERVICE_ACCOUNT` missing, or you are looking at the wrong workspace |
| Data vanishes on redeploy | `FIREBASE_SERVICE_ACCOUNT` missing; you are on the in-memory store |
| Agent runs fail immediately | `ANTHROPIC_API_KEY` missing or invalid |
| Images unavailable | `GEMINI_API_KEY` not set. Expected; cards still work |
| A run stops partway | Open the campaign and press **Resume**. Finished passes are saved |

## 8. Local development

```bash
npm install && cd web && npm install && cd ..
MOCK_CLAUDE=1 MOCK_AUTH=1 npm run web     # no keys, no accounts, in-memory
npm test                                   # six suites
```

To develop against real Firebase locally, put the same variables in `web/.env.local`.
