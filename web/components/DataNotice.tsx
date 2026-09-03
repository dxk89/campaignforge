/**
 * Data protection notice.
 *
 * Shown before sign-in and again at the point real client material is entered,
 * because those are the two moments someone decides what to put in. A notice
 * only on the login page would be read once and forgotten by the time a
 * briefing document is dragged in.
 *
 * The wording tracks docs/DATA-HANDLING.md, which is rendered in Settings. If
 * that statement changes, change this too: a short notice that contradicts the
 * full one is worse than no short notice.
 */

type Props = { variant?: 'full' | 'inline' };

export default function DataNotice({ variant = 'full' }: Props) {
  if (variant === 'inline') {
    return (
      <p className="data-notice-inline">
        Anything you add here is sent to Anthropic, and to Google if you generate images.
        Please do not upload personal data or material you are not free to share.{' '}
        <a href="/settings#data-handling">How your data is handled</a>
      </p>
    );
  }

  return (
    <section className="data-notice" aria-labelledby="data-notice-title">
      <h2 id="data-notice-title">Before you put anything in</h2>
      <p>
        This is a working demonstration, not a production service. What you enter is
        processed to generate a campaign and is stored so you can come back to it.
      </p>
      <ul>
        <li>
          <b>Where it goes.</b> Briefs, uploaded documents and scanned pages are sent to
          Anthropic to generate copy. If you generate images, the visual brief and any
          reference artwork are also sent to Google.
        </li>
        <li>
          <b>What is stored.</b> Text and files are held in Firestore and Cloudflare R2 in
          the EU. Everyone signed in shares one workspace, so treat anything you add as
          visible to the others trying the tool.
        </li>
        <li>
          <b>Please do not upload personal data.</b> No customer lists, no CVs, no contact
          details, nothing containing a living person&rsquo;s information. The tool has no
          need for it and this demonstration is not the place for it.
        </li>
        <li>
          <b>Only share what you are free to share.</b> If a document is under NDA or
          contains confidential client material, use something else to try the tool.
        </li>
        <li>
          <b>Removal.</b> Ask the operator and your account and everything in it will be
          deleted.
        </li>
      </ul>
      <p className="muted">
        The full statement, including model providers and retention, is under
        Settings once you are signed in.
      </p>
    </section>
  );
}
