import Link from 'next/link';
import { currentSession } from '@/server/auth';

/** Global header. Renders the brand alone when signed out. */
export default async function Nav() {
  const session = await currentSession();
  return (
    <header className="top">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <Link href={session ? '/clients' : '/login'}><h1>Campaign Forge</h1></Link>
        <span className="brand-sub">brief in, campaign out</span>
      </div>
      {session && (
        <nav className="nav-links">
          <Link href="/clients">Clients</Link>
          <Link href="/ledger">Ledger</Link>
          <Link href="/settings">Settings</Link>
          <SignOut email={session.email} />
        </nav>
      )}
    </header>
  );
}

function SignOut({ email }: { email: string }) {
  return (
    <form action="/api/auth/session?redirect=1" method="post">
      <button type="submit" className="signout" title={email}>Sign out</button>
    </form>
  );
}
