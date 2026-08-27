import { guarded, bad } from '@/server/respond';
import { getClient, updateClient, listSources, listCampaigns } from '@/server/db';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async () => {
    const client = await getClient(id);
    if (!client) throw bad('Client not found', 404);
    return { client, sources: await listSources(id), campaigns: await listCampaigns(id) };
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async () => {
    const patch = await req.json();
    const allowed = ['name', 'voice', 'settings', 'brandKit'] as const;
    const clean: any = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    if (!Object.keys(clean).length) throw bad('Nothing to update');
    const client = await updateClient(id, clean);
    if (!client) throw bad('Client not found', 404);
    return { client };
  });
}
