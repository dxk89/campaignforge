import { guarded, bad } from '@/server/respond';
import { getClient, updateClient } from '@/server/db';
import { putFile } from '@/server/storage';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Logo and artwork upload. The logo goes on every card; artwork steers images. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async () => {
    const client = await getClient(id);
    if (!client) throw bad('Client not found', 404);
    const form = await req.formData();

    const kit = { ...client.brandKit };
    const logo = form.get('logo');
    if (logo instanceof File) {
      kit.logoRef = await putFile(`clients/${id}/brand/logo-${logo.name}`, Buffer.from(await logo.arrayBuffer()), logo.type);
    }
    const artwork = form.getAll('artwork').filter((f): f is File => f instanceof File);
    if (artwork.length) {
      const refs = [...(kit.artworkRefs || [])];
      for (const f of artwork.slice(0, 6 - refs.length)) {
        refs.push(await putFile(`clients/${id}/brand/art-${refs.length}-${f.name}`, Buffer.from(await f.arrayBuffer()), f.type));
      }
      kit.artworkRefs = refs;
    }
    const updated = await updateClient(id, { brandKit: kit });
    return { brandKit: updated!.brandKit };
  });
}
