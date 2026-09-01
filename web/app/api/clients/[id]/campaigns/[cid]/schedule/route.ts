import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth';
import { currentOutputs, getCampaign } from '@/server/db';

const { scheduleRows, hootsuiteCsv, scheduleCsv } = require('@core/schedule');

export const runtime = 'nodejs';

/**
 * The planned month as a schedule a tool can import.
 *
 * The plan holds day numbers, because it is written before anyone decides
 * when the campaign starts. The start date therefore comes from the request
 * rather than being stored: the same calendar is often scheduled twice, and
 * neither attempt should overwrite the other.
 *
 * This does not use guarded(), which exists to return JSON. The body here is
 * a CSV going to an importer or a spreadsheet, so the session and the error
 * shape are handled directly and the response is built by hand.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  try {
    const session = await requireSession();
    const { id, cid } = await params;
    const url = new URL(req.url);
    const start = url.searchParams.get('start') || '';
    const format = url.searchParams.get('format') || 'schedule';
    const ws = session.workspaceId;

    const [campaign, outputs] = await Promise.all([getCampaign(ws, id, cid), currentOutputs(ws, id, cid)]);
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const social: any = outputs['social-planner']?.output;
    if (!social?.posts?.length) {
      return NextResponse.json({ error: 'There is no social calendar to schedule yet' }, { status: 409 });
    }

    let rows;
    try {
      rows = scheduleRows(social, {
        startDate: start,
        skipWeekends: url.searchParams.get('weekends') !== 'keep',
        link: campaign.brief?.landingUrl || '',
      });
    } catch (err: any) {
      // scheduleRows throws only for a missing or unparseable start date,
      // which is the caller's mistake rather than ours.
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const csv = format === 'hootsuite' ? hootsuiteCsv(rows) : scheduleCsv(rows);
    const name = format === 'hootsuite' ? 'hootsuite' : 'schedule';
    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv;charset=utf-8',
        'content-disposition': `attachment; filename="${name}-${start}.csv"`,
      },
    });
  } catch (err: any) {
    const status = err.status || 500;
    if (status >= 500) console.error('[api]', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status });
  }
}
