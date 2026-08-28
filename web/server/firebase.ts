/**
 * Firebase Admin, server-side only.
 *
 * The service account arrives as base64 JSON in FIREBASE_SERVICE_ACCOUNT so it
 * survives being an environment variable. When it is absent the app runs in
 * "no store" mode: reads return empty, writes are no-ops, and mock mode plus
 * the test suites work with no Firebase project at all. That is deliberate —
 * a reviewer must be able to run this with one command and no accounts.
 */
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App | null = null;

export const storeEnabled = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);

function init(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length) { app = existing[0]; return app; }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  // Accept the downloaded JSON as-is or base64 of it. Base64 was the only
  // form for a long time because a PEM private key full of newlines is
  // awkward in a .env file, but Vercel and Firebase both take a multi-line
  // value fine, and requiring an encoding step means a terminal. Sniffing '{'
  // is safe: base64 has no braces.
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const json = JSON.parse(text);
  // The emulator authenticates nothing, so there is no real private key to
  // present and cert() would throw parsing the placeholder one. Project id
  // alone is what it wants. Gated on FIRESTORE_EMULATOR_HOST, which the
  // emulator sets and production never does, so the credentialled path below
  // is untouched.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    app = initializeApp({ projectId: json.project_id });
    return app;
  }
  app = initializeApp({ credential: cert(json) });
  return app;
}

export function db(): Firestore {
  const f = getFirestore(init());
  return f;
}

/** The single allowed user's uid namespace. One operator, many clients. */
export function uid(): string {
  return process.env.ALLOWED_UID || 'owner';
}
