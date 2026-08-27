/**
 * Firebase Storage for uploads, brand assets, generated images and exports.
 * Falls back to an in-memory map when the store is disabled, so mock runs and
 * tests can round-trip a file without a bucket.
 */
import { bucket, storeEnabled, uid } from './firebase';

// Pinned to globalThis for the same reason as the db store: separate module
// graphs for route handlers and server components.
declare global { var __cfFiles: Map<string, { buffer: Buffer; mime: string }> | undefined; }
const memFiles = globalThis.__cfFiles ?? (globalThis.__cfFiles = new Map<string, { buffer: Buffer; mime: string }>());

const key = (p: string) => `users/${uid()}/${p}`;

export async function putFile(path: string, buffer: Buffer, mime = 'application/octet-stream'): Promise<string> {
  const ref = key(path);
  if (!storeEnabled) { memFiles.set(ref, { buffer, mime }); return ref; }
  await bucket().file(ref).save(buffer, { contentType: mime, resumable: false });
  return ref;
}

export async function getFile(ref: string): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!storeEnabled) return memFiles.get(ref) ?? null;
  const file = bucket().file(ref);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buffer] = await file.download();
  const [meta] = await file.getMetadata();
  return { buffer, mime: meta.contentType || 'application/octet-stream' };
}

export async function putDataUrl(path: string, dataUrl: string): Promise<string | null> {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  return putFile(path, Buffer.from(m[2], 'base64'), m[1]);
}

export async function listFiles(prefix: string): Promise<string[]> {
  if (!storeEnabled) return [...memFiles.keys()].filter((k) => k.startsWith(key(prefix)));
  const [files] = await bucket().getFiles({ prefix: key(prefix) });
  return files.map((f) => f.name);
}

export function __resetFiles() { memFiles.clear(); }
