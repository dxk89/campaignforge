/**
 * Sessions.
 *
 * Two passwords and no usernames, plus mock mode for the tests.
 * ADMIN_PASSWORD is the owner's; ACCESS_PASSWORD is what a reviewer is given.
 * Both reach the same workspace: the point of the demo is the campaign, not
 * an empty account. Only the admin password can change what applies to
 * everyone, which is the spend ceiling and the stored prompts.
 *
 * This replaced per-visitor demo accounts with their own isolated
 * workspaces. That was better security and worse as a demonstration: it put
 * an account system in front of a tool whose point is what happens after you
 * are inside. The workspace parameter is still threaded through the data
 * layer, so the isolation is a change of configuration rather than a
 * rewrite if it is ever wanted back.
 *
 * The trade is real and worth stating: everyone with the access password
 * shares one workspace, so a reviewer sees the campaigns already there and
 * two reviewers see each other's work.
 *
 * Google sign-in was removed earlier, for the same reason: nobody should
 * need a third-party account to try the tool.
 */
import { cookies } from 'next/headers';
import { verifySession, accessConfigured, type Session } from './session';
import { storeEnabled } from './firebase';

export const SESSION_COOKIE = 'cf_session';
const MOCK_AUTH = process.env.MOCK_AUTH === '1';

export type { Session };

// A deployment with a store but no way to sign in would serve an open
// instance. Refuse at load instead, as claude.js and storage.ts do.
if (storeEnabled && !MOCK_AUTH && !accessConfigured()) {
  throw new Error(
    'Firestore is configured but no sign-in is: set ADMIN_PASSWORD (and optionally ACCESS_PASSWORD), ' +
      'or MOCK_AUTH=1 to run without sign-in. See docs/DEPLOY.md.',
  );
}

export async function currentSession(): Promise<Session | null> {
  if (MOCK_AUTH) return { workspaceId: 'owner', admin: true };
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) throw Object.assign(new Error('Sign in required'), { status: 401 });
  return s;
}

/** Admin routes. A demo account gets 403, not a redirect to a form. */
/**
 * The routes that change the deployment for everyone: the spend ceiling and
 * the stored prompts. A reviewer signing in with the access password can use
 * the tool and cannot raise the ceiling, which is the one thing a shared
 * password would otherwise put at risk.
 */
export async function requireOwner(): Promise<Session> {
  const s = await requireSession();
  if (!s.admin) throw Object.assign(new Error('Not permitted'), { status: 403 });
  return s;
}
