/**
 * Sessions.
 *
 * Three ways in, one shape out. Mock mode for tests, the owner against
 * ADMIN_USERNAME/ADMIN_PASSWORD from the environment, and demo accounts
 * against hashes in Firestore. Callers read session.workspaceId and never
 * learn which it was, which is what keeps the data layer free of auth.
 *
 * Google sign-in was removed: interviewers should not need an account with a
 * third party to try the tool.
 */
import { cookies } from 'next/headers';
import { verifySession, adminConfigured, type Session } from './session';
import { workspaceActive } from './accounts';
import { storeEnabled } from './firebase';

export const SESSION_COOKIE = 'cf_session';
const MOCK_AUTH = process.env.MOCK_AUTH === '1';

export type { Session };

// A deployment with a store but no way to sign in would serve an open
// instance. Refuse at load instead, as claude.js and storage.ts do.
if (storeEnabled && !MOCK_AUTH && !adminConfigured()) {
  throw new Error(
    'Firestore is configured but no sign-in is: set ADMIN_USERNAME and ADMIN_PASSWORD, ' +
      'or MOCK_AUTH=1 to run without sign-in. See docs/DEPLOY.md.',
  );
}

export async function currentSession(): Promise<Session | null> {
  if (MOCK_AUTH) return { kind: 'owner', workspaceId: 'owner', username: 'mock' };
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;
  // Revocation must bite on the next request, not when the token expires.
  if (session.kind === 'account' && !(await workspaceActive(session.workspaceId))) return null;
  return session;
}

export async function requireSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) throw Object.assign(new Error('Sign in required'), { status: 401 });
  return s;
}

/** Admin routes. A demo account gets 403, not a redirect to a form. */
export async function requireOwner(): Promise<Session> {
  const s = await requireSession();
  if (s.kind !== 'owner') throw Object.assign(new Error('Not permitted'), { status: 403 });
  return s;
}
