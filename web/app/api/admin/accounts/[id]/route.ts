/**
 * Demo accounts: revoke one.
 *
 * Owner-only, same as the collection route. Revoking sets revokedAt rather
 * than deleting (see server/accounts.ts), so this is a soft delete from the
 * HTTP caller's point of view even though the verb is DELETE.
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/server/auth';
import { revokeAccount } from '@/server/accounts';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
    const { id } = await params;
    await revokeAccount(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
