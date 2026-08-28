import { guarded } from '@/server/respond';
import { listAssets, approvalState } from '@/server/assets';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => {
    const language = new URL(req.url).searchParams.get('language') || undefined;
    const assets = await listAssets(session.workspaceId, id, cid, language);
    return { assets, approval: approvalState(assets, language) };
  });
}
