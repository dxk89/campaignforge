import { guarded, bad } from '@/server/respond';
import { db as fsdb, storeEnabled, uid } from '@/server/firebase';
import { newId } from '@/server/db';

const orchestrator = require('@core/agents/orchestrator');
const promptStore = require('@core/prompts/store');

export const runtime = 'nodejs';

const path = (agent: string) => `users/${uid()}/prompts/${agent}`;

/** The code default and the stored override, with the version history. */
export async function GET(_req: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  return guarded(async () => {
    const def = orchestrator.roster[agent];
    if (!def) throw bad('Unknown agent', 404);
    const codeRole = typeof def.role === 'function' ? def.role({}) : def.role;

    let stored = null, versions: any[] = [];
    if (storeEnabled) {
      const doc = await fsdb().doc(path(agent)).get();
      stored = doc.exists ? doc.data() : null;
      versions = (await fsdb().collection(`${path(agent)}/versions`).get()).docs.map((d) => d.data());
    }
    return {
      agent, model: def.model, tools: (def.tools || []).map((t: any) => t.name),
      codeRole, stored, versions: versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      storeEnabled,
    };
  });
}

/** Save a new version and make it current. A change note is required. */
export async function POST(req: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  return guarded(async () => {
    if (!storeEnabled) throw bad('Prompt versions need a configured store', 503);
    const { role, changeNote } = await req.json();
    if (!role?.trim()) throw bad('role is required');
    if (!changeNote?.trim()) throw bad('A change note is required. Future you will want to know why.');

    const versionId = newId();
    const version = { versionId, role, changeNote, createdAt: new Date().toISOString(), evalRunId: null, scores: null };
    await fsdb().doc(`${path(agent)}/versions/${versionId}`).set(version);
    await fsdb().doc(path(agent)).set({ agent, current: versionId, role, updatedAt: version.createdAt });
    promptStore.invalidate();
    return { version };
  });
}

/** Revert to an earlier version, or back to the code default. */
export async function PATCH(req: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  return guarded(async () => {
    if (!storeEnabled) throw bad('Prompt versions need a configured store', 503);
    const { versionId } = await req.json();
    if (!versionId) {
      await fsdb().doc(path(agent)).delete();
      promptStore.invalidate();
      return { reverted: 'code default' };
    }
    const doc = await fsdb().doc(`${path(agent)}/versions/${versionId}`).get();
    if (!doc.exists) throw bad('Version not found', 404);
    const v = doc.data()!;
    await fsdb().doc(path(agent)).set({ agent, current: versionId, role: v.role, updatedAt: new Date().toISOString() });
    promptStore.invalidate();
    return { reverted: versionId };
  });
}
