/**
 * The editable layer over pass outputs.
 *
 * A writer's version is immutable. Its output is exploded into one document
 * per editable field, and every edit lands there. Export reads assets, never
 * pass outputs; the localiser reads assets composed back into the asset-set
 * shape, so Portuguese is generated from the edited English rather than from
 * what the model first wrote.
 *
 * assetId = `${channel}.${unit}.${field}.${language}`, e.g.
 *   meta.v2.headline.en, google.rsa.headline.5.en, email.3.body.en,
 *   social.d12.text.en, landing.hero.headline.en
 */
import { db as fsdb, storeEnabled } from './firebase';
import { newId } from './db';

const { LIMITS, SOCIAL_LIMITS } = require('@core/limits');
const { checkCompliance } = require('@core/agents/tools/compliance');

export type AssetDoc = {
  assetId: string;
  channel: string;
  unit: string;
  field: string;
  language: string;
  text: string;
  generatedText: string;
  versionId: string;
  editedAt: string | null;
  status: 'draft' | 'approved' | 'rejected';
  approvedAt: string | null;
  note: string | null;
  flags: { rule: string; detail: string; severity: string }[];
  stale?: boolean;
};

declare global { var __cfAssets: Map<string, Map<string, AssetDoc>> | undefined; }
const mem = globalThis.__cfAssets ?? (globalThis.__cfAssets = new Map());
const memKey = (c: string, k: string) => `${c}/${k}`;
const col = (clientId: string, campaignId: string) => {
  const key = memKey(clientId, campaignId);
  if (!mem.has(key)) mem.set(key, new Map());
  return mem.get(key)!;
};
const path = (ws: string, clientId: string, campaignId: string) =>
  `users/${ws}/clients/${clientId}/campaigns/${campaignId}/assets`;

const now = () => new Date().toISOString();

// ---- explode -----------------------------------------------------------------

type Field = { channel: string; unit: string; field: string; text: string };

/** Every editable field in an asset set, in render order. */
export function fieldsOfAssets(assets: any): Field[] {
  const out: Field[] = [];
  if (!assets) return out;
  (assets.meta || []).forEach((ad: any, i: number) =>
    ['primary_text', 'headline', 'description'].forEach((f) => out.push({ channel: 'meta', unit: `v${i + 1}`, field: f, text: ad[f] })));
  (assets.linkedin || []).forEach((ad: any, i: number) =>
    ['intro_text', 'headline'].forEach((f) => out.push({ channel: 'linkedin', unit: `v${i + 1}`, field: f, text: ad[f] })));
  (assets.google?.headlines || []).forEach((h: string, i: number) => out.push({ channel: 'google', unit: 'rsa', field: `headline.${i}`, text: h }));
  (assets.google?.descriptions || []).forEach((d: string, i: number) => out.push({ channel: 'google', unit: 'rsa', field: `description.${i}`, text: d }));
  (assets.email?.emails || []).forEach((m: any, i: number) =>
    ['subject', 'preview_text', 'body'].forEach((f) => out.push({ channel: 'email', unit: String(i + 1), field: f, text: m[f] })));
  if (assets.email?.branch_note) out.push({ channel: 'email', unit: 'branch', field: 'branch_note', text: assets.email.branch_note });
  return out;
}

export function fieldsOfSocial(social: any): Field[] {
  const out: Field[] = [];
  for (const p of social?.posts || []) {
    out.push({ channel: 'social', unit: `d${p.day}-${p.channel}`, field: 'text', text: p.text });
    if (p.cta) out.push({ channel: 'social', unit: `d${p.day}-${p.channel}`, field: 'cta', text: p.cta });
  }
  return out;
}

export function fieldsOfLanding(landing: any): Field[] {
  const out: Field[] = [];
  if (!landing) return out;
  const h = landing.hero || {};
  ['headline', 'sub', 'cta'].forEach((f) => h[f] && out.push({ channel: 'landing', unit: 'hero', field: f, text: h[f] }));
  (landing.proof || []).forEach((p: any, i: number) => out.push({ channel: 'landing', unit: 'proof', field: String(i), text: p.claim || p }));
  (landing.objections || []).forEach((o: any, i: number) => out.push({ channel: 'landing', unit: 'objection', field: `${i}.answer`, text: o.answer }));
  return out;
}

const idOf = (f: Field, language: string) => `${f.channel}.${f.unit}.${f.field}.${language}`;

/** The rule a field is measured against, for the counter and the gate. */
export function ruleFor(channel: string, unit: string, field: string): { max: number; hard: boolean } | null {
  const base = field.split('.')[0];
  if (channel === 'meta') return (LIMITS.meta as any)[base] || null;
  if (channel === 'linkedin') return (LIMITS.linkedin as any)[base] || null;
  if (channel === 'google') return base === 'headline' ? LIMITS.google.headline : LIMITS.google.description;
  if (channel === 'email') return (LIMITS.email as any)[base] || null;
  if (channel === 'social') {
    const ch = unit.split('-')[1];
    const max = (SOCIAL_LIMITS as any)[ch]?.text?.max;
    return max ? { max, hard: true } : null;
  }
  return null;
}

export function flagsFor(f: Field, language: string, rules: any) {
  const flags: any[] = [];
  const rule = ruleFor(f.channel, f.unit, f.field);
  const len = String(f.text || '').length;
  if (rule && len > rule.max) {
    flags.push({ rule: 'limit', detail: `${len} of ${rule.max} characters`, severity: rule.hard ? 'violation' : 'warning' });
  }
  for (const c of checkCompliance({ [f.field]: f.text }, { ...(rules || {}), language })) {
    if (c.rule === 'claim' && rules?.claimSeverity !== 'violation') flags.push({ ...c, severity: 'warning' });
    else flags.push({ rule: c.rule, detail: c.detail, severity: c.severity });
  }
  return flags;
}

/**
 * Write asset documents for a version's output.
 *
 * An existing document that has never been edited is overwritten. An edited one
 * keeps its text and is marked stale, so a regeneration never silently destroys
 * a person's words.
 */
export async function explode(
  ws: string, clientId: string, campaignId: string, versionId: string,
  fields: Field[], language: string, rules: any,
): Promise<AssetDoc[]> {
  const existing = await listAssets(ws, clientId, campaignId);
  const byId = new Map(existing.map((a) => [a.assetId, a]));
  const written: AssetDoc[] = [];

  for (const f of fields) {
    const assetId = idOf(f, language);
    const prev = byId.get(assetId);
    const text = String(f.text ?? '');
    const doc: AssetDoc = prev?.editedAt
      ? { ...prev, generatedText: text, stale: prev.text !== text, versionId }
      : {
          assetId, channel: f.channel, unit: f.unit, field: f.field, language,
          text, generatedText: text, versionId, editedAt: null,
          status: 'draft', approvedAt: null, note: null, flags: [],
        };
    doc.flags = flagsFor({ ...f, text: doc.text }, language, rules);
    await putAsset(ws, clientId, campaignId, doc);
    written.push(doc);
  }
  return written;
}

/** Rebuild the asset-set shape from asset documents, using edited text. */
export async function composeAssets(ws: string, clientId: string, campaignId: string, language: string, fallback: any) {
  const docs = (await listAssets(ws, clientId, campaignId)).filter((a) => a.language === language);
  if (!docs.length) return fallback;
  const byId = new Map(docs.map((a) => [a.assetId, a.text]));
  const pick = (channel: string, unit: string, field: string, orElse: any) =>
    byId.get(`${channel}.${unit}.${field}.${language}`) ?? orElse;

  const out = JSON.parse(JSON.stringify(fallback || {}));
  (out.meta || []).forEach((ad: any, i: number) =>
    ['primary_text', 'headline', 'description'].forEach((f) => { ad[f] = pick('meta', `v${i + 1}`, f, ad[f]); }));
  (out.linkedin || []).forEach((ad: any, i: number) =>
    ['intro_text', 'headline'].forEach((f) => { ad[f] = pick('linkedin', `v${i + 1}`, f, ad[f]); }));
  if (out.google) {
    out.google.headlines = (out.google.headlines || []).map((h: string, i: number) => pick('google', 'rsa', `headline.${i}`, h));
    out.google.descriptions = (out.google.descriptions || []).map((d: string, i: number) => pick('google', 'rsa', `description.${i}`, d));
  }
  (out.email?.emails || []).forEach((m: any, i: number) =>
    ['subject', 'preview_text', 'body'].forEach((f) => { m[f] = pick('email', String(i + 1), f, m[f]); }));
  if (out.email?.branch_note) out.email.branch_note = pick('email', 'branch', 'branch_note', out.email.branch_note);
  return out;
}

export async function composeSocial(ws: string, clientId: string, campaignId: string, fallback: any) {
  const docs = (await listAssets(ws, clientId, campaignId)).filter((a) => a.channel === 'social');
  if (!docs.length) return fallback;
  const byId = new Map(docs.map((a) => [a.assetId, a.text]));
  const out = JSON.parse(JSON.stringify(fallback || {}));
  for (const p of out.posts || []) {
    const unit = `d${p.day}-${p.channel}`;
    p.text = byId.get(`social.${unit}.text.en`) ?? p.text;
    if (p.cta) p.cta = byId.get(`social.${unit}.cta.en`) ?? p.cta;
  }
  return out;
}

// ---- storage -----------------------------------------------------------------

export async function putAsset(ws: string, clientId: string, campaignId: string, doc: AssetDoc) {
  if (storeEnabled) await fsdb().doc(`${path(ws, clientId, campaignId)}/${doc.assetId}`).set(doc);
  else col(clientId, campaignId).set(doc.assetId, doc);
  return doc;
}

export async function listAssets(ws: string, clientId: string, campaignId: string, language?: string): Promise<AssetDoc[]> {
  let docs: AssetDoc[];
  if (!storeEnabled) docs = [...col(clientId, campaignId).values()];
  else docs = (await fsdb().collection(path(ws, clientId, campaignId)).get()).docs.map((d) => d.data() as AssetDoc);
  return (language ? docs.filter((a) => a.language === language) : docs)
    .sort((a, b) => a.assetId.localeCompare(b.assetId));
}

export async function getAsset(ws: string, clientId: string, campaignId: string, assetId: string): Promise<AssetDoc | null> {
  if (!storeEnabled) return col(clientId, campaignId).get(assetId) ?? null;
  const d = await fsdb().doc(`${path(ws, clientId, campaignId)}/${assetId}`).get();
  return d.exists ? (d.data() as AssetDoc) : null;
}

/**
 * Edit or approve one asset.
 *
 * Editing returns it to draft: approval is of specific words, so changing the
 * words withdraws the approval. Approving is refused while a violation stands.
 */
export async function updateAsset(
  ws: string, clientId: string, campaignId: string, assetId: string,
  patch: { text?: string; status?: AssetDoc['status']; note?: string }, rules: any,
): Promise<AssetDoc> {
  const doc = await getAsset(ws, clientId, campaignId, assetId);
  if (!doc) throw Object.assign(new Error('Asset not found'), { status: 404 });

  const next: AssetDoc = { ...doc };
  if (typeof patch.text === 'string' && patch.text !== doc.text) {
    next.text = patch.text;
    next.editedAt = now();
    next.status = 'draft';
    next.approvedAt = null;
    next.stale = false;
    next.flags = flagsFor({ channel: doc.channel, unit: doc.unit, field: doc.field, text: patch.text }, doc.language, rules);
  }
  if (patch.note !== undefined) next.note = patch.note;
  if (patch.status && patch.status !== next.status) {
    if (patch.status === 'approved') {
      const blocking = next.flags.filter((f) => f.severity === 'violation');
      if (blocking.length) {
        throw Object.assign(new Error(`Cannot approve while a violation stands: ${blocking.map((f) => f.detail).join('; ')}`), { status: 409 });
      }
      next.approvedAt = now();
    } else {
      next.approvedAt = null;
    }
    next.status = patch.status;
  }
  return putAsset(ws, clientId, campaignId, next);
}

/** Approval summary for the export gate. */
export function approvalState(assets: AssetDoc[], language?: string) {
  const scope = language ? assets.filter((a) => a.language === language) : assets;
  const approved = scope.filter((a) => a.status === 'approved');
  const violations = scope.filter((a) => a.flags?.some((f) => f.severity === 'violation'));
  return {
    total: scope.length,
    approved: approved.length,
    unapproved: scope.filter((a) => a.status !== 'approved').map((a) => a.assetId),
    violations: violations.length,
    ready: scope.length > 0 && approved.length === scope.length,
  };
}

export function __resetAssets() { mem.clear(); }
