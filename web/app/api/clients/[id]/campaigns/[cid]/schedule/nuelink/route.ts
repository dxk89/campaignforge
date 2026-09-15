import { guarded, bad } from '@/server/respond';
import { pushCampaign, alreadySent } from '@/server/nuelink';
import { listNuelinkPushes } from '@/server/db';

export const runtime = 'nodejs';
export const maxDuration = 800;

/** Every push so far, and the union of what they posted. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => {
    const pushes = await listNuelinkPushes(session.workspaceId, id, cid);
    const sent = [...await alreadySent(session.workspaceId, id, cid)].map((k) => { const [day, channel] = k.split('-'); return { day: Number(day), channel }; });
    return { pushes, sent };
  });
}

/**
 * Send the month to Nuelink. The start date is asked for, as it is for the
 * CSVs, because the plan holds day numbers. Draft or Schedule only:
 * IMMEDIATE would post before anyone had looked, and QUEUE hands the timing
 * to Nuelink's own slots, which the plan already decided.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => {
    const body = await req.json().catch(() => ({}));
    if (!body.start) throw bad('start is required, as YYYY-MM-DD: the date day 1 falls on');
    const push = await pushCampaign(session.workspaceId, id, cid, {
      start: String(body.start),
      skipWeekends: body.weekends !== 'keep',
      publishMode: body.publishMode,
      channels: Array.isArray(body.channels) ? body.channels.map(String) : undefined,
      force: Boolean(body.force),
    });
    return { push };
  });
}
