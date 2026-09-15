import { guarded } from '@/server/respond';

const nuelink = require('@core/nuelink');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What Nuelink knows about this account, for the client page's mapping
 * pickers. Read-only. With ?brand=<id>, the brand's collections and channels
 * as well, so the picker can warn when a collection posts to more channels
 * than the one being mapped.
 */
export async function GET(req: Request) {
  return guarded(async () => {
    if (!nuelink.available()) return { configured: false };
    const url = new URL(req.url);
    const [me, brands] = await Promise.all([nuelink.me(), nuelink.brands()]);
    if (me.error) return { configured: true, error: me.error };
    const out: any = { configured: true, me: me.data, brands: brands.data || [] };
    const brand = url.searchParams.get('brand');
    if (brand) {
      const [collections, channels] = await Promise.all([nuelink.collections(brand), nuelink.channels(brand)]);
      out.collections = collections.data || [];
      out.channels = channels.data || [];
      if (collections.error || channels.error) out.error = collections.error || channels.error;
    }
    return out;
  });
}
