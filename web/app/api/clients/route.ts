import { guarded, bad } from '@/server/respond';
import { createClient, listClients } from '@/server/db';

const { scanSite } = require('@core/scraper');

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  return guarded(async () => {
    const clients = await listClients();
    return { clients: clients.map((c) => ({ clientId: c.clientId, name: c.name, domain: c.domain, updatedAt: c.updatedAt })) };
  });
}

/**
 * Create a client, optionally from a website scan. The scan is the fastest
 * useful path: one URL produces the brand kit and the first sources.
 */
export async function POST(req: Request) {
  return guarded(async () => {
    const body = await req.json().catch(() => ({}));
    const { url, name } = body as { url?: string; name?: string };
    if (!url && !name) throw bad('Give a website URL or a client name');

    if (!url) return { client: await createClient({ name: name!.trim() }) };

    const scan = await scanSite(url);
    const kit = scan.brandKit;
    const client = await createClient({
      name: (name || kit.siteName || kit.domain).trim(),
      domain: kit.domain,
      brandKit: {
        siteName: kit.siteName, tagline: kit.tagline, palette: kit.palette, fonts: kit.fonts,
        logoRef: null, artworkRefs: [], scannedAt: new Date().toISOString(), pages: kit.pages,
      },
      settings: { landingUrl: null, defaultTone: 'direct', defaultLanguages: ['en'], calendar: { events: [] } },
    });

    const { addSource } = await import('@/server/db');
    const sources = [];
    for (const s of scan.sources) {
      sources.push(await addSource(client.clientId, { name: s.name, kind: 'site', storageRef: null, text: s.text, chars: s.chars }));
    }
    return {
      clientId: client.clientId,
      brandKit: client.brandKit,
      remoteLogo: kit.logo ?? null,
      sources: sources.map((s) => ({ sourceId: s.sourceId, name: s.name, kind: s.kind, chars: s.chars })),
    };
  });
}
