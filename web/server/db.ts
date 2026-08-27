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
import { db as fsdb, storeEnabled, uid } from './firebase';
import type { Client, SourceDoc, Campaign, Version, ImageDoc, LedgerEntry, Brief } from './types';

const now = () => new Date().toISOString();
export const newId = () => randomUUID();
export const hashOf = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 32);

// ---- in-memory fallback ------------------------------------------------------
type Mem = { clients: Map<string, any>; sub: Map<string, Map<string, any>> };
const mem: Mem = { clients: new Map(), sub: new Map() };
const memKey = (...parts: string[]) => parts.join('/');
function memCol(key: string) {
  if (!mem.sub.has(key)) mem.sub.set(key, new Map());
  return mem.sub.get(key)!;
}

const root = () => `users/${uid()}`;

// ---- clients -----------------------------------------------------------------

export async function createClient(input: { name: string; domain?: string | null; brandKit?: any; voice?: any; settings?: any }): Promise<Client> {
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
  if (storeEnabled) await fsdb().doc(`${root()}/clients/${clientId}`).set(doc);
  else mem.clients.set(clientId, doc);
  return doc;
}

export async function listClients(): Promise<Client[]> {
  if (!storeEnabled) return [...mem.clients.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const snap = await fsdb().collection(`${root()}/clients`).orderBy('updatedAt', 'desc').get();
  return snap.docs.map((d) => d.data() as Client);
}

export async function getClient(clientId: string): Promise<Client | null> {
  if (!storeEnabled) return mem.clients.get(clientId) ?? null;
  const d = await fsdb().doc(`${root()}/clients/${clientId}`).get();
  return d.exists ? (d.data() as Client) : null;
}

export async function updateClient(clientId: string, patch: Partial<Client>): Promise<Client | null> {
  const existing = await getClient(clientId);
  if (!existing) return null;
  const merged = { ...existing, ...patch, clientId, updatedAt: now() } as Client;
  if (storeEnabled) await fsdb().doc(`${root()}/clients/${clientId}`).set(merged);
  else mem.clients.set(clientId, merged);
  return merged;
}

// ---- sources -----------------------------------------------------------------

export async function addSource(clientId: string, src: Omit<SourceDoc, 'sourceId' | 'fetchedAt' | 'hash'> & { hash?: string }): Promise<SourceDoc> {
  const sourceId = newId();
  const doc: SourceDoc = { ...src, sourceId, fetchedAt: now(), hash: src.hash ?? hashOf(src.text) };
  if (storeEnabled) await fsdb().doc(`${root()}/clients/${clientId}/sources/${sourceId}`).set(doc);
  else memCol(memKey(clientId, 'sources')).set(sourceId, doc);
  await touch(clientId);
  return doc;
}

export async function listSources(clientId: string, withText = false): Promise<SourceDoc[]> {
  let docs: SourceDoc[];
  if (!storeEnabled) docs = [...memCol(memKey(clientId, 'sources')).values()];
  else docs = (await fsdb().collection(`${root()}/clients/${clientId}/sources`).get()).docs.map((d) => d.data() as SourceDoc);
  return withText ? docs : docs.map(({ text, ...rest }) => ({ ...rest, text: '' } as SourceDoc));
}

export async function deleteSource(clientId: string, sourceId: string): Promise<void> {
  if (storeEnabled) await fsdb().doc(`${root()}/clients/${clientId}/sources/${sourceId}`).delete();
  else memCol(memKey(clientId, 'sources')).delete(sourceId);
  await touch(clientId);
}

// ---- campaigns ---------------------------------------------------------------

export async function createCampaign(clientId: string, brief: Brief): Promise<Campaign> {
  const campaignId = newId();
  const doc: Campaign = { campaignId, brief, status: 'draft', createdAt: now(), updatedAt: now(), current: {} };
  if (storeEnabled) await fsdb().doc(`${root()}/clients/${clientId}/campaigns/${campaignId}`).set(doc);
  else memCol(memKey(clientId, 'campaigns')).set(campaignId, doc);
  await touch(clientId);
  return doc;
}

export async function listCampaigns(clientId: string): Promise<Campaign[]> {
  if (!storeEnabled) return [...memCol(memKey(clientId, 'campaigns')).values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const snap = await fsdb().collection(`${root()}/clients/${clientId}/campaigns`).orderBy('updatedAt', 'desc').get();
  return snap.docs.map((d) => d.data() as Campaign);
}

export async function getCampaign(clientId: string, campaignId: string): Promise<Campaign | null> {
  if (!storeEnabled) return memCol(memKey(clientId, 'campaigns')).get(campaignId) ?? null;
  const d = await fsdb().doc(`${root()}/clients/${clientId}/campaigns/${campaignId}`).get();
  return d.exists ? (d.data() as Campaign) : null;
}

export async function updateCampaign(clientId: string, campaignId: string, patch: Partial<Campaign>): Promise<Campaign | null> {
  const existing = await getCampaign(clientId, campaignId);
  if (!existing) return null;
  const merged = { ...existing, ...patch, campaignId, updatedAt: now() } as Campaign;
  if (storeEnabled) await fsdb().doc(`${root()}/clients/${clientId}/campaigns/${campaignId}`).set(merged);
  else memCol(memKey(clientId, 'campaigns')).set(campaignId, merged);
  await touch(clientId);
  return merged;
}

// ---- versions ----------------------------------------------------------------

export async function addVersion(clientId: string, campaignId: string, v: Omit<Version, 'versionId' | 'createdAt'>): Promise<Version> {
  const versionId = newId();
  const doc: Version = { ...v, versionId, createdAt: now() };
  if (storeEnabled) await fsdb().doc(`${root()}/clients/${clientId}/campaigns/${campaignId}/versions/${versionId}`).set(doc);
  else memCol(memKey(clientId, campaignId, 'versions')).set(versionId, doc);

  const campaign = await getCampaign(clientId, campaignId);
  if (campaign) await updateCampaign(clientId, campaignId, { current: { ...campaign.current, [v.agent]: versionId } });
  return doc;
}

export async function getVersion(clientId: string, campaignId: string, versionId: string): Promise<Version | null> {
  if (!storeEnabled) return memCol(memKey(clientId, campaignId, 'versions')).get(versionId) ?? null;
  const d = await fsdb().doc(`${root()}/clients/${clientId}/campaigns/${campaignId}/versions/${versionId}`).get();
  return d.exists ? (d.data() as Version) : null;
}

export async function listVersions(clientId: string, campaignId: string, agent?: string): Promise<Version[]> {
  let docs: Version[];
  if (!storeEnabled) docs = [...memCol(memKey(clientId, campaignId, 'versions')).values()];
  else docs = (await fsdb().collection(`${root()}/clients/${clientId}/campaigns/${campaignId}/versions`).get()).docs.map((d) => d.data() as Version);
  const filtered = agent ? docs.filter((v) => v.agent === agent) : docs;
  return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Resolve every `current` pointer to its output. */
export async function currentOutputs(clientId: string, campaignId: string): Promise<Record<string, Version>> {
  const campaign = await getCampaign(clientId, campaignId);
  if (!campaign) return {};
  const out: Record<string, Version> = {};
  for (const [agent, versionId] of Object.entries(campaign.current)) {
    const v = await getVersion(clientId, campaignId, versionId);
    if (v) out[agent] = v;
  }
  return out;
}

// ---- images ------------------------------------------------------------------

export async function addImage(clientId: string, campaignId: string, img: Omit<ImageDoc, 'imageId' | 'createdAt'>): Promise<ImageDoc> {
  const imageId = newId();
  const doc: ImageDoc = { ...img, imageId, createdAt: now() };
  if (storeEnabled) await fsdb().doc(`${root()}/clients/${clientId}/campaigns/${campaignId}/images/${imageId}`).set(doc);
  else memCol(memKey(clientId, campaignId, 'images')).set(imageId, doc);
  return doc;
}

export async function listImages(clientId: string, campaignId: string): Promise<ImageDoc[]> {
  if (!storeEnabled) return [...memCol(memKey(clientId, campaignId, 'images')).values()];
  return (await fsdb().collection(`${root()}/clients/${clientId}/campaigns/${campaignId}/images`).get()).docs.map((d) => d.data() as ImageDoc);
}

// ---- ledger ------------------------------------------------------------------

export async function addLedger(entry: Omit<LedgerEntry, 'entryId' | 'at'>): Promise<void> {
  const entryId = newId();
  const doc: LedgerEntry = { ...entry, entryId, at: now() };
  if (storeEnabled) await fsdb().doc(`${root()}/ledger/${entryId}`).set(doc);
  else memCol('ledger').set(entryId, doc);
}

export async function listLedger(month?: string): Promise<LedgerEntry[]> {
  let docs: LedgerEntry[];
  if (!storeEnabled) docs = [...memCol('ledger').values()];
  else docs = (await fsdb().collection(`${root()}/ledger`).get()).docs.map((d) => d.data() as LedgerEntry);
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

async function touch(clientId: string) {
  const c = await getClient(clientId);
  if (!c) return;
  if (storeEnabled) await fsdb().doc(`${root()}/clients/${clientId}`).update({ updatedAt: now() });
  else mem.clients.set(clientId, { ...c, updatedAt: now() });
}

/** Test-only: clear the in-memory store between cases. */
export function __resetMemory() {
  mem.clients.clear();
  mem.sub.clear();
}
