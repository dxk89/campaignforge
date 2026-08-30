import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';

/**
 * The link gets pasted into application emails and messages, where the preview
 * card is the whole first impression and a bare one reads as unfinished. The
 * description is the same sentence the sign-in page leads with, so the two
 * agree.
 *
 * metadataBase is what makes relative URLs in the card absolute. Vercel sets
 * VERCEL_URL per deployment without a scheme; falling back to localhost keeps
 * the build working anywhere.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

const description =
  'Give it a product brief and it returns a campaign: strategy, ad copy for Meta, ' +
  'LinkedIn and Google, an email sequence, a month of social posts, and a Portuguese ' +
  'adaptation. Every asset is checked against the platform limits, and every pass is priced.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Campaign Forge', template: '%s · Campaign Forge' },
  description,
  applicationName: 'Campaign Forge',
  openGraph: {
    type: 'website',
    siteName: 'Campaign Forge',
    title: 'Campaign Forge — brief in, campaign out',
    description,
    url: '/',
  },
  twitter: { card: 'summary_large_image', title: 'Campaign Forge — brief in, campaign out', description },
  // Deliberately out of the index. This is a demonstration holding real
  // client briefs and generated copy, shown to people who are sent the link.
  // Being findable adds nothing and puts half-finished work under a search
  // for the owner's name. app/robots.ts says the same thing to crawlers that
  // read that instead.
  robots: { index: false, follow: false, nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true } },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@87.5,500;87.5,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
