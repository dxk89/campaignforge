/**
 * The monthly ceiling.
 *
 * The ledger shows spend after the fact; this refuses before it. A ceiling
 * reached mid-campaign is annoying, so the message says what was spent, what
 * the ceiling is, and where to change it, rather than just refusing.
 */
import { listLedger, ledgerTotals } from './db';
import { db as fsdb, storeEnabled } from './firebase';

// Keyed by ws: a flat object here would let one workspace's ceiling and
// settings leak into (or be overwritten by) another's.
declare global { var __cfSettings: Map<string, any> | undefined; }
const settingsMem = globalThis.__cfSettings ?? (globalThis.__cfSettings = new Map());

export type UserSettings = { monthlyCeilingEur: number | null; ceilingAction: 'refuse' | 'warn' };

const DEFAULTS: UserSettings = { monthlyCeilingEur: null, ceilingAction: 'refuse' };

export async function getSettings(ws: string): Promise<UserSettings> {
  if (!storeEnabled) return { ...DEFAULTS, ...(settingsMem.get(ws) || {}) };
  const doc = await fsdb().doc(`users/${ws}/settings/user`).get();
  return { ...DEFAULTS, ...(doc.exists ? doc.data() : {}) } as UserSettings;
}

export async function saveSettings(ws: string, patch: Partial<UserSettings>): Promise<UserSettings> {
  const merged = { ...(await getSettings(ws)), ...patch };
  if (storeEnabled) await fsdb().doc(`users/${ws}/settings/user`).set(merged);
  else settingsMem.set(ws, merged);
  return merged;
}

/** Average cost of this agent's recent runs, as the estimate for the next one. */
async function estimate(ws: string, agent: string): Promise<number> {
  const entries = (await listLedger(ws)).filter((e) => e.agent === agent);
  if (!entries.length) return 0.5;
  const recent = entries.slice(0, 10);
  return recent.reduce((n, e) => n + e.costEur, 0) / recent.length;
}

/**
 * Throws a 402 when a run would take the month past the ceiling, or returns a
 * warning when the setting says to proceed.
 */
export async function checkCeiling(ws: string, agent: string): Promise<{ warning?: string }> {
  const settings = await getSettings(ws);
  if (!settings.monthlyCeilingEur) return {};
  const month = new Date().toISOString().slice(0, 7);
  const spent = ledgerTotals(await listLedger(ws, month)).costEur;
  const next = await estimate(ws, agent);
  if (spent + next <= settings.monthlyCeilingEur) return {};

  const message = `This run would take ${month} past the €${settings.monthlyCeilingEur} ceiling (€${spent.toFixed(2)} spent, about €${next.toFixed(2)} more). Raise or clear the ceiling in Settings.`;
  if (settings.ceilingAction === 'warn') return { warning: message };
  throw Object.assign(new Error(message), { status: 402 });
}
