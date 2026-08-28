/**
 * Object storage for uploads, brand assets, generated images and evidence.
 *
 * Backed by Cloudflare R2 rather than Firebase Storage. R2 is S3-compatible,
 * gives 10 GB at no cost, and charges nothing for egress, which matters here
 * because every image the workbench renders is a download through
 * /api/files/[...ref]. Firestore still holds everything structured; this
 * module is only ever handed bytes.
 *
 * Falls back to an in-memory map when R2 is not configured, so mock runs and
 * the test suites round-trip a file with no account anywhere (invariant 11).
 *
 * Refs are unchanged from the Firebase implementation: `users/<uid>/...`.
 * They are storage keys, not URLs; rendering one goes through the file route.
 */
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { storeEnabled, uid } from './firebase';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;

export const storageEnabled = Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET);

// A deployment with a real database but no bucket would accept uploads and
// lose them on the next cold start, with nothing in the logs to say so. Fail
// at load instead. Mock mode and the suites set neither, so they are
// unaffected; this only fires on a half-configured deployment.
if (storeEnabled && !storageEnabled) {
  throw new Error(
    'Firestore is configured but R2 is not, so uploads would be written to memory and lost. ' +
      'Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET, or unset ' +
      'FIREBASE_SERVICE_ACCOUNT to run fully in memory. See docs/DEPLOY.md.',
  );
}

// Pinned to globalThis for the same reason as the db store: Next gives route
// handlers and server components separate module graphs, so a module-level Map
// exists twice.
declare global { var __cfFiles: Map<string, { buffer: Buffer; mime: string }> | undefined; }
const memFiles = globalThis.__cfFiles ?? (globalThis.__cfFiles = new Map<string, { buffer: Buffer; mime: string }>());

declare global { var __cfR2: S3Client | undefined; }
function client(): S3Client {
  if (globalThis.__cfR2) return globalThis.__cfR2;
  globalThis.__cfR2 = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! },
  });
  return globalThis.__cfR2;
}

const key = (p: string) => `users/${uid()}/${p}`;

export async function putFile(path: string, buffer: Buffer, mime = 'application/octet-stream'): Promise<string> {
  const ref = key(path);
  if (!storageEnabled) { memFiles.set(ref, { buffer, mime }); return ref; }
  await client().send(new PutObjectCommand({
    Bucket: BUCKET, Key: ref, Body: buffer, ContentType: mime,
  }));
  return ref;
}

export async function getFile(ref: string): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!storageEnabled) return memFiles.get(ref) ?? null;
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: BUCKET, Key: ref }));
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return { buffer: Buffer.from(bytes), mime: res.ContentType || 'application/octet-stream' };
  } catch (err) {
    // A missing object is a normal answer here, not a failure: callers render
    // "not found". Anything else is a real fault and should surface.
    const name = (err as { name?: string; $metadata?: { httpStatusCode?: number } });
    if (name.name === 'NoSuchKey' || name.name === 'NotFound' || name.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function putDataUrl(path: string, dataUrl: string): Promise<string | null> {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  return putFile(path, Buffer.from(m[2], 'base64'), m[1]);
}

export async function listFiles(prefix: string): Promise<string[]> {
  const full = key(prefix);
  if (!storageEnabled) return [...memFiles.keys()].filter((k) => k.startsWith(full));
  // ListObjectsV2 caps a page at 1000 keys. A client with a year of daily
  // social images passes that, so follow the continuation token.
  const out: string[] = [];
  let token: string | undefined;
  do {
    const res: ListObjectsV2CommandOutput = await client().send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: full, ContinuationToken: token,
    }));
    for (const o of res.Contents || []) if (o.Key) out.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

export function __resetFiles() { memFiles.clear(); }
