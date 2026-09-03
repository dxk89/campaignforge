import { NextResponse } from 'next/server';

// The core library is plain CommonJS at the repo root and is shared with the
// Express app during migration. Route handlers are the only place it is used.
const { MOCK } = require('@core/claude');
const images = require('@core/images');

import { accessConfigured, reviewerAccessConfigured } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    mock: MOCK,
    images: images.available(),
    auth: accessConfigured(),
    // Whether the shared reviewer password exists, not what it is. Adding an
    // environment variable on Vercel does not rebuild, so the only way to
    // tell whether a deployment picked one up was to try signing in with it,
    // which means having it to hand. This answers that without carrying the
    // value anywhere.
    reviewerAccess: reviewerAccessConfigured(),
    stack: 'next',
  });
}
