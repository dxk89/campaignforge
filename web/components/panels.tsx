'use client';

import { Card, Line, CopyButton, LIMITS } from './Counter';
import { fmtInt, wordCount } from './format';

const list = (arr?: any[]) => (arr?.length ? <ul>{arr.map((t, i) => <li key={i}>{typeof t === 'string' ? t : JSON.stringify(t)}</li>)}</ul> : <p>—</p>);
const tags = (arr?: string[], cls = '') => (arr?.length ? <div className="tag-list">{arr.map((t, i) => <span key={i} className={`tag ${cls}`}>{t}</span>)}</div> : <p>—</p>);

export function ResearchPanel({ context }: { context: any }) {
  if (!context) return <p className="muted">Research has not run for this campaign.</p>;
  return (
    <div className="prose">
      <section><h3>Company</h3><p>{context.company_summary}</p>{context.positioning && <p><strong>Positioning:</strong> {context.positioning}</p>}</section>
      <section><h3>Voice</h3>{list(context.voice?.observations)}
        <p style={{ marginTop: 8 }}><strong>Use:</strong></p>{tags(context.voice?.preferred_terms)}
        <p style={{ marginTop: 8 }}><strong>Avoid:</strong></p>{tags(context.voice?.avoid_terms, 'avoid')}</section>
      <section><h3>Proof points the copy may use</h3>
        {context.proof_points?.length
          ? <ul className="proof">{context.proof_points.map((p: any, i: number) => <li key={i}>{p.claim} <span className="src">{p.source}</span></li>)}</ul>
          : <p>None found. Copy is capability-led; nothing was invented.</p>}</section>
      <section><h3>Product facts</h3>{list(context.product_facts)}</section>
      <section><h3>Audience insights</h3>{list(context.audience_insights)}</section>
      <section><h3>Competitors named</h3>{tags(context.competitors)}</section>
      {context.campaign_facts?.length ? <section><h3>Campaign facts from the brief</h3>{list(context.campaign_facts)}</section> : null}
      {context.glossary?.length ? <section><h3>Glossary for localisation</h3>
        <dl className="kv">{context.glossary.map((g: any, i: number) => <div key={i}><dt>{g.term}</dt><dd>{g.treatment}</dd></div>)}</dl></section> : null}
      <section><h3>Gaps</h3><ul className="gap-list">{(context.gaps || ['None']).map((g: string, i: number) => <li key={i}>{g}</li>)}</ul></section>
    </div>
  );
}

export function AudiencePanel({ audience }: { audience: any }) {
  if (!audience) return <p className="muted">Audience research runs when online research is on for the campaign.</p>;
  return (
    <div className="prose">
      <section><h3>Who</h3><p>{audience.who}</p></section>
      <section><h3>Their words</h3>{tags(audience.language)}</section>
      <section><h3>Pains</h3>{list(audience.pains)}</section>
      <section><h3>Triggers</h3>{list(audience.triggers)}</section>
      <section><h3>Objections</h3>{list(audience.objections)}</section>
      <section><h3>Where they gather</h3>{list(audience.where_they_gather)}</section>
      <section><h3>What competitors tell them</h3>
        {audience.competitor_messages?.length
          ? <dl className="kv">{audience.competitor_messages.map((c: any, i: number) => <div key={i}><dt>{c.competitor}</dt><dd>&ldquo;{c.message}&rdquo; <span className="src">weak on: {c.weakness}</span></dd></div>)}</dl>
          : <p>—</p>}</section>
      <section><h3>Search terms</h3>{tags(audience.search_terms)}</section>
      {audience.sources?.length ? <section><h3>Sources</h3><ul>{audience.sources.map((u: string, i: number) => <li key={i} className="utm-url">{u}</li>)}</ul></section> : null}
    </div>
  );
}

export function StrategyPanel({ strategy }: { strategy: any }) {
  if (!strategy) return <p className="muted">No strategy yet.</p>;
  return (
    <div className="prose">
      <section><h3>Angles</h3>
        {(strategy.angles || []).map((a: any, i: number) => (
          <div key={i} className={`angle ${a.name === strategy.lead_angle ? 'lead' : ''}`}>
            <span className="angle-name">{a.name}</span>
            {a.name === strategy.lead_angle && <span className="lead-tag">leads</span>}
            <p>{a.summary}</p><p><em>{a.why_it_works}</em></p>
          </div>
        ))}</section>
      <section><h3>Why this one leads</h3><p>{strategy.lead_reasoning}</p></section>
      <section><h3>Hook per channel</h3>
        <dl className="kv">{Object.entries(strategy.hooks || {}).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl></section>
      <section><h3>Key messages</h3>{list(strategy.key_messages)}</section>
    </div>
  );
}

export function MetaPanel({ assets }: { assets: any }) {
  return <>{(assets?.meta || []).map((ad: any, i: number) => (
    <Card key={i} title={`Meta · variant ${i + 1}`} copy={[ad.primary_text, ad.headline, ad.description].join('\n')}>
      <Line label="Primary text" text={ad.primary_text} rule={LIMITS.meta.primary_text} />
      <Line label="Headline" text={ad.headline} rule={LIMITS.meta.headline} />
      <Line label="Description" text={ad.description} rule={LIMITS.meta.description} />
    </Card>
  ))}</>;
}

export function LinkedInPanel({ assets }: { assets: any }) {
  return <>{(assets?.linkedin || []).map((ad: any, i: number) => (
    <Card key={i} title={`LinkedIn · variant ${i + 1}`} copy={[ad.intro_text, ad.headline].join('\n')}>
      <Line label="Intro text" text={ad.intro_text} rule={LIMITS.linkedin.intro_text} />
      <Line label="Headline" text={ad.headline} rule={LIMITS.linkedin.headline} />
    </Card>
  ))}</>;
}

function Rows({ items, rule }: { items: string[]; rule: { max: number; hard: boolean } }) {
  return <>{items.map((t, i) => {
    const over = String(t).length > rule.max;
    return (
      <div key={i} className={`line-row ${over ? 'over' : ''}`}>
        <span className="idx">{i + 1}</span>
        <span className="line-text">{t}</span>
        <span className={`count ${over ? 'over' : ''}`}>{String(t).length}/{rule.max}</span>
        <CopyButton text={t} label="⧉" />
      </div>
    );
  })}</>;
}

export function GooglePanel({ assets }: { assets: any }) {
  const g = assets?.google || {};
  return (
    <>
      <Card title="Google RSA · 8 headlines" copy={(g.headlines || []).join('\n')}>
        <Rows items={g.headlines || []} rule={LIMITS.google.headline} />
      </Card>
      <Card title="Google RSA · 4 descriptions" copy={(g.descriptions || []).join('\n')}>
        <Rows items={g.descriptions || []} rule={LIMITS.google.description} />
      </Card>
    </>
  );
}

export function EmailPanel({ assets }: { assets: any }) {
  const e = assets?.email || {};
  return (
    <>
      {(e.emails || []).map((m: any, i: number) => (
        <Card key={i} title={`Email ${i + 1}`} copy={`Subject: ${m.subject}\nPreview: ${m.preview_text}\n\n${m.body}`}>
          <Line label="Subject" text={m.subject} rule={LIMITS.email.subject} />
          <Line label="Preview text" text={m.preview_text} rule={LIMITS.email.preview_text} />
          <Line label={`Body · ${wordCount(m.body)} words`} text={m.body} body />
        </Card>
      ))}
      {e.branch_note ? <div className="note"><strong>Branch between email 2 and 3:</strong> {e.branch_note}</div> : null}
    </>
  );
}

export function SocialPanel({ social }: { social: any }) {
  if (!social?.posts?.length) return <p className="muted">No social calendar yet.</p>;
  const weeks: any[][] = [[], [], [], []];
  social.posts.forEach((p: any) => weeks[Math.min(3, Math.floor((p.day - 1) / 7))].push(p));
  return (
    <>
      <div className="pillars">
        {(social.pillars || []).map((pl: any, i: number) => <div key={i}><b>{pl.name}</b>{pl.theme}</div>)}
      </div>
      {weeks.map((w, wi) => w.length ? (
        <div className="week" key={wi}>
          <h3>Week {wi + 1} · {w.length} posts</h3>
          {w.map((p: any, pi: number) => {
            const tagList = (p.hashtags || []).map((t: string) => '#' + String(t).replace(/^#/, ''));
            const full = p.channel === 'x' ? [p.text, ...tagList].join(' ') : p.text;
            const max = LIMITS.social[p.channel] || 3000;
            const len = String(full || '').length;
            return (
              <article className={`post ${p.graphic?.svg ? '' : 'no-graphic'}`} key={pi}>
                <div>
                  <div className="post-head">
                    <span className="post-day">Day {p.day}</span>
                    <span className={`chan ${p.channel}`}>{p.channel}</span>
                    <span className="pill">{p.pillar}</span>
                  </div>
                  <div className="post-text">{p.text}</div>
                  {tagList.length ? <div className="post-tags">{tagList.join(' ')}</div> : null}
                  {p.cta ? <div className="snote">CTA: {p.cta}</div> : null}
                  <div className="post-foot">
                    <span className={`count ${len > max ? 'over' : ''}`}>{len}/{max}</span>
                    <CopyButton text={[p.text, tagList.join(' ')].filter(Boolean).join('\n\n')} />
                  </div>
                </div>
                {p.graphic?.svg ? (
                  <div className="gfx">
                    <div dangerouslySetInnerHTML={{ __html: p.graphic.svg }} />
                    {p.graphic.image_prompt ? <div className="img-prompt">{p.graphic.image_prompt}</div> : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null)}
    </>
  );
}

export function LifecyclePanel({ activation, problems }: { activation: any; problems?: string[] }) {
  const lc = activation?.lifecycle;
  if (!lc) return <p className="muted">No lifecycle yet.</p>;
  return (
    <div className="prose">
      {problems?.length ? <div className="problems"><strong>Structural checks flagged {problems.length}:</strong> {problems.join('; ')}</div> : null}
      <section><h3>Enrolment</h3><p>{lc.entry}</p></section>
      <section><h3>Workflow</h3><div className="flow">
        {(lc.steps || []).map((st: any) => {
          const main = st.type === 'email' ? `Send email ${st.email}`
            : st.type === 'wait' ? `Wait ${st.days} day${st.days === 1 ? '' : 's'}`
            : st.type === 'branch' ? `If: ${st.signal}`
            : st.type === 'handoff' ? 'Hand off to sales' : 'Exit';
          return (
            <div className={`flow-step ${st.type}`} key={st.id}>
              <span className="sid">{st.id}</span>
              <span className="stype">{st.type}</span>
              <div>
                <div className="smain">{main}</div>
                {st.note ? <div className="snote">{st.note}</div> : null}
                {st.type === 'branch' ? <div className="sbranch">yes → <b>{st.yes}</b> &nbsp; no → <b>{st.no}</b></div> : null}
              </div>
            </div>
          );
        })}
      </div></section>
      <section><h3>Signals used</h3>{list(lc.signals_used)}</section>
      <section><h3>Exit rules</h3>{list(lc.exit_rules)}</section>
    </div>
  );
}

export function HandoffPanel({ handoff }: { handoff: any }) {
  if (!handoff) return <p className="muted">No handoff plan yet.</p>;
  const max = (handoff.lead_score || []).reduce((n: number, r: any) => n + (Number(r.points) || 0), 0);
  return (
    <div className="prose">
      <section><h3>MQL definition</h3>{list(handoff.mql_definition)}</section>
      <section><h3>Lead score <span className="stage-tag">threshold {handoff.threshold} of {max}</span></h3>
        <table className="grid-table"><tbody>
          <tr><th>Signal</th><th>Points</th><th>Why</th></tr>
          {(handoff.lead_score || []).map((r: any, i: number) => <tr key={i}><td>{r.signal}</td><td className="num">{r.points}</td><td>{r.why}</td></tr>)}
        </tbody></table></section>
      <section><h3>Service level</h3><p>{handoff.sla}</p></section>
      <section><h3>BDR procedure</h3><ol>{(handoff.bdr_sop || []).map((s: string, i: number) => <li key={i}>{s}</li>)}</ol></section>
      <section><h3>Talk track</h3><div className="talk">
        <div>{handoff.talk_track?.opening}</div>
        {(handoff.talk_track?.objections || []).map((o: any, i: number) => (
          <div key={i}><div className="obj">&ldquo;{o.objection}&rdquo;</div><div>{o.response}</div></div>
        ))}
      </div></section>
      <section><h3>Disqualifiers</h3>{list(handoff.disqualifiers)}</section>
    </div>
  );
}

export function MeasurementPanel({ activation, tracking }: { activation: any; tracking: any }) {
  const m = activation?.measurement;
  return (
    <div className="prose" style={{ maxWidth: 'none' }}>
      {m ? (
        <>
          <section><h3>KPI tree</h3>
            <table className="grid-table"><tbody>
              <tr><th>Stage</th><th>Metric</th><th>Target</th><th>Source of record</th></tr>
              {(m.kpi_tree || []).map((k: any, i: number) => (
                <tr key={i}><td><span className={`stage-tag ${String(k.stage).toLowerCase()}`}>{k.stage}</span></td><td>{k.metric}</td><td className="mono">{k.target}</td><td>{k.source}</td></tr>
              ))}
            </tbody></table></section>
          <section><h3>Funnel definitions</h3>
            <dl className="kv">{(m.funnel || []).map((f: any, i: number) => <div key={i}><dt>{f.stage}</dt><dd>{f.definition}</dd></div>)}</dl></section>
          <section><h3>Reporting</h3><p>{m.reporting_cadence}</p></section>
          <section><h3>Data quality</h3>{list(m.data_quality)}</section>
        </>
      ) : null}
      <section><h3>Experiments</h3>
        <table className="grid-table"><tbody>
          <tr><th>Channel</th><th>Hypothesis</th><th>Variants</th><th>Metric</th><th>Decision rule</th></tr>
          {(activation?.experiments || []).map((x: any, i: number) => (
            <tr key={i}><td className="mono">{x.channel}</td><td>{x.hypothesis}</td><td>{x.variants}</td><td>{x.primary_metric}</td><td>{x.decision_rule}</td></tr>
          ))}
        </tbody></table></section>
      {tracking ? (
        <section><h3>Tracking links <span className="stage-tag">campaign {tracking.campaign}</span></h3>
          <table className="grid-table"><tbody>
            <tr><th>Asset</th><th>Lang</th><th>URL</th><th /></tr>
            {(tracking.rows || []).map((r: any, i: number) => (
              <tr key={i}><td className="mono">{r.channel}-{r.unit}</td><td className="mono">{r.language}</td><td className="utm-url">{r.url}</td><td><CopyButton text={r.url} label="⧉" /></td></tr>
            ))}
          </tbody></table></section>
      ) : null}
    </div>
  );
}
