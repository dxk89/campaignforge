/**
 * Demo accounts: list and create.
 *
 * Owner-only. requireOwner() runs before anything else in every handler,
 * including before the body is parsed, so a demo account or a signed-out
 * caller gets 401/403 from the route itself rather than relying on the
 * Settings panel not being rendered for them.
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/server/auth';
import { createAccount, listAccounts } from '@/server/accounts';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireOwner();
    return NextResponse.json({ accounts: await listAccounts() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireOwner();
    const { username } = await req.json().catch(() => ({}));
    const made = await createAccount(username);
    return NextResponse.json(made, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
