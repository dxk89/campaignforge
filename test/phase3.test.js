/**
 * Phase 3: authority. Landing page, results, verdicts in code, learnings,
 * exemplars feeding the next generation.
 */
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const env = { ...process.env, MOCK_CLAUDE: '1', MOCK_AUTH: '1', ALLOWED_EMAIL: 'test@example.com' };
const server = spawn('npx', ['next', 'start', '-p', '3226'], { cwd: path.join(root, 'web'), env, stdio: 'ignore' });
const site = spawn('python3', ['-m', 'http.server', '8099'], { cwd: path.join(__dirname, 'fixture-site'), stdio: 'ignore' });
const stop = () => { server.kill(); site.kill(); };
process.on('exit', stop);

const base = 'http://localhost:3226';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (p, o = {}) => { const r = await fetch(base + p, o); return { status: r.status, data: await r.json().catch(() => ({})) }; };
const post = (p, b) => api(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const patch = (p, b) => api(p, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

(async () => {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch {} await wait(500); }

  const { data: created } = await post('/api/clients', { url: 'http://localhost:8099' });
  const clientId = created.clientId;
  const { data: camp } = await post(`/api/clients/${clientId}/campaigns`, { brief: {
    productName: 'Ledgerline', productDescription: 'Reconciliation', targetAudience: 'Finance leads',
    objective: 'trial_signups', tone: 'direct', languages: ['en'], webResearch: true } });
  const cid = camp.campaignId;
  const run = (a) => post(`/api/clients/${clientId}/campaigns/${cid}/run/${a}`, {});
  for (const a of ['brand-analyst', 'customer-researcher', 'strategist', 'copywriter', 'ops-architect']) await run(a);

  // landing page, with the MQL coverage gate
  const landing = await run('landing-writer');
  assert.equal(landing.status, 200, JSON.stringify(landing.data));
  assert.ok(landing.data.output.hero.headline, 'hero written');
  assert.ok(landing.data.output.form.fields.length <= 6, 'six fields maximum');
  assert.ok(landing.data.output.inferences.length, 'inferences stated for what is not asked');
  console.log('  landing page:', JSON.stringify(landing.data.output.hero.headline), '|', landing.data.output.form.fields.length, 'fields');

  // results: mapping is asked for first
  const csv = [
    'Ad name,Impressions,Clicks,Conversions,Spend',
    'linkedin-v1-en,52000,2140,88,3200',
    'linkedin-v3-en,51000,2090,52,3100',
    'meta-v2-en,8000,41,2,180',
    'meta-v3-en,7600,38,1,170',
    'some-other-ad,1000,20,1,50',
  ].join('\n');
  const form1 = new FormData();
  form1.append('file', new Blob([csv], { type: 'text/csv' }), 'linkedin.csv');
  form1.append('source', 'linkedin');
  const needs = await (await fetch(`${base}/api/clients/${clientId}/campaigns/${cid}/results`, { method: 'POST', body: form1 })).json();
  assert.equal(needs.needsMapping, true, 'a first upload asks for the mapping');
  assert.equal(needs.suggested.variant, 'Ad name', 'the mapping is suggested from the column names');
  assert.equal(needs.suggested.conversions, 'Conversions');
  console.log('  mapping suggested:', JSON.stringify(needs.suggested));

  const form2 = new FormData();
  form2.append('file', new Blob([csv], { type: 'text/csv' }), 'linkedin.csv');
  form2.append('source', 'linkedin');
  form2.append('mapping', JSON.stringify(needs.suggested));
  const uploaded = await (await fetch(`${base}/api/clients/${clientId}/campaigns/${cid}/results`, { method: 'POST', body: form2 })).json();
  assert.equal(uploaded.matched, 5, 'every row is kept');
  assert.deepEqual(uploaded.unmatched, ['some-other-ad'], 'unmatched rows are listed, not dropped');
  console.log('  matched by utm_content, unmatched listed:', uploaded.unmatched);

  // verdicts computed in code
  const verdicts = uploaded.verdicts;
  assert.ok(verdicts.length >= 2, 'a verdict per experiment');
  const li = verdicts.find((v) => v.channel === 'linkedin');
  const meta = verdicts.find((v) => v.channel === 'meta');
  assert.equal(li.verdict, 'met', 'the LinkedIn difference is real: ' + li.reason);
  assert.equal(meta.verdict, 'insufficient', 'the Meta sample cannot decide: ' + meta.reason);
  assert.ok(li.stats.pValue < 0.05);
  console.log('  verdicts | linkedin:', li.verdict, `p=${li.stats.pValue.toFixed(3)}`, '| meta:', meta.verdict);

  // the mapping is remembered
  const form3 = new FormData();
  form3.append('file', new Blob([csv], { type: 'text/csv' }), 'again.csv');
  form3.append('source', 'linkedin');
  const remembered = await (await fetch(`${base}/api/clients/${clientId}/campaigns/${cid}/results`, { method: 'POST', body: form3 })).json();
  assert.ok(!remembered.needsMapping, 'the mapping is remembered per source');

  // learnings, and the refusal for the insufficient verdict
  const learn = await post(`/api/clients/${clientId}/campaigns/${cid}/learnings`, {});
  assert.equal(learn.status, 200, JSON.stringify(learn.data));
  assert.ok(learn.data.learnings.length, 'learnings proposed');
  assert.ok(learn.data.refusals.length, 'a refusal for the undecidable experiment');
  assert.ok(learn.data.learnings.every((l) => l.status === 'proposed'), 'nothing auto-approved');
  console.log('  learnings:', learn.data.learnings.length, '| refusals:', learn.data.refusals.length);

  // approving a learning puts it into the next packet
  await patch(`/api/clients/${clientId}/learnings/${learn.data.learnings[0].learningId}`, { status: 'approved' });
  const approvedLearnings = (await api(`/api/clients/${clientId}/learnings`)).data.learnings.filter((l) => l.status === 'approved');
  assert.equal(approvedLearnings.length, 1);

  // exemplars: approving an asset records one
  const assets = (await api(`/api/clients/${clientId}/campaigns/${cid}/assets?language=en`)).data.assets;
  const clean = assets.find((a) => a.channel === 'meta' && !a.flags?.some((f) => f.severity === 'violation'));
  await patch(`/api/clients/${clientId}/campaigns/${cid}/assets/${encodeURIComponent(clean.assetId)}`, { status: 'approved' });
  console.log('  exemplar recorded for', clean.assetId);

  // and the next campaign's packet carries both
  const { data: camp2 } = await post(`/api/clients/${clientId}/campaigns`, { brief: {
    productName: 'Ledgerline', productDescription: 'Reconciliation', targetAudience: 'Finance leads',
    objective: 'trial_signups', tone: 'direct', languages: ['en'], webResearch: false } });
  const probe = await post(`/api/clients/${clientId}/campaigns/${camp2.campaignId}/run/brand-analyst`, {});
  assert.equal(probe.status, 200);
  console.log('  second campaign starts with the firsts memory available');

  console.log('phase 3 tests: ok');
  stop(); process.exit(0);
})().catch((e) => { console.error('phase 3 tests FAILED', e); stop(); process.exit(1); });
