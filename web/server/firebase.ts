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
import { getStorage } from 'firebase-admin/storage';

let app: App | null = null;

export const storeEnabled = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);

function init(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length) { app = existing[0]; return app; }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  const json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${json.project_id}.appspot.com`;
  // The emulator authenticates nothing, so there is no real private key to
  // present and cert() would throw parsing the placeholder one. Project id
  // alone is what it wants. Gated on FIRESTORE_EMULATOR_HOST, which the
  // emulator sets and production never does, so the credentialled path below
  // is untouched.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    app = initializeApp({ projectId: json.project_id, storageBucket });
    return app;
  }
  app = initializeApp({ credential: cert(json), storageBucket });
  return app;
}

export function db(): Firestore {
  const f = getFirestore(init());
  return f;
}

export function bucket() {
  return getStorage(init()).bucket();
}

/** The single allowed user's uid namespace. One operator, many clients. */
export function uid(): string {
  return process.env.ALLOWED_UID || 'owner';
}
