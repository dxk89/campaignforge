/**
 * Failed-login throttling, keyed by IP.
 *
 * A shared password on a public form is a weekend's work to crack without
 * this, so it is not optional. Counters live at system/login_attempts and
 * expire by time rather than by a sweep: a record older than the window is
 * treated as absent, which needs no scheduled cleanup.
 */
import { db as fsdb, storeEnabled } from './firebase';

export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;

type Record = { count: number; firstAt: number };

declare global { var __cfThrottle: Map<string, Record> | undefined; }
const mem = globalThis.__cfThrottle ?? (globalThis.__cfThrottle = new Map<string, Record>());

const key = (ip: string) => ip.replace(/[^a-zA-Z0-9.:_-]/g, '_') || 'unknown';
const doc = (ip: string) => fsdb().doc(`system/auth/login_attempts/${key(ip)}`);

async function read(ip: string): Promise<Record | null> {
  if (!storeEnabled) return mem.get(key(ip)) ?? null;
  const snap = await doc(ip).get();
  return snap.exists ? (snap.data() as Record) : null;
}

async function write(ip: string, rec: Record): Promise<void> {
  if (storeEnabled) await doc(ip).set(rec);
  else mem.set(key(ip), rec);
}

export async function isLocked(ip: string): Promise<boolean> {
  const rec = await read(ip);
  if (!rec) return false;
  if (Date.now() - rec.firstAt > WINDOW_MS) return false;
  return rec.count >= MAX_FAILURES;
}

export async function recordFailure(ip: string): Promise<void> {
  const rec = await read(ip);
  if (!rec || Date.now() - rec.firstAt > WINDOW_MS) {
    await write(ip, { count: 1, firstAt: Date.now() });
    return;
  }
  await write(ip, { count: rec.count + 1, firstAt: rec.firstAt });
}

export async function clearFailures(ip: string): Promise<void> {
  if (storeEnabled) await doc(ip).delete().catch(() => {});
  else mem.delete(key(ip));
}

export function __resetThrottle() { mem.clear(); }
