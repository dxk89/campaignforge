import { guarded, bad } from '@/server/respond';
import { getClient, updateClient, listSources, listCampaigns } from '@/server/db';

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
    if (!Object.keys(clean).length) throw bad('Nothing to update');
    const client = await updateClient(session.workspaceId, id, clean);
    if (!client) throw bad('Client not found', 404);
    return { client };
  });
}
