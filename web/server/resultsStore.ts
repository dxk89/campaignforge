/** Results documents and the learnings they produce. */
import { db as fsdb, storeEnabled } from './firebase';
import { newId } from './db';

const now = () => new Date().toISOString();

declare global { var __cfResults: Map<string, any[]> | undefined; var __cfLearnings: Map<string, any[]> | undefined; }
const memResults = globalThis.__cfResults ?? (globalThis.__cfResults = new Map());
const memLearnings = globalThis.__cfLearnings ?? (globalThis.__cfLearnings = new Map());

const rpath = (ws: string, c: string, k: string) => `users/${ws}/clients/${c}/campaigns/${k}/results`;
const lpath = (ws: string, c: string) => `users/${ws}/clients/${c}/learnings`;

export async function saveResults(ws: string, clientId: string, campaignId: string, data: any) {
  const resultId = newId();
  const summary = {
    rows: data.rows.length,
    matched: data.rows.filter((r: any) => r.matchedAssetId).length,
    unmatched: data.unmatched.length,
    clicks: data.rows.reduce((n: number, r: any) => n + (r.clicks || 0), 0),
    conversions: data.rows.reduce((n: number, r: any) => n + (r.conversions || 0), 0),
    spend: Number(data.rows.reduce((n: number, r: any) => n + (r.spend || 0), 0).toFixed(2)),
  };
  const doc = { resultId, uploadedAt: now(), ...data, summary };
  if (storeEnabled) await fsdb().doc(`${rpath(ws, clientId, campaignId)}/${resultId}`).set(doc);
  else {
    const key = `${clientId}/${campaignId}`;
    memResults.set(key, [...(memResults.get(key) || []), doc]);
  }
  return doc;
}

export async function listResults(ws: string, clientId: string, campaignId: string) {
  let docs: any[];
  if (!storeEnabled) docs = memResults.get(`${clientId}/${campaignId}`) || [];
  else docs = (await fsdb().collection(rpath(ws, clientId, campaignId)).get()).docs.map((d) => d.data());
  const latest = docs[docs.length - 1] || null;
  return { results: docs, verdicts: latest?.verdicts || [], summary: latest?.summary || null, rows: latest?.rows || [] };
}

export async function addLearnings(ws: string, clientId: string, items: any[], campaignId: string, resultId: string) {
  const docs = items.map((l) => ({
    learningId: newId(), ...l, campaignId, resultId,
    status: 'proposed' as const, createdAt: now(), approvedAt: null, note: null,
  }));
  if (storeEnabled) for (const d of docs) await fsdb().doc(`${lpath(ws, clientId)}/${d.learningId}`).set(d);
  else memLearnings.set(clientId, [...(memLearnings.get(clientId) || []), ...docs]);
  return docs;
}

export async function listLearnings(ws: string, clientId: string) {
  if (!storeEnabled) return memLearnings.get(clientId) || [];
  return (await fsdb().collection(lpath(ws, clientId)).get()).docs.map((d) => d.data());
}

export async function updateLearning(ws: string, clientId: string, learningId: string, patch: any) {
  const all = await listLearnings(ws, clientId);
  const existing = all.find((l: any) => l.learningId === learningId);
  if (!existing) return null;
  const merged = { ...existing, ...patch };
  if (patch.status === 'approved' && !merged.approvedAt) merged.approvedAt = now();
  if (storeEnabled) await fsdb().doc(`${lpath(ws, clientId)}/${learningId}`).set(merged);
  else memLearnings.set(clientId, all.map((l: any) => (l.learningId === learningId ? merged : l)));
  return merged;
}

export function __resetResults() { memResults.clear(); memLearnings.clear(); }
