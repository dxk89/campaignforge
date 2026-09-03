import { NextResponse } from 'next/server';
import { guarded } from '@/server/respond';
import { requireOwner } from '@/server/auth';
import { getSettings, saveSettings } from '@/server/spend';

export const runtime = 'nodejs';

// GET stays session-only, not admin-only: the ceiling is a number rather than
// a control, and a reviewer seeing today's cap cannot change anything with it.
// PATCH is the half that matters. The ceiling is one document shared by
// everything, so a write from any session disables spend protection for
// everyone, which is exactly what the access password must not reach.
export async function GET() {
  return guarded(async () => getSettings());
}

// requireOwner() runs before the body is parsed, same pattern as
// route itself, so a reviewer gets a 403 rather than relying on the Settings
// panel not being rendered for them.
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
