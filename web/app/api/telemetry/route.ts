import { guarded } from '@/server/respond';
import { count, read } from '@/server/telemetry';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return guarded(async (session) => read(session.workspaceId, new URL(req.url).searchParams.get('month') || undefined));
}

export async function POST(req: Request) {
  return guarded(async (session) => {
    const { key } = await req.json();
    if (key && /^[a-z][a-z0-9_.-]{0,60}$/i.test(key)) await count(session.workspaceId, key);
    return { ok: true };
  });
}
