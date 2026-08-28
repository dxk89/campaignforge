'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs } from '@/components/Tabs';
import {
  ResearchPanel, AudiencePanel, StrategyPanel, MetaPanel, LinkedInPanel,
  GooglePanel, EmailPanel, SocialPanel, LifecyclePanel, HandoffPanel, MeasurementPanel,
} from '@/components/panels';
import { fmtEur, fmtInt, fmtMs } from '@/components/format';
import { useAssets, ApprovalBar, EditorVerdict, EditableChannel } from '@/components/EditablePanels';
import { LandingPanel } from '@/components/LandingPanel';
import { flattenAssets, socialRows, toCsv, download, clientSlug } from '@/components/exports';
import DataNotice from '@/components/DataNotice';

/** The agents this campaign runs, in dependency order. Skips are decided server-side. */
const CHAIN = [
  { agent: 'brand-analyst', label: 'Research', running: 'Researching the company material' },
  { agent: 'customer-researcher', label: 'Audience', running: 'Understanding the customer' },
  { agent: 'strategist', label: 'Strategy', running: 'Choosing the angle' },
  { agent: 'copywriter', label: 'Assets', running: 'Writing every channel' },
  { agent: 'social-planner', label: 'Social', running: 'Planning a month of social' },
  { agent: 'ops-architect', label: 'Activation', running: 'Building lifecycle, handoff and measurement' },
  { agent: 'landing-writer', label: 'Landing', running: 'Writing the page every ad points at' },
  { agent: 'localiser', label: 'pt-PT', running: 'Adapting for Portugal' },
];

type State = Record<string, 'running' | 'done' | 'skipped' | 'failed'>;

export default function Workbench({ clientId, campaign, client, outputs, passes, stale, economics, tracking }: any) {
  const router = useRouter();
  const [brief, setBrief] = useState(campaign.brief);
  const [state, setState] = useState<State>(() => {
    const s: State = {};
    for (const { agent } of CHAIN) if (outputs[agent]) s[agent] = 'done';
    return s;
  });
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(outputs['brand-analyst'] ? 'research' : 'strategy');
  const [lang, setLang] = useState<'en' | 'pt'>('en');
  const [imagesAvailable, setImagesAvailable] = useState(false);
  const [review, setReview] = useState<any>(null);
  const editing = useAssets(clientId, campaign.campaignId, lang);
  useEffect(() => { fetch('/api/health').then((r) => r.json()).then((h) => setImagesAvailable(Boolean(h.images))).catch(() => {}); }, []);

  const assets = lang === 'pt' && outputs.localiser ? outputs.localiser : outputs.copywriter;
  // A skipped agent is settled, not outstanding: without this a finished run
  // still offers "Resume (2 left)" for the passes the server deliberately
  // declined, and clicking it re-attempts them.
  const settled = CHAIN.filter((c) => outputs[c.agent] || state[c.agent] === 'skipped').length;
  const done = settled;
  const started = done > 0;

  async function saveBrief() {
    await fetch(`/api/clients/${clientId}/campaigns/${campaign.campaignId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief }),
    });
    router.refresh();
  }

  /** Run the chain from a given point. Resume passes the agents not yet done. */
  async function run(agents: string[]) {
    setBusy(true); setError(null);
    for (const agent of agents) {
      const step = CHAIN.find((c) => c.agent === agent)!;
      setState((s) => ({ ...s, [agent]: 'running' }));
      setLine(step.running);
      try {
        const res = await fetch(`/api/clients/${clientId}/campaigns/${campaign.campaignId}/run/${agent}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        });
        const data = await res.json();
        if (!res.ok) throw Object.assign(new Error(data.error || 'Failed'), { agent });
        setState((s) => ({ ...s, [agent]: data.skipped ? 'skipped' : 'done' }));
        if (data.review) setReview(data.review);
        if (data.assets) editing.reload();
      } catch (err: any) {
        setState((s) => ({ ...s, [agent]: 'failed' }));
        setError(`${step.label}: ${err.message}. The passes that finished are saved; press Resume to continue.`);
        setBusy(false); setLine(null);
        router.refresh();
        return;
      }
    }
    setBusy(false); setLine(null);
    router.refresh();
  }

  const missing = ['productName', 'productDescription', 'targetAudience'].filter((k) => !brief[k]?.trim());

  async function generate() {
    if (missing.length) { setError('Fill in ' + missing.map((m) => m.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ') + ' first.'); return; }
    await saveBrief();
    setState({});
    await run(CHAIN.map((c) => c.agent));
  }

  async function resume() {
    const remaining = CHAIN.filter((c) => !outputs[c.agent] && state[c.agent] !== 'skipped').map((c) => c.agent);
    if (remaining.length) await run(remaining);
  }

  async function rerunStale() {
    if (stale.length) await run(CHAIN.filter((c) => stale.includes(c.agent)).map((c) => c.agent));
  }

  const tabs = useMemo(() => {
    const t = [];
    if (outputs['brand-analyst']) t.push({ id: 'research', label: 'Research' });
    if (outputs['customer-researcher']) t.push({ id: 'audience', label: 'Audience' });
    if (outputs.strategist) t.push({ id: 'strategy', label: 'Strategy' });
    if (outputs.copywriter) t.push(
      { id: 'meta', label: 'Meta' }, { id: 'linkedin', label: 'LinkedIn' },
      { id: 'google', label: 'Google' }, { id: 'email', label: 'Email' },
    );
    if (outputs['social-planner']) t.push({ id: 'social', label: 'Social' });
    if (outputs['landing-writer']) t.push({ id: 'landing', label: 'Landing' });
    if (outputs['ops-architect']) t.push(
      { id: 'lifecycle', label: 'Lifecycle' }, { id: 'handoff', label: 'Handoff' }, { id: 'measurement', label: 'Measurement' },
    );
    return t;
  }, [outputs]);

  const activePasses = Object.entries(passes || {});

  return (
    <div className="workbench">
      <BriefPanel brief={brief} setBrief={setBrief} onSave={saveBrief} client={client} clientId={clientId} campaignId={campaign.campaignId} />

      <section className="results-panel">
        <ol className="chain">
          {CHAIN.map((c) => (
            <li
              key={c.agent}
              data-state={state[c.agent] || (outputs[c.agent] ? 'done' : undefined)}
              data-stale={stale.includes(c.agent) ? 'true' : undefined}
            >
              <span className="chain-dot" />{c.label}
              <span className="stage-tag">
                {state[c.agent] === 'running' ? 'running'
                  : state[c.agent] === 'failed' ? 'failed'
                  : state[c.agent] === 'skipped' ? 'skipped'
                  : stale.includes(c.agent) ? 'stale'
                  : outputs[c.agent] ? 'done' : ''}
              </span>
            </li>
          ))}
        </ol>

        <div className="actions-row">
          <button className="btn-primary" onClick={generate} disabled={busy}>
            {busy ? 'Generating…' : started ? 'Regenerate everything' : 'Generate campaign'}
          </button>
          {started && done < CHAIN.length && !busy && (
            <button className="btn-secondary" onClick={resume}>Resume ({CHAIN.length - done} left)</button>
          )}
          {stale.length > 0 && !busy && (
            <button className="btn-secondary" onClick={rerunStale}>Re-run {stale.length} stale</button>
          )}
        </div>

        {stale.length > 0 && (
          <div className="issues warnings-only">
            <strong>{stale.length} agent{stale.length === 1 ? '' : 's'} ran on inputs that have since changed:</strong> {stale.join(', ')}.
            Their output still shows what was generated; re-run to catch up.
          </div>
        )}
        {error && <div className="results-error">{error}</div>}
        {line && <p className="loading-line">{line}</p>}

        {tabs.length > 0 ? (
          <>
            <Tabs tabs={tabs} active={tabs.some((t) => t.id === tab) ? tab : tabs[0].id} onSelect={setTab}
              lang={lang} onLang={setLang} hasPt={Boolean(outputs.localiser)} />
            {['meta', 'linkedin', 'google', 'email'].includes(tab) && (
              <>
                <ApprovalBar approval={editing.approval} onApproveAll={async () => {
                  for (const a of editing.assets.filter((x: any) => x.status !== 'approved' && !x.flags?.some((f: any) => f.severity === 'violation'))) {
                    await editing.patch(a.assetId, { status: 'approved' });
                  }
                }} />
                <EditorVerdict review={review} />
              </>
            )}
            <div className="tab-panel">
              {tab === 'research' && <ResearchPanel context={outputs['brand-analyst']} />}
              {tab === 'audience' && <AudiencePanel audience={outputs['customer-researcher']} />}
              {tab === 'strategy' && <StrategyPanel strategy={outputs.strategist} />}
              {tab === 'meta' && <EditableChannel assets={editing.assets} channel="meta" title="Meta" ctx={editing} />}
              {tab === 'linkedin' && <EditableChannel assets={editing.assets} channel="linkedin" title="LinkedIn" ctx={editing} />}
              {tab === 'google' && <EditableChannel assets={editing.assets} channel="google" title="Google RSA" ctx={editing} />}
              {tab === 'email' && <EditableChannel assets={editing.assets} channel="email" title="Email" ctx={editing} />}
              {tab === 'social' && <SocialPanel social={outputs['social-planner']} clientId={clientId} campaignId={campaign.campaignId} imagesAvailable={imagesAvailable} logoRef={client.brandKit?.logoRef} />}
              {tab === 'landing' && <LandingPanel landing={outputs['landing-writer']} />}
              {tab === 'lifecycle' && <LifecyclePanel activation={outputs['ops-architect']} />}
              {tab === 'handoff' && <HandoffPanel handoff={outputs['ops-architect']?.handoff} />}
              {tab === 'measurement' && <MeasurementPanel activation={outputs['ops-architect']} tracking={tracking} />}
            </div>
          </>
        ) : (
          <div className="results-empty">
            <p className="empty-title">Nothing generated yet.</p>
            <p>Fill in the brief and generate. Each agent runs as its own request and its result is saved before the next one starts, so you can close this tab and come back.</p>
          </div>
        )}
      </section>

      {activePasses.length > 0 && (
        <footer className="economics">
          <dl className="econ-totals">
            <div><dt>Tokens</dt><dd>{fmtInt(activePasses.reduce((n, [, p]: any) => n + (p.input || 0) + (p.output || 0), 0))}</dd></div>
            <div><dt>Cost</dt><dd className="econ-cost">{fmtEur(economics.costEur)}</dd></div>
            <div><dt>Agents</dt><dd>{activePasses.length}</dd></div>
          </dl>
          <div className="econ-passes">
            {activePasses.map(([agent, p]: any) => (
              <span key={agent}>{agent} <b>{fmtInt((p.input || 0) + (p.output || 0))}</b> · {fmtEur(p.costEur || 0)} · {fmtMs(p.ms || 0)}
                {p.complete === false ? ' · incomplete' : ''}</span>
            ))}
          </div>
          <div className="econ-actions">
            <button type="button" className="btn-secondary" onClick={() => {
              const slug = clientSlug(client.name);
              download(`${slug}-campaign.json`, 'application/json',
                JSON.stringify({ brief: campaign.brief, ...outputs, tracking }, null, 2));
            }}>JSON</button>
            <button type="button" className="btn-secondary" onClick={() => {
              const rows: unknown[][] = [['channel', 'type', 'language', 'field', 'text', 'char_count', 'tracking_url']];
              rows.push(...flattenAssets(outputs.copywriter, 'en', tracking));
              if (outputs.localiser) rows.push(...flattenAssets(outputs.localiser, 'pt', tracking));
              download(`${clientSlug(client.name)}-assets.csv`, 'text/csv;charset=utf-8', toCsv(rows));
            }} disabled={!outputs.copywriter}>Assets CSV</button>
            <button type="button" className="btn-secondary" onClick={() => {
              download(`${clientSlug(client.name)}-social.csv`, 'text/csv;charset=utf-8', toCsv(socialRows(outputs['social-planner'])));
            }} disabled={!outputs['social-planner']}>Social CSV</button>
            <button type="button" className="btn-secondary" onClick={async () => {
              const res = await fetch(`/api/clients/${clientId}/campaigns/${campaign.campaignId}/package?language=${lang}`);
              const data = await res.json();
              if (res.status === 409) {
                if (!confirm(`${data.error}. Download anyway?`)) return;
                const forced = await (await fetch(`/api/clients/${clientId}/campaigns/${campaign.campaignId}/package?language=${lang}&force=1`)).json();
                download(`${clientSlug(client.name)}-package.json`, 'application/json', JSON.stringify(forced, null, 2));
                return;
              }
              download(`${clientSlug(client.name)}-package.json`, 'application/json', JSON.stringify(data, null, 2));
            }}>Package</button>
            <a className="btn-secondary" href={`/clients/${clientId}/campaigns/${campaign.campaignId}/results`}>Results</a>
            <a className="btn-secondary" href={`/api/export/${clientId}`}>Export all</a>
          </div>
        </footer>
      )}
    </div>
  );
}

function BriefPanel({ brief, setBrief, onSave, client, clientId, campaignId }: any) {
  const set = (k: string, v: any) => setBrief({ ...brief, [k]: v });
  const [parse, setParse] = useState<{ status: string; error?: boolean } | null>(null);
  const router = useRouter();

  async function readBrief(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setParse({ status: `Reading ${file.name}…` });
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/clients/${clientId}/campaigns/${campaignId}/brief/parse`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) { setParse({ status: data.error || 'Could not read the brief', error: true }); return; }
    setBrief(data.brief);
    const missing = ['productName', 'productDescription', 'targetAudience', 'objective', 'tone'].filter((k) => !data.brief[k]);
    setParse({
      status: `Filled ${data.filled.length} field${data.filled.length === 1 ? '' : 's'} from ${file.name}`
        + (missing.length ? ` · still needed: ${missing.map((m) => m.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')}` : '')
        + (data.notes ? ` · Note from the brief: ${data.notes}` : '')
        + ` · €${Number(data.usage.costEur || 0).toFixed(4)} · kept as a source`,
    });
    router.refresh();
  }

  return (
    <aside className="panel brief-panel">
      <section className="block">
        <h2 className="block-title">Brief <span className="block-hint">{client.name}</span></h2>
        <DataNotice variant="inline" />
        <label className="dropzone dropzone-brief">
          <input type="file" accept=".pdf,.docx,.txt,.md,.html,.htm" onChange={(e) => readBrief(e.target.files)} />
          <span><strong>Upload a briefing document</strong> and the fields fill in</span>
          <span className="dropzone-types">PDF, DOCX, TXT, MD · you can edit everything after</span>
        </label>
        {parse && <p className={`brief-status ${parse.error ? 'error' : ''}`}>{parse.status}</p>}
        <label className="field"><span>Product name <b className="req">required</b></span>
          <input value={brief.productName || ''} onChange={(e) => set('productName', e.target.value)} onBlur={onSave} placeholder="Ledgerline" /></label>
        <label className="field"><span>What it does <b className="req">required</b></span>
          <textarea rows={3} value={brief.productDescription || ''} onChange={(e) => set('productDescription', e.target.value)} onBlur={onSave} /></label>
        <label className="field"><span>Target audience <b className="req">required</b></span>
          <textarea rows={2} value={brief.targetAudience || ''} onChange={(e) => set('targetAudience', e.target.value)} onBlur={onSave} /></label>
        <div className="field-row">
          <label className="field"><span>Objective</span>
            <select value={brief.objective} onChange={(e) => set('objective', e.target.value)} onBlur={onSave}>
              <option value="lead_generation">Lead generation</option>
              <option value="trial_signups">Trial signups</option>
              <option value="event_registrations">Event registrations</option>
              <option value="brand_awareness">Brand awareness</option>
            </select></label>
          <label className="field"><span>Tone</span>
            <select value={brief.tone} onChange={(e) => set('tone', e.target.value)} onBlur={onSave}>
              <option value="professional">Professional</option><option value="direct">Direct</option>
              <option value="warm">Warm</option><option value="provocative">Provocative</option>
            </select></label>
        </div>
        <label className="field"><span>Landing page URL <em className="opt">optional, used for tracking links</em></span>
          <input type="url" value={brief.landingUrl || ''} onChange={(e) => set('landingUrl', e.target.value)} onBlur={onSave} /></label>
        <fieldset className="field langs">
          <legend>Languages</legend>
          <label className="check"><input type="checkbox" checked disabled /> English</label>
          <label className="check">
            <input type="checkbox" checked={(brief.languages || []).includes('pt')}
              onChange={(e) => { set('languages', e.target.checked ? ['en', 'pt'] : ['en']); }} onBlur={onSave} /> Portuguese (pt-PT)
          </label>
        </fieldset>
        <label className="check web-research">
          <input type="checkbox" checked={Boolean(brief.webResearch)} onChange={(e) => set('webResearch', e.target.checked)} onBlur={onSave} />
          <span>Research online: the company and its customers <em>(up to 13 searches, shown in cost)</em></span>
        </label>
      </section>
    </aside>
  );
}
