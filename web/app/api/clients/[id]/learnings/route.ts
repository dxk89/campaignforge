import { guarded } from '@/server/respond';
import { listLearnings } from '@/server/resultsStore';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async () => ({ learnings: await listLearnings(id) }));
}
