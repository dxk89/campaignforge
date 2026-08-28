import { guarded } from '@/server/respond';
import { getSettings, saveSettings } from '@/server/spend';

export const runtime = 'nodejs';

export async function GET() {
  return guarded(async (session) => getSettings(session.workspaceId));
}

export async function PATCH(req: Request) {
  return guarded(async (session) => {
    const body = await req.json();
    const patch: any = {};
    if ('monthlyCeilingEur' in body) patch.monthlyCeilingEur = body.monthlyCeilingEur === null ? null : Number(body.monthlyCeilingEur);
    if ('ceilingAction' in body) patch.ceilingAction = body.ceilingAction === 'warn' ? 'warn' : 'refuse';
    return saveSettings(session.workspaceId, patch);
  });
}
