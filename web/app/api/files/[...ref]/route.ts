import { requireSession } from '@/server/auth';
import { getFile } from '@/server/storage';

export const runtime = 'nodejs';

/**
 * Stream a stored file. Storage refs are paths, not URLs, so the logo and
 * artwork thumbnails need this to render. Refs outside this user's namespace
 * are refused regardless of what the caller sends.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string[] }> }) {
  let session;
  try {
    session = await requireSession();
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: err.status || 401, headers: { 'content-type': 'application/json' } });
  }
  const { ref } = await params;
  const full = ref.join('/');
  if (!full.startsWith(`users/${session.workspaceId}/`)) {
    return new Response(JSON.stringify({ error: 'Not permitted' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  const file = await getFile(full);
  if (!file) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  return new Response(new Uint8Array(file.buffer), {
    headers: { 'content-type': file.mime, 'cache-control': 'private, max-age=3600' },
  });
}
