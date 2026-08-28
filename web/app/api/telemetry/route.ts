import { guarded } from '@/server/respond';
import { count, read } from '@/server/telemetry';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return guarded(async () => read(new URL(req.url).searchParams.get('month') || undefined));
}

export async function POST(req: Request) {
  return guarded(async () => {
    const { key } = await req.json();
    if (key && /^[a-z][a-z0-9_.-]{0,60}$/i.test(key)) await count(key);
    return { ok: true };
  });
}
