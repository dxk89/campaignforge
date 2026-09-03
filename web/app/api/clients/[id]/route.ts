import { guarded, bad } from '@/server/respond';
import { getClient, updateClient, listSources, listCampaigns, deleteClient } from '@/server/db';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async (session) => {
    const client = await getClient(session.workspaceId, id);
    if (!client) throw bad('Client not found', 404);
    return { client, sources: await listSources(session.workspaceId, id), campaigns: await listCampaigns(session.workspaceId, id) };
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async (session) => {
    const patch = await req.json();
    const allowed = ['name', 'voice', 'settings', 'brandKit'] as const;
    const clean: any = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    // The lock is the one field a reviewer must not set. It is what protects
    // the curated campaign from being deleted, so letting a reviewer clear it
    // would make it decoration.
    if ('locked' in patch) {
      if (!session.admin) throw bad('Only an admin can lock or unlock a client', 403);
      clean.locked = Boolean(patch.locked);
    }
    if (!Object.keys(clean).length) throw bad('Nothing to update');
    const client = await updateClient(session.workspaceId, id, clean);
    if (!client) throw bad('Client not found', 404);
    return { client };
  });
}

/**
 * Remove a client and everything under it.
 *
 * A locked client is refused for everyone, admin included: unlocking is a
 * separate, deliberate action. The thing most worth locking is the campaign
 * being shown to other people, and the person most likely to delete it by
 * accident is whoever owns it.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async (session) => {
    const client = await getClient(session.workspaceId, id);
    if (!client) throw bad('Client not found', 404);
    if (client.locked) throw bad('This client is locked. Unlock it first.', 409);
    await deleteClient(session.workspaceId, id);
    return { deleted: id };
  });
}
