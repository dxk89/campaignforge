# Deploying Campaign Forge

Written for someone who has not read this repository. Roughly 30 minutes. Every step says what breaks if you skip it.

You need: a Google account, a GitHub account with the repo, a Vercel account, and an Anthropic API key.

---

## 1. Firebase project

1. console.firebase.google.com → **Add project**. Name it anything; Google Analytics is not needed.
2. **Build → Authentication → Get started → Google** → enable → set a support email → Save.
   *Skip this and sign-in fails with "operation not allowed".*
3. **Build → Firestore Database → Create database** → production mode → choose a region near you (`europe-west3` for Portugal). The rules you deploy in step 4 replace the defaults.
4. **Object storage is Cloudflare R2, not Firebase Storage.** At
   dash.cloudflare.com → R2, create a bucket, then **Manage API Tokens** →
   create a token with Object Read & Write scoped to it. Note the Account ID,
   Access Key ID, Secret Access Key and bucket name for the variables below.
   *R2 gives 10 GB at no cost and charges nothing for egress, which matters
   because every image the workbench renders is a download through
   /api/files. Leave these unset and uploads go to memory and vanish on the
   next cold start; the app refuses to start rather than let that happen
   silently once Firestore is configured.*
5. **Project settings (gear) → General**, scroll to "Your apps" → **Add app → Web** (`</>`). Register it, then copy the config values. You need `apiKey`, `authDomain`, `projectId`, `storageBucket`, `appId`.
6. **Project settings → Service accounts → Generate new private key**. A JSON file downloads. Convert it to one line:
   ```bash
   base64 -w0 serviceAccount.json          # Linux
   base64 -i serviceAccount.json | tr -d '\n'   # macOS
   ```
   *This is a credential with full project access. Never commit it.*

## 2. Security rules

From the repo root, with the Firebase CLI installed (`npm i -g firebase-tools`, then `firebase login`):

```bash
export ALLOWED_EMAIL=you@yourdomain.com
node scripts/deploy-rules.js
firebase use <your-project-id>
firebase deploy --only firestore:rules
```

The script writes your address into the rule templates in `.rules-build/`, which is gitignored, so the address is never committed.

*Skip this and Firestore stays on its default rules. In production mode that means every read and write is denied and the app looks broken; in test mode it means anyone can read your clients' data.*

## 3. Vercel

1. vercel.com/new → import the GitHub repository.
2. **Root Directory: `web`.** This is the one setting that must be right. The framework preset (Next.js) is detected automatically. Leave build and install commands empty.
   *Get this wrong and the build fails: the runtime in `web/core/` is only traced and installed when `web` is the root.*
3. Add environment variables (Settings → Environment Variables), all environments:

| Variable | Value | If missing |
|---|---|---|
| `ANTHROPIC_API_KEY` | your key | Every agent run fails at startup |
| `FIREBASE_SERVICE_ACCOUNT` | the base64 string from step 1.6 | Runs in memory; nothing survives a restart |
| `R2_ACCOUNT_ID` | Cloudflare dashboard → R2 → Account ID | Uploads and images are lost on restart |
| `R2_ACCESS_KEY_ID` | R2 → Manage API Tokens | Same |
| `R2_SECRET_ACCESS_KEY` | shown once when the token is created | Same |
| `R2_BUCKET` | the bucket name you created | Same |
| `ALLOWED_EMAIL` | the only address that may sign in | Sign-in is refused |
| `ALLOWED_UID` | `owner` | Defaults to `owner`; only change it if you know why |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | from step 1.5 | The sign-in button fails |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | from step 1.5 | Sign-in popup fails |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | from step 1.5 | Sign-in fails |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | from step 1.5 | Harmless client-side |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | from step 1.5 | Sign-in fails |
| `GEMINI_API_KEY` | optional | Image generation is off; cards still work |
| `GEMINI_IMAGE_MODEL` | optional override | Uses the default |
| `JINA_API_KEY` | optional | Scanner falls back to plain fetch |
| `PEXELS_API_KEY` | optional (Phase 3) | Stock photography unavailable |
| `LANGUAGETOOL_URL` | optional (Phase 2) | Uses the public API's rate limit |
| `MOCK_CLAUDE` | leave unset | `1` returns fixtures and spends nothing |

4. Deploy.
5. Back in Firebase: **Authentication → Settings → Authorised domains** → add your Vercel domain (`your-app.vercel.app` and any custom domain).
   *Skip this and the sign-in popup closes with "unauthorised domain".*

## 4. Verify, in order

1. `https://your-app.vercel.app/api/health` → expect `{"ok":true,"mock":false,"images":true|false,"auth":true,"stack":"next"}`.
   `auth:false` means `ALLOWED_EMAIL` is missing. `mock:true` means `MOCK_CLAUDE` is set.
2. Open the app. Sign in with the allowlisted account. A different Google account must be refused; try one.
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
| "unauthorised domain" on sign-in | Vercel domain not added in Firebase Auth settings |
| Signed in but every page is empty | Rules not deployed, or `ALLOWED_EMAIL` differs from the account you used |
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
