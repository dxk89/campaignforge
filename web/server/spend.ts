/**
 * The monthly ceiling.
 *
 * The ledger shows spend after the fact; this refuses before it. A ceiling
 * reached mid-campaign is annoying, so the message says what was spent, what
 * the ceiling is, and where to change it, rather than just refusing.
 */
import { listLedger, ledgerTotals } from './db';
import { db as fsdb, storeEnabled, uid } from './firebase';

declare global { var __cfSettings: any | undefined; }

export type UserSettings = { monthlyCeilingEur: number | null; ceilingAction: 'refuse' | 'warn' };

const DEFAULTS: UserSettings = { monthlyCeilingEur: null, ceilingAction: 'refuse' };

export async function getSettings(): Promise<UserSettings> {
  if (!storeEnabled) return { ...DEFAULTS, ...(globalThis.__cfSettings || {}) };
  const doc = await fsdb().doc(`users/${uid()}/settings/user`).get();
  return { ...DEFAULTS, ...(doc.exists ? doc.data() : {}) } as UserSettings;
}

export async function saveSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const merged = { ...(await getSettings()), ...patch };
  if (storeEnabled) await fsdb().doc(`users/${uid()}/settings/user`).set(merged);
  else globalThis.__cfSettings = merged;
  return merged;
}

/** Average cost of this agent's recent runs, as the estimate for the next one. */
async function estimate(agent: string): Promise<number> {
  const entries = (await listLedger()).filter((e) => e.agent === agent);
  if (!entries.length) return 0.5;
  const recent = entries.slice(0, 10);
  return recent.reduce((n, e) => n + e.costEur, 0) / recent.length;
}

/**
 * Throws a 402 when a run would take the month past the ceiling, or returns a
 * warning when the setting says to proceed.
 */
export async function checkCeiling(agent: string): Promise<{ warning?: string }> {
  const settings = await getSettings();
  if (!settings.monthlyCeilingEur) return {};
  const month = new Date().toISOString().slice(0, 7);
  const spent = ledgerTotals(await listLedger(month)).costEur;
  const next = await estimate(agent);
  if (spent + next <= settings.monthlyCeilingEur) return {};

  const message = `This run would take ${month} past the €${settings.monthlyCeilingEur} ceiling (€${spent.toFixed(2)} spent, about €${next.toFixed(2)} more). Raise or clear the ceiling in Settings.`;
  if (settings.ceilingAction === 'warn') return { warning: message };
  throw Object.assign(new Error(message), { status: 402 });
}
