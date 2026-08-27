import { guarded } from '@/server/respond';
import { listLedger, ledgerTotals } from '@/server/db';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return guarded(async () => {
    const month = new URL(req.url).searchParams.get('month') || undefined;
    const entries = await listLedger(month || undefined);
    return { entries, totals: ledgerTotals(entries) };
  });
}
