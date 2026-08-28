import { requireSession } from '@/server/auth';
import { getClient, listSources, listCampaigns, listVersions, currentOutputs, listLedger } from '@/server/db';
import { getFile } from '@/server/storage';
import { listAssets, approvalState } from '@/server/assets';
// archiver ships CommonJS with a callable default; the namespace import that
// TypeScript wants under ESM is not callable, so use the interop default.
import { default as archiver } from 'archiver';
import { PassThrough } from 'stream';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Export everything for one client as a zip: every document as JSON plus the
 * stored files. This is the promise in the data-handling statement, so it has
 * to be complete rather than convenient.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireSession();
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: err.status || 401, headers: { 'content-type': 'application/json' } });
  }

  const client = await getClient(id);
  if (!client) return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404, headers: { 'content-type': 'application/json' } });

  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = new PassThrough();
  archive.pipe(stream);

  const add = (name: string, data: unknown) => archive.append(JSON.stringify(data, null, 2), { name });

  add('client.json', client);
  const sources = await listSources(id, true);
  add('sources.json', sources);

  const campaigns = await listCampaigns(id);
  add('campaigns.json', campaigns);
  add('claims.json', await (await import('@/server/db')).listClaims(id));
  for (const c of campaigns) {
    add(`campaigns/${c.campaignId}/outputs.json`, await currentOutputs(id, c.campaignId));
    add(`campaigns/${c.campaignId}/versions.json`, await listVersions(id, c.campaignId));
    const assets = await listAssets(id, c.campaignId);
    add(`campaigns/${c.campaignId}/assets.json`, assets);
    add(`campaigns/${c.campaignId}/approval.json`, approvalState(assets));
  }
  add('ledger.json', (await listLedger()).filter((e) => e.clientId === id));

  for (const ref of [client.brandKit.logoRef, ...(client.brandKit.artworkRefs || [])].filter(Boolean) as string[]) {
    const file = await getFile(ref);
    if (file) archive.append(file.buffer, { name: `files/${ref.split('/').pop()}` });
  }
  for (const s of sources.filter((s) => s.storageRef)) {
    const file = await getFile(s.storageRef!);
    if (file) archive.append(file.buffer, { name: `files/sources/${s.name}` });
  }

  archive.finalize();
  const slug = client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return new Response(stream as any, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${slug}-export.zip"`,
    },
  });
}
