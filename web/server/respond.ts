/** Shared route-handler helpers: auth, JSON errors, and a wrapper. */
import { NextResponse } from 'next/server';
import { requireSession } from './auth';
import type { Session } from './auth';

export async function guarded<T>(fn: (session: Session) => Promise<T>): Promise<NextResponse> {
  try {
    const session = await requireSession();
    const data = await fn(session);
    return NextResponse.json(data as any);
  } catch (err: any) {
    const status = err.status || 500;
    if (status >= 500) console.error('[api]', err);
    return NextResponse.json({ error: err.message || 'Server error', details: err.details }, { status });
  }
}

export const bad = (message: string, status = 400, details?: unknown) =>
  Object.assign(new Error(message), { status, details });
