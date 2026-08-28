import { guarded } from '@/server/respond';
import { updateAsset } from '@/server/assets';
import { rulesFor } from '@/server/inputs';

export const runtime = 'nodejs';

/** Edit the text, or set the status. Editing returns an asset to draft. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; cid: string; aid: string }> }) {
  const { id, cid, aid } = await params;
  return guarded(async () => {
    const patch = await req.json();
    const asset = await updateAsset(id, cid, decodeURIComponent(aid), patch, await rulesFor(id, cid));
    return { asset };
  });
}
