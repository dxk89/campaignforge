'use client';

export function LandingPanel({ landing }: { landing: any }) {
  if (!landing) return <p className="muted">No landing page yet. It needs the strategy, the assets and the activation plan first.</p>;
  return (
    <div className="prose" style={{ maxWidth: 'none' }}>
      <section className="landing-hero">
        <h3>{landing.hero?.headline}</h3>
        <p>{landing.hero?.sub}</p>
        <span className="cta-pill">{landing.hero?.cta}</span>
      </section>

      {landing.proof?.length ? (
        <section><h3>Proof</h3><ul className="proof">
          {landing.proof.map((p: any, i: number) => <li key={i}>{p.claim}{p.support ? <span className="src"> {p.support}</span> : null}</li>)}
        </ul></section>
      ) : <section><h3>Proof</h3><p className="muted">No approved claims, so the page argues from mechanism instead. That is the correct response to a thin context.</p></section>}

      <section><h3>How it works</h3>
        <ol>{(landing.mechanism || []).map((m: any, i: number) => <li key={i}><strong>{m.step}</strong> {m.detail}</li>)}</ol></section>

      <section><h3>Objections answered</h3>
        {(landing.objections || []).map((o: any, i: number) => (
          <div className="angle" key={i}><span className="angle-name">&ldquo;{o.objection}&rdquo;</span><p>{o.answer}</p></div>
        ))}</section>

      <section><h3>Form <span className="stage-tag">{landing.form?.fields?.length || 0} fields</span></h3>
        <table className="grid-table"><tbody>
          <tr><th>Field</th><th>Label</th><th>Type</th><th>Required</th><th>Qualifies</th></tr>
          {(landing.form?.fields || []).map((f: any, i: number) => (
            <tr key={i}><td className="mono">{f.name}</td><td>{f.label}</td><td className="mono">{f.type}</td>
              <td>{f.required ? 'yes' : 'no'}</td><td>{f.maps_to_mql || <span className="muted">—</span>}</td></tr>
          ))}
        </tbody></table>
        <p className="snote" style={{ marginTop: 8 }}><strong>Consent line:</strong> {landing.form?.consent}</p>
        {landing.inferences?.length ? (
          <><p className="snote" style={{ marginTop: 8 }}><strong>Qualified without asking:</strong></p>
            <ul>{landing.inferences.map((i: string, n: number) => <li key={n}>{i}</li>)}</ul></>
        ) : null}
      </section>

      <section><h3>SEO</h3><dl className="kv">
        <div><dt>Title</dt><dd>{landing.seo?.title} <span className="count">{(landing.seo?.title || '').length}/60</span></dd></div>
        <div><dt>Description</dt><dd>{landing.seo?.description} <span className="count">{(landing.seo?.description || '').length}/155</span></dd></div>
      </dl></section>
    </div>
  );
}

export function VerdictsPanel({ verdicts, summary }: { verdicts: any[]; summary: any }) {
  if (!verdicts?.length) return null;
  return (
    <section>
      <h3>Experiment verdicts <span className="stage-tag">computed in code</span></h3>
      {summary && (
        <p className="snote">{summary.matched} of {summary.rows} rows matched · {summary.clicks.toLocaleString('en-GB')} clicks · {summary.conversions.toLocaleString('en-GB')} conversions · €{summary.spend.toLocaleString('en-GB')} spend</p>
      )}
      <table className="grid-table"><tbody>
        <tr><th>Channel</th><th>Verdict</th><th>Why</th><th>p</th><th>Winner</th></tr>
        {verdicts.map((v, i) => (
          <tr key={i}>
            <td className="mono">{v.channel}</td>
            <td><span className={`verdict ${v.verdict}`}>{v.verdict.replace('_', ' ')}</span></td>
            <td>{v.reason}</td>
            <td className="mono">{v.stats ? v.stats.pValue.toFixed(3) : '—'}</td>
            <td>{v.verdict === 'met' ? v.winner : <span className="muted">—</span>}</td>
          </tr>
        ))}
      </tbody></table>
    </section>
  );
}
