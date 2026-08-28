import { NextResponse } from 'next/server';
import { guarded } from '@/server/respond';
import { requireOwner } from '@/server/auth';
import { getSettings, saveSettings } from '@/server/spend';

export const runtime = 'nodejs';

// GET stays session-only (not owner-only): the ceiling value is a number, not
// a control, and a demo account seeing today's cap does not let it change
// anything. PATCH is the half that matters, because Task 8 made the ceiling
// global (system/spend/global) rather than per-workspace: a write from any
// session now disables spend protection for every workspace, including the
// owner's, not just the caller's own.
export async function GET() {
  return guarded(async () => getSettings());
}

// requireOwner() runs before the body is parsed, same pattern as
// app/api/admin/accounts/route.ts, so a demo account gets 401/403 from the
// route itself rather than relying on the Settings panel not being rendered.
export async function PATCH(req: Request) {
  try {
    await requireOwner();
    const body = await req.json();
    const patch: any = {};
    if ('monthlyCeilingEur' in body) patch.monthlyCeilingEur = body.monthlyCeilingEur === null ? null : Number(body.monthlyCeilingEur);
    if ('ceilingAction' in body) patch.ceilingAction = body.ceilingAction === 'warn' ? 'warn' : 'refuse';
    return NextResponse.json(await saveSettings(patch));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
