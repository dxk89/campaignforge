/**
 * The exemplar bank: every output a person approved, tagged and retrievable.
 *
 * This is the practical substitute for fine-tuning. An agent's packet includes
 * the best-matching exemplars for that client, so the copywriter for a client's
 * fifth campaign starts with four campaigns of approved copy in front of it.
 * Rejections with a note are kept too, and shown as "not this".
 */
import { db as fsdb, storeEnabled } from './firebase';
import { newId } from './db';
import type { AssetDoc } from './assets';

declare global { var __cfExemplars: Map<string, any[]> | undefined; }
const mem = globalThis.__cfExemplars ?? (globalThis.__cfExemplars = new Map());
const path = (ws: string, clientId: string) => `users/${ws}/clients/${clientId}/exemplars`;

const AGENT_FOR: Record<string, string> = {
  meta: 'copywriter', linkedin: 'copywriter', google: 'copywriter', email: 'copywriter',
  social: 'social-planner', landing: 'landing-writer',
};

export async function recordExemplar(ws: string, clientId: string, asset: AssetDoc, campaignId: string, brief: any, kind: 'approved' | 'rejected') {
  const doc = {
    exemplarId: newId(),
    agent: AGENT_FOR[asset.channel] || 'copywriter',
    channel: asset.channel, unit: asset.unit, field: asset.field, language: asset.language,
    objective: brief?.objective ?? null, tone: brief?.tone ?? null,
    text: asset.text, assetId: asset.assetId, campaignId,
    approvedAt: new Date().toISOString(), performance: null,
    kind, note: asset.note ?? null,
  };
  if (storeEnabled) await fsdb().doc(`${path(ws, clientId)}/${doc.exemplarId}`).set(doc);
  else mem.set(clientId, [...(mem.get(clientId) || []), doc]);
  return doc;
}

export async function listExemplars(ws: string, clientId: string) {
  if (!storeEnabled) return mem.get(clientId) || [];
  return (await fsdb().collection(path(ws, clientId)).get()).docs.map((d) => d.data());
}

/** After results arrive, attach performance to the exemplars whose asset matched. */
export async function attachPerformance(ws: string, clientId: string, rows: any[], metric = 'conversions') {
  const all = await listExemplars(ws, clientId);
  const byAsset = new Map<string, number>();
  for (const r of rows) {
    if (!r.matchedAssetId) continue;
    const rate = r.clicks ? r.conversions / r.clicks : 0;
    byAsset.set(r.matchedAssetId, rate);
  }
  for (const e of all) {
    const key = `${e.channel}.${e.unit}.${e.language}`;
    if (!byAsset.has(key)) continue;
    const updated = { ...e, performance: { metric, value: byAsset.get(key) } };
    if (storeEnabled) await fsdb().doc(`${path(ws, clientId)}/${e.exemplarId}`).set(updated);
    else mem.set(clientId, (mem.get(clientId) || []).map((x: any) => (x.exemplarId === e.exemplarId ? updated : x)));
  }
}

export function __resetExemplars() { mem.clear(); }
