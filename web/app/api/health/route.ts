import { NextResponse } from 'next/server';

// The core library is plain CommonJS at the repo root and is shared with the
// Express app during migration. Route handlers are the only place it is used.
const { MOCK } = require('@core/claude');
const images = require('@core/images');

import { accessConfigured } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    mock: MOCK,
    images: images.available(),
    auth: accessConfigured(),
    stack: 'next',
  });
}
