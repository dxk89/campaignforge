/**
 * A missing page, said plainly. Reached most often by an old campaign link
 * after the campaign was deleted, so it points back at the library rather
 * than leaving someone on a dead end.
 */
export default function NotFound() {
  return (
    <main className="shell" style={{ maxWidth: 520, paddingTop: 72 }}>
      <h1>Not found</h1>
      <p className="muted" style={{ marginTop: 10 }}>
        There is nothing at this address. If you followed a link to a campaign, it may have
        been deleted.
      </p>
      <p style={{ marginTop: 22 }}><a className="btn-secondary" href="/clients">Back to clients</a></p>
    </main>
  );
}
