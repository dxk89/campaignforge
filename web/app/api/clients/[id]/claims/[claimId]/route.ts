import { guarded, bad } from '@/server/respond';
import { updateClaim } from '@/server/db';

export const runtime = 'nodejs';

/** Approve, reject, set an expiry, or note why. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; claimId: string }> }) {
  const { id, claimId } = await params;
  return guarded(async (session) => {
    const patch = await req.json();
    const clean: any = {};
    for (const k of ['status', 'expiresAt', 'note', 'text'] as const) if (k in patch) clean[k] = patch[k];
    const claim = await updateClaim(session.workspaceId, id, claimId, clean);
    if (!claim) throw bad('Claim not found', 404);
    return { claim };
  });
}
