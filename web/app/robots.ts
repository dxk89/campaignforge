import type { MetadataRoute } from 'next';

/**
 * Crawlers are asked to stay out entirely.
 *
 * The meta robots tag in the layout covers pages a crawler renders; this
 * covers the ones it only fetches, and it is the file most crawlers check
 * first. Both say the same thing on purpose: a demonstration holding client
 * briefs and unreviewed generated copy has nothing to gain from being
 * indexed, and something to lose.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
