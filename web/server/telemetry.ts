/**
 * How the tool itself is used: which agents get regenerated, which tabs get
 * read, what gets exported. No third-party analytics; the counters live beside
 * everything else and never leave.
 */
import { db as fsdb, storeEnabled } from './firebase';
import { FieldValue } from 'firebase-admin/firestore';

declare global { var __cfTelemetry: Map<string, Record<string, number>> | undefined; }
const mem = globalThis.__cfTelemetry ?? (globalThis.__cfTelemetry = new Map());

const monthKey = () => new Date().toISOString().slice(0, 7);

export async function count(ws: string, key: string, by = 1) {
  const month = monthKey();
  if (!storeEnabled) {
    const m = mem.get(month) || {};
    m[key] = (m[key] || 0) + by;
    mem.set(month, m);
    return;
  }
  try {
    await fsdb().doc(`users/${ws}/telemetry/${month}`).set({ counters: { [key]: FieldValue.increment(by) } }, { merge: true });
  } catch { /* telemetry must never break a request */ }
}

export async function read(ws: string, month = monthKey()) {
  if (!storeEnabled) return { month, counters: mem.get(month) || {} };
  const doc = await fsdb().doc(`users/${ws}/telemetry/${month}`).get();
  return { month, counters: doc.exists ? doc.data()!.counters || {} : {} };
}
