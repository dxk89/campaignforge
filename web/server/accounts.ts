/**
 * Demo accounts.
 *
 * One username and password per person evaluating the tool, each bound to its
 * own workspace. Stored under system/accounts, deliberately outside every
 * users/{workspace} tree so a path bug in the data layer cannot reach them.
 *
 * Revocation sets revokedAt rather than deleting, so the workspace and its
 * campaigns survive for the owner to look at afterwards.
 */
import { db as fsdb, storeEnabled } from './firebase';
import { hashPassword, verifyPassword, generatePassword, newWorkspaceId, type Session } from './session';

export type Account = {
  id: string;
  username: string;
  workspaceId: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
};

type Stored = Account & { salt: string; hash: string };

declare global { var __cfAccounts: Map<string, Stored> | undefined; }
const mem = globalThis.__cfAccounts ?? (globalThis.__cfAccounts = new Map<string, Stored>());

const col = () => fsdb().collection('system').doc('auth').collection('accounts');
const publicView = ({ salt, hash, ...rest }: Stored): Account => rest;

async function all(): Promise<Stored[]> {
  if (!storeEnabled) return [...mem.values()];
  const snap = await col().get();
  return snap.docs.map((d) => d.data() as Stored);
}

export async function listAccounts(): Promise<Account[]> {
  const rows = await all();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(publicView);
}

export async function createAccount(username: string): Promise<{ account: Account; password: string }> {
  const name = username.trim().toLowerCase();
  if (!name) throw Object.assign(new Error('A username is required'), { status: 400 });
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(name)) {
    throw Object.assign(new Error('Use 2 to 32 characters: letters, numbers, dot, dash or underscore'), { status: 400 });
  }
  const existing = (await all()).find((a) => a.username === name && !a.revokedAt);
  if (existing) throw Object.assign(new Error('That username already exists'), { status: 409 });

  const password = generatePassword();
  const { salt, hash } = await hashPassword(password);
  const row: Stored = {
    id: newWorkspaceId().replace('ws_', 'acc_'),
    username: name,
    workspaceId: newWorkspaceId(),
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
    revokedAt: null,
    salt,
    hash,
  };
  if (storeEnabled) await col().doc(row.id).set(row);
  else mem.set(row.id, row);
  return { account: publicView(row), password };
}

export async function authenticate(username: string, password: string): Promise<Session | null> {
  const name = (username || '').trim().toLowerCase();
  const row = (await all()).find((a) => a.username === name && !a.revokedAt);
  // Hash anyway when the account is missing, so a wrong username and a wrong
  // password take the same time and cannot be told apart.
  if (!row) {
    await verifyPassword(password || '', 'decoy', '00');
    return null;
  }
  if (!(await verifyPassword(password || '', row.salt, row.hash))) return null;
  const seen = new Date().toISOString();
  if (storeEnabled) await col().doc(row.id).set({ lastSeenAt: seen }, { merge: true });
  else mem.set(row.id, { ...row, lastSeenAt: seen });
  return { kind: 'account', workspaceId: row.workspaceId, username: row.username };
}

export async function revokeAccount(id: string): Promise<void> {
  const at = new Date().toISOString();
  if (storeEnabled) await col().doc(id).set({ revokedAt: at }, { merge: true });
  else {
    const row = mem.get(id);
    if (row) mem.set(id, { ...row, revokedAt: at });
  }
}

/** Is this workspace still allowed in? Called on every request. */
export async function workspaceActive(workspaceId: string): Promise<boolean> {
  const row = (await all()).find((a) => a.workspaceId === workspaceId);
  return Boolean(row && !row.revokedAt);
}

export function __resetAccounts() { mem.clear(); }
