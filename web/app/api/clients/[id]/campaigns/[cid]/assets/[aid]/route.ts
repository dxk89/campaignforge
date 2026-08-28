import { guarded } from '@/server/respond';
import { updateAsset } from '@/server/assets';
import { rulesFor } from '@/server/inputs';
import { recordExemplar } from '@/server/exemplars';
import { getCampaign } from '@/server/db';

export const runtime = 'nodejs';

/** Edit the text, or set the status. Editing returns an asset to draft. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; cid: string; aid: string }> }) {
  const { id, cid, aid } = await params;
  return guarded(async () => {
    const patch = await req.json();
    const asset = await updateAsset(id, cid, decodeURIComponent(aid), patch, await rulesFor(id, cid));

    // An approval is the signal the exemplar bank is built from; a rejection
    // with a note is kept as "not this".
    if (patch.status === 'approved' || (patch.status === 'rejected' && patch.note)) {
      const campaign = await getCampaign(id, cid);
      await recordExemplar(id, asset, cid, campaign?.brief, patch.status);
    }
    return { asset };
  });
}
