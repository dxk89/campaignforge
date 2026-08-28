import { guarded } from '@/server/respond';
import { deleteSource } from '@/server/db';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  return guarded(async (session) => {
    await deleteSource(session.workspaceId, id, sid);
    return { ok: true };
  });
}
