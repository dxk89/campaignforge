/**
 * The monthly ceiling.
 *
 * The ledger shows spend after the fact; this refuses before it. A ceiling
 * reached mid-campaign is annoying, so the message says what was spent, what
 * the ceiling is, and where to change it, rather than just refusing.
 *
 * Unlike the rest of server/, the settings document here is deliberately
 * GLOBAL rather than namespaced by workspace. Every other in-memory store in
 * this codebase is keyed by ws on purpose, so a workspace-shaped signature
 * here would look like the obviously-correct choice. It is not. It was
 * written when each visitor had their own workspace, where a per-workspace
 * ceiling would have handed every new one a fresh allowance and bounded
 * nothing. Sign-in is one shared workspace now, so the argument is weaker,
 * but the conclusion is the same and the global form survives a return to
 * per-visitor workspaces without changing.
 */
import { listLedger, ledgerTotals, listLedgerAllWorkspaces } from './db';
import { db as fsdb, storeEnabled } from './firebase';

// A single global value, not a Map keyed by ws: this document is shared by
// every workspace on purpose (see header comment).
declare global { var __cfSpendSettings: any; }

export type UserSettings = { monthlyCeilingEur: number | null; ceilingAction: 'refuse' | 'warn' };

const DEFAULTS: UserSettings = { monthlyCeilingEur: null, ceilingAction: 'refuse' };

// A per-workspace ceiling would hand every new demo account a fresh
// allowance and bound nothing. One ceiling, across every workspace.
//
// Two components, not three. A Firestore path alternates collection and
// document, so an odd number of components names a COLLECTION: the earlier
// 'system/spend/global' was collection system, document spend, collection
// global, and every read threw "must point to a document". It reached
// production because settingsDoc() is only called when storeEnabled is true
// and every test suite runs against the in-memory store. test/db.test.js now
// checks this parity statically for every path in server/.
export const SETTINGS_PATH = 'system/spend';
const settingsDoc = () => fsdb().doc(SETTINGS_PATH);

export async function getSettings(): Promise<UserSettings> {
  if (!storeEnabled) return { ...DEFAULTS, ...(globalThis.__cfSpendSettings || {}) };
  const doc = await settingsDoc().get();
  return { ...DEFAULTS, ...(doc.exists ? doc.data() : {}) } as UserSettings;
}

export async function saveSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const merged = { ...(await getSettings()), ...patch };
  if (storeEnabled) await settingsDoc().set(merged);
  else globalThis.__cfSpendSettings = merged;
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
  const settings = await getSettings();
  if (!settings.monthlyCeilingEur) return {};
  const month = new Date().toISOString().slice(0, 7);
  const spent = ledgerTotals(await listLedgerAllWorkspaces(month)).costEur;
  const next = await estimate(ws, agent);
  if (spent + next <= settings.monthlyCeilingEur) return {};

  const message = `This run would take ${month} past the €${settings.monthlyCeilingEur} ceiling (€${spent.toFixed(2)} spent, about €${next.toFixed(2)} more). Raise or clear the ceiling in Settings.`;
  if (settings.ceilingAction === 'warn') return { warning: message };
  throw Object.assign(new Error(message), { status: 402 });
}
