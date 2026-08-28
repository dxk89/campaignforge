import { guarded, bad } from '@/server/respond';
import { updateLearning } from '@/server/resultsStore';

export const runtime = 'nodejs';

/** Approve, reject or edit a proposed learning. Approved ones enter every future packet. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; lid: string }> }) {
  const { id, lid } = await params;
  return guarded(async () => {
    const patch = await req.json();
    const clean: any = {};
    for (const k of ['status', 'statement', 'boundary', 'note'] as const) if (k in patch) clean[k] = patch[k];
    const learning = await updateLearning(id, lid, clean);
    if (!learning) throw bad('Learning not found', 404);
    return { learning };
  });
}
