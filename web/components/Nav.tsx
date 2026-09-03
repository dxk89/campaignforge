import Link from 'next/link';
import { currentSession } from '@/server/auth';
import SignOut from './SignOut';

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
          <Link href="/check">Check copy</Link>
          <Link href="/ledger">Ledger</Link>
          <Link href="/settings">Settings</Link>
          <SignOut username={session.admin ? 'Admin' : 'Reviewer'} />
        </nav>
      )}
    </header>
  );
}
