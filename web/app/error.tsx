'use client';

/**
 * What a person sees when a page throws.
 *
 * Next's own error page says "A server error occurred" on a black screen,
 * which is what a broken Firestore path looked like from the outside for two
 * weeks: no indication of whether the fault was theirs, whether their work
 * survived, or what to do. This says all three, and keeps the brand.
 *
 * The message itself is not shown. It can carry internal detail, and a
 * stranger reading a stack trace is worse than a stranger reading nothing;
 * the digest is enough to match a report against the server logs.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="shell" style={{ maxWidth: 520, paddingTop: 72 }}>
      <h1>That page did not load</h1>
      <p className="muted" style={{ marginTop: 10 }}>
        Something failed on our side, not yours. Nothing you had already generated is lost:
        every pass is saved as it finishes.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
        <button className="btn-primary" type="button" onClick={reset}>Try again</button>
        <a className="btn-secondary" href="/clients">Back to clients</a>
      </div>
      {error.digest && (
        <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>
          Reference <code>{error.digest}</code> if you report it.
        </p>
      )}
    </main>
  );
}
