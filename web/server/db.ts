/**
 * Firestore access layer. Every collection in the Phase 1 contract has typed
 * helpers here; nothing else in the app touches Firestore directly.
 *
 * When FIREBASE_SERVICE_ACCOUNT is absent the whole module runs against an
 * in-memory store. That keeps mock mode and the test suites working with no
 * Firebase project, and it is the same code path shape, so a test that passes
 * in memory exercises the same helpers.
 */
import { randomUUID, createHash } from 'crypto';
import { db as fsdb, storeEnabled } from './firebase';
import type { Client, SourceDoc, Campaign, Version, ImageDoc, LedgerEntry, Brief } from './types';

const now = () => new Date().toISOString();
export const newId = () => randomUUID();
export const hashOf = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 32);

// ---- in-memory fallback ------------------------------------------------------
// Pinned to globalThis: Next bundles route handlers and server components into
// separate module graphs, so a module-level Map would exist twice and a client
// created by a POST would be invisible to the page that renders it.
// clients is nested ws -> clientId, so two workspaces never share a bucket to
// iterate or collide keys in; sub is a flat map keyed by a ws-prefixed string,
// which is enough because every caller already builds the whole key at once.
type Mem = { clients: Map<string, Map<string, any>>; sub: Map<string, Map<string, any>> };
declare global { var __cfMem: Mem | undefined; }
const mem: Mem = globalThis.__cfMem ?? (globalThis.__cfMem = { clients: new Map(), sub: new Map() });
const memKey = (...parts: string[]) => parts.join('/');
function memCol(key: string) {
  if (!mem.sub.has(key)) mem.sub.set(key, new Map());
  return mem.sub.get(key)!;
}
function clientsOf(ws: string) {
  if (!mem.clients.has(ws)) mem.clients.set(ws, new Map());
  return mem.clients.get(ws)!;
}

const root = (ws: string) => {
  if (!ws) throw new Error('A workspace id is required. This is a bug: the caller did not pass session.workspaceId.');
  return `users/${ws}`;
};

// ---- clients -----------------------------------------------------------------

export async function createClient(ws: string, input: { name: string; domain?: string | null; brandKit?: any; voice?: any; settings?: any }): Promise<Client> {
  const clientId = newId();
  const doc: Client = {
    clientId,
    name: input.name,
    domain: input.domain ?? null,
    createdAt: now(),
    updatedAt: now(),
    brandKit: input.brandKit ?? { siteName: input.name, tagline: null, palette: null, fonts: [], logoRef: null, artworkRefs: [], scannedAt: null },
    voice: input.voice ?? { observations: [], preferredTerms: [], avoidTerms: [], glossary: [] },
    settings: input.settings ?? { landingUrl: null, defaultTone: 'direct', defaultLanguages: ['en'], calendar: { events: [] } },
  };
  if (storeEnabled) await fsdb().doc(`${root(ws)}/clients/${clientId}`).set(doc);
  else clientsOf(ws).set(clientId, doc);
  return doc;
}

export async function listClients(ws: string): Promise<Client[]> {
  if (!storeEnabled) return [...clientsOf(ws).values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const snap = await fsdb().collection(`${root(ws)}/clients`).orderBy('updatedAt', 'desc').get();
  return snap.docs.map((d) => d.data() as Client);
}

export async function getClient(ws: string, clientId: string): Promise<Client | null> {
  if (!storeEnabled) return clientsOf(ws).get(clientId) ?? null;
  const d = await fsdb().doc(`${root(ws)}/clients/${clientId}`).get();
  return d.exists ? (d.data() as Client) : null;
}

export async function updateClient(ws: string, clientId: string, patch: Partial<Client>): Promise<Client | null> {
  const existing = await getClient(ws, clientId);
  if (!existing) return null;
  const merged = { ...existing, ...patch, clientId, updatedAt: now() } as Client;
  if (storeEnabled) await fsdb().doc(`${root(ws)}/clients/${clientId}`).set(merged);
  else clientsOf(ws).set(clientId, merged);
  return merged;
}

// ---- sources -----------------------------------------------------------------

export async function addSource(ws: string, clientId: string, src: Omit<SourceDoc, 'sourceId' | 'fetchedAt' | 'hash'> & { hash?: string }): Promise<SourceDoc> {
  const sourceId = newId();
  const doc: SourceDoc = { ...src, sourceId, fetchedAt: now(), hash: src.hash ?? hashOf(src.text) };
  if (storeEnabled) await fsdb().doc(`${root(ws)}/clients/${clientId}/sources/${sourceId}`).set(doc);
  else memCol(memKey(ws, clientId, 'sources')).set(sourceId, doc);
  await touch(ws, clientId);
  return doc;
}

export async function listSources(ws: string, clientId: string, withText = false): Promise<SourceDoc[]> {
  let docs: SourceDoc[];
  if (!storeEnabled) docs = [...memCol(memKey(ws, clientId, 'sources')).values()];
  else docs = (await fsdb().collection(`${root(ws)}/clients/${clientId}/sources`).get()).docs.map((d) => d.data() as SourceDoc);
  return withText ? docs : docs.map(({ text, ...rest }) => ({ ...rest, text: '' } as SourceDoc));
}

export async function deleteSource(ws: string, clientId: string, sourceId: string): Promise<void> {
  if (storeEnabled) await fsdb().doc(`${root(ws)}/clients/${clientId}/sources/${sourceId}`).delete();
  else memCol(memKey(ws, clientId, 'sources')).delete(sourceId);
  await touch(ws, clientId);
}

// ---- campaigns ---------------------------------------------------------------

export async function createCampaign(ws: string, clientId: string, brief: Brief): Promise<Campaign> {
  const campaignId = newId();
  const doc: Campaign = { campaignId, brief, status: 'draft', createdAt: now(), updatedAt: now(), current: {} };
  if (storeEnabled) await fsdb().doc(`${root(ws)}/clients/${clientId}/campaigns/${campaignId}`).set(doc);
  else memCol(memKey(ws, clientId, 'campaigns')).set(campaignId, doc);
  await touch(ws, clientId);
  return doc;
}

export async function listCampaigns(ws: string, clientId: string): Promise<Campaign[]> {
  if (!storeEnabled) return [...memCol(memKey(ws, clientId, 'campaigns')).values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const snap = await fsdb().collection(`${root(ws)}/clients/${clientId}/campaigns`).orderBy('updatedAt', 'desc').get();
  return snap.docs.map((d) => d.data() as Campaign);
}

export async function getCampaign(ws: string, clientId: string, campaignId: string): Promise<Campaign | null> {
  if (!storeEnabled) return memCol(memKey(ws, clientId, 'campaigns')).get(campaignId) ?? null;
  const d = await fsdb().doc(`${root(ws)}/clients/${clientId}/campaigns/${campaignId}`).get();
  return d.exists ? (d.data() as Campaign) : null;
}

export async function updateCampaign(ws: string, clientId: string, campaignId: string, patch: Partial<Campaign>): Promise<Campaign | null> {
  const existing = await getCampaign(ws, clientId, campaignId);
  if (!existing) return null;
  const merged = { ...existing, ...patch, campaignId, updatedAt: now() } as Campaign;
  if (storeEnabled) await fsdb().doc(`${root(ws)}/clients/${clientId}/campaigns/${campaignId}`).set(merged);
  else memCol(memKey(ws, clientId, 'campaigns')).set(campaignId, merged);
  await touch(ws, clientId);
  return merged;
}

// ---- versions ----------------------------------------------------------------

export async function addVersion(ws: string, clientId: string, campaignId: string, v: Omit<Version, 'versionId' | 'createdAt'>): Promise<Version> {
  const versionId = newId();
  const doc: Version = { ...v, versionId, createdAt: now() };
  if (storeEnabled) await fsdb().doc(`${root(ws)}/clients/${clientId}/campaigns/${campaignId}/versions/${versionId}`).set(doc);
  else memCol(memKey(ws, clientId, campaignId, 'versions')).set(versionId, doc);

  const campaign = await getCampaign(ws, clientId, campaignId);
  if (campaign) await updateCampaign(ws, clientId, campaignId, { current: { ...campaign.current, [v.agent]: versionId } });
  return doc;
}

export async function getVersion(ws: string, clientId: string, campaignId: string, versionId: string): Promise<Version | null> {
  if (!storeEnabled) return memCol(memKey(ws, clientId, campaignId, 'versions')).get(versionId) ?? null;
  const d = await fsdb().doc(`${root(ws)}/clients/${clientId}/campaigns/${campaignId}/versions/${versionId}`).get();
  return d.exists ? (d.data() as Version) : null;
}

export async function listVersions(ws: string, clientId: string, campaignId: string, agent?: string): Promise<Version[]> {
  let docs: Version[];
  if (!storeEnabled) docs = [...memCol(memKey(ws, clientId, campaignId, 'versions')).values()];
  else docs = (await fsdb().collection(`${root(ws)}/clients/${clientId}/campaigns/${campaignId}/versions`).get()).docs.map((d) => d.data() as Version);
  const filtered = agent ? docs.filter((v) => v.agent === agent) : docs;
  return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Resolve every `current` pointer to its output. */
export async function currentOutputs(ws: string, clientId: string, campaignId: string): Promise<Record<string, Version>> {
  const campaign = await getCampaign(ws, clientId, campaignId);
  if (!campaign) return {};
  const out: Record<string, Version> = {};
  for (const [agent, versionId] of Object.entries(campaign.current)) {
    const v = await getVersion(ws, clientId, campaignId, versionId);
    if (v) out[agent] = v;
  }
  return out;
}

// ---- images ------------------------------------------------------------------

export async function addImage(ws: string, clientId: string, campaignId: string, img: Omit<ImageDoc, 'imageId' | 'createdAt'>): Promise<ImageDoc> {
  const imageId = newId();
  const doc: ImageDoc = { ...img, imageId, createdAt: now() };
  if (storeEnabled) await fsdb().doc(`${root(ws)}/clients/${clientId}/campaigns/${campaignId}/images/${imageId}`).set(doc);
  else memCol(memKey(ws, clientId, campaignId, 'images')).set(imageId, doc);
  return doc;
}

export async function listImages(ws: string, clientId: string, campaignId: string): Promise<ImageDoc[]> {
  if (!storeEnabled) return [...memCol(memKey(ws, clientId, campaignId, 'images')).values()];
  return (await fsdb().collection(`${root(ws)}/clients/${clientId}/campaigns/${campaignId}/images`).get()).docs.map((d) => d.data() as ImageDoc);
}

// ---- claims ------------------------------------------------------------------

export type Claim = {
  claimId: string; text: string; source: string; span: string | null; evidenceRef: string | null;
  status: 'proposed' | 'approved' | 'rejected' | 'expired';
  approvedAt: string | null; expiresAt: string | null; note: string | null; campaignId: string | null; createdAt: string;
};

const norm = (t: string) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Propose a claim. Deduplicated on normalised text so re-running research does not pile up copies. */
export async function proposeClaim(ws: string, clientId: string, input: { text: string; source: string; span?: string | null; campaignId?: string | null }): Promise<Claim | null> {
  const existing = await listClaims(ws, clientId);
  if (existing.some((c) => norm(c.text) === norm(input.text))) return null;
  const claimId = newId();
  const doc: Claim = {
    claimId, text: input.text, source: input.source, span: input.span ?? null, evidenceRef: null,
    status: 'proposed', approvedAt: null, expiresAt: null, note: null,
    campaignId: input.campaignId ?? null, createdAt: now(),
  };
  if (storeEnabled) await fsdb().doc(`${root(ws)}/clients/${clientId}/claims/${claimId}`).set(doc);
  else memCol(memKey(ws, clientId, 'claims')).set(claimId, doc);
  return doc;
}

export async function listClaims(ws: string, clientId: string): Promise<Claim[]> {
  let docs: Claim[];
  if (!storeEnabled) docs = [...memCol(memKey(ws, clientId, 'claims')).values()];
  else docs = (await fsdb().collection(`${root(ws)}/clients/${clientId}/claims`).get()).docs.map((d) => d.data() as Claim);
  const nowIso = now();
  return docs
    .map((c) => (c.status === 'approved' && c.expiresAt && c.expiresAt < nowIso ? { ...c, status: 'expired' as const } : c))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateClaim(ws: string, clientId: string, claimId: string, patch: Partial<Claim>): Promise<Claim | null> {
  const all = await listClaims(ws, clientId);
  const existing = all.find((c) => c.claimId === claimId);
  if (!existing) return null;
  const merged: Claim = { ...existing, ...patch, claimId };
  if (patch.status === 'approved' && !merged.approvedAt) merged.approvedAt = now();
  if (patch.status && patch.status !== 'approved') merged.approvedAt = null;
  if (storeEnabled) await fsdb().doc(`${root(ws)}/clients/${clientId}/claims/${claimId}`).set(merged);
  else memCol(memKey(ws, clientId, 'claims')).set(claimId, merged);
  return merged;
}

// ---- ledger ------------------------------------------------------------------

export async function addLedger(ws: string, entry: Omit<LedgerEntry, 'entryId' | 'at'>): Promise<void> {
  const entryId = newId();
  const doc: LedgerEntry = { ...entry, entryId, at: now() };
  if (storeEnabled) await fsdb().doc(`${root(ws)}/ledger/${entryId}`).set(doc);
  else memCol(memKey(ws, 'ledger')).set(entryId, doc);
}

export async function listLedger(ws: string, month?: string): Promise<LedgerEntry[]> {
  let docs: LedgerEntry[];
  if (!storeEnabled) docs = [...memCol(memKey(ws, 'ledger')).values()];
  else docs = (await fsdb().collection(`${root(ws)}/ledger`).get()).docs.map((d) => d.data() as LedgerEntry);
  const filtered = month ? docs.filter((e) => e.at.startsWith(month)) : docs;
  return filtered.sort((a, b) => b.at.localeCompare(a.at));
}

export function ledgerTotals(entries: LedgerEntry[]) {
  const byAgent: Record<string, number> = {};
  const byClient: Record<string, number> = {};
  let costEur = 0;
  for (const e of entries) {
    byAgent[e.agent] = Number(((byAgent[e.agent] || 0) + e.costEur).toFixed(4));
    if (e.clientId) byClient[e.clientId] = Number(((byClient[e.clientId] || 0) + e.costEur).toFixed(4));
    costEur += e.costEur;
  }
  return { byAgent, byClient, costEur: Number(costEur.toFixed(4)) };
}

// ---- helpers -----------------------------------------------------------------

async function touch(ws: string, clientId: string) {
  const c = await getClient(ws, clientId);
  if (!c) return;
  if (storeEnabled) await fsdb().doc(`${root(ws)}/clients/${clientId}`).update({ updatedAt: now() });
  else clientsOf(ws).set(clientId, { ...c, updatedAt: now() });
}

/** Test-only: clear the in-memory store between cases. */
export function __resetMemory() {
  mem.clients.clear();
  mem.sub.clear();
}
