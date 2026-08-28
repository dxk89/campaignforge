'use client';

/**
 * The sign-out button in the header.
 *
 * A plain HTML form cannot send DELETE (browsers only submit GET or POST
 * from a `method` attribute), so this is the one client component in the
 * nav: it calls the DELETE handler on /api/auth/login directly and then
 * sends the browser to /login itself.
 */
export default function SignOut({ username }: { username: string }) {
  async function signOut() {
    await fetch('/api/auth/login', { method: 'DELETE' });
    window.location.href = '/login';
  }
  return (
    <button type="button" className="signout" title={username} onClick={signOut}>
      Sign out
    </button>
  );
}
