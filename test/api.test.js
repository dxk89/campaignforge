/**
 * Route-level tests against a running Next server in mock mode.
 * Exercises the Phase 1 contract: client from scan, sources, campaign,
 * per-agent run with persistence, resume, stale detection, ledger, export.
 * Run: node test/api.test.js
 */
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const { startNext } = require('./helpers/next-server');

const env = { ...process.env, MOCK_CLAUDE: '1', MOCK_AUTH: '1', ALLOWED_EMAIL: 'test@example.com', PORT: '3223' };
const server = startNext(3223, env);
const site = spawn('python3', ['-m', 'http.server', '8099'], { cwd: path.join(__dirname, 'fixture-site'), stdio: 'ignore' });
const stop = () => { server.kill(); site.kill(); };
process.on('exit', stop);

const base = 'http://localhost:3223';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (path, opts = {}) => {
  const res = await fetch(base + path, opts);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : res;
  return { status: res.status, data, res };
};
const post = (p, body) => api(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

(async () => {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch {} await wait(500); }

  const health = await api('/api/health');
  assert.equal(health.data.ok, true);
  assert.equal(health.data.stack, 'next');

  // client from a site scan
  const created = await post('/api/clients', { url: 'http://localhost:8099' });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const clientId = created.data.clientId;
  assert.ok(clientId);
  assert.ok(created.data.brandKit.palette.accents.length >= 1, 'palette extracted');
  assert.ok(created.data.sources.length >= 3, 'site pages became sources');
  console.log('  client from scan:', created.data.brandKit.siteName, '|', created.data.sources.length, 'sources');

  // library reads back
  const got = await api(`/api/clients/${clientId}`);
  assert.equal(got.data.client.clientId, clientId);
  assert.equal(got.data.sources[0].text, '', 'source text withheld from the list view');

  // voice rules persist
  await api(`/api/clients/${clientId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ voice: { observations: ['short'], preferredTerms: ['exceptions'], avoidTerms: ['errors'], glossary: [] } }) });
  assert.deepEqual((await api(`/api/clients/${clientId}`)).data.client.voice.avoidTerms, ['errors']);

  // paste a source
  const pasted = await post(`/api/clients/${clientId}/sources`, { label: 'brand-voice.md', text: 'We write short. Exceptions, never errors.' });
  assert.equal(pasted.data.sources.length, 1);

  // campaign
  const camp = await post(`/api/clients/${clientId}/campaigns`, { brief: {
    productName: 'Ledgerline', productDescription: 'Reconciliation', targetAudience: 'Finance leads',
    objective: 'trial_signups', tone: 'direct', languages: ['en', 'pt'], webResearch: true } });
  const cid = camp.data.campaignId;
  assert.ok(cid);

  // dependency guard: copywriter before strategist is a 409
  const early = await post(`/api/clients/${clientId}/campaigns/${cid}/run/copywriter`, {});
  assert.equal(early.status, 409, 'copywriter without a strategy must be refused');
  console.log('  dependency guard:', early.data.error);

  // run the chain in order
  const order = ['brand-analyst', 'customer-researcher', 'strategist', 'copywriter', 'social-planner', 'ops-architect', 'localiser'];
  for (const agent of order) {
    const r = await post(`/api/clients/${clientId}/campaigns/${cid}/run/${agent}`, {});
    assert.equal(r.status, 200, `${agent}: ${JSON.stringify(r.data)}`);
    assert.ok(r.data.skipped || r.data.versionId, `${agent} produced a version`);
  }

  // resume: everything is readable after the fact, as a fresh client would see it
  const state = await api(`/api/clients/${clientId}/campaigns/${cid}`);
  const agents = Object.keys(state.data.outputs);
  assert.ok(agents.includes('strategist') && agents.includes('copywriter') && agents.includes('localiser'), 'outputs persisted: ' + agents.join(','));
  assert.equal(state.data.stale.length, 0, 'nothing stale after a clean run');
  assert.ok(state.data.economics.costEur > 0, 'ledger has cost');
  console.log('  persisted agents:', agents.join(', '), '| €', state.data.economics.costEur);

  // stale detection: change the brief, downstream agents go stale
  await api(`/api/clients/${clientId}/campaigns/${cid}`, { method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ brief: { ...camp.data.campaign.brief, tone: 'warm' } }) });
  const after = await api(`/api/clients/${clientId}/campaigns/${cid}`);
  assert.ok(after.data.stale.length > 0, 'brief change marks agents stale');
  console.log('  stale after brief edit:', after.data.stale.join(', '));

  // ledger
  const ledger = await api('/api/ledger');
  assert.ok(ledger.data.entries.length >= 6, 'one ledger entry per agent run');
  assert.ok(ledger.data.totals.byAgent.copywriter > 0);

  // export
  const zip = await fetch(`${base}/api/export/${clientId}`);
  assert.equal(zip.status, 200);
  assert.match(zip.headers.get('content-type'), /zip/);
  const buf = Buffer.from(await zip.arrayBuffer());
  assert.ok(buf.length > 500, 'export zip has content');
  assert.equal(buf.slice(0, 2).toString(), 'PK', 'is a zip');
  console.log('  export:', buf.length, 'bytes');

  // briefing document parse (task 13)
  const camp2 = await post(`/api/clients/${clientId}/campaigns`, { brief: {
    productName: '', productDescription: '', targetAudience: '',
    objective: 'lead_generation', tone: 'professional', languages: ['en'] } });
  const cid2 = camp2.data.campaignId;
  const briefForm = new FormData();
  briefForm.append('file', new Blob(['Campaign brief: Ledgerline trial push for finance leads. Do not name competitors.'], { type: 'text/plain' }), 'brief.txt');
  const parsed = await fetch(`${base}/api/clients/${clientId}/campaigns/${cid2}/brief/parse`, { method: 'POST', body: briefForm });
  const pdata = await parsed.json();
  assert.equal(parsed.status, 200, JSON.stringify(pdata));
  assert.ok(pdata.brief.productName, 'brief fields filled from the document');
  assert.ok(pdata.filled.length >= 3, 'several fields filled: ' + pdata.filled.join(','));
  const withBrief = await api(`/api/clients/${clientId}/sources`);
  assert.ok(withBrief.data.sources.some((s) => s.kind === 'brief'), 'document kept as a source');
  console.log('  brief parse filled:', pdata.filled.join(', '));

  // a filled field is never overwritten
  await api(`/api/clients/${clientId}/campaigns/${cid2}`, { method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ brief: { ...pdata.brief, productName: 'My Own Name' } }) });
  const form2 = new FormData();
  form2.append('file', new Blob(['Campaign brief: Ledgerline trial push.'], { type: 'text/plain' }), 'brief2.txt');
  const again = await (await fetch(`${base}/api/clients/${clientId}/campaigns/${cid2}/brief/parse`, { method: 'POST', body: form2 })).json();
  assert.equal(again.brief.productName, 'My Own Name', 'a filled field survives a second parse');
  console.log('  filled fields are not overwritten');

  // Copy checks: the same verdicts, without running an agent.
  const chk = await post('/api/check', { text: 'A robust, seamless platform.' });
  assert.equal(chk.status, 200, 'check route answers');
  assert.equal(chk.data.verdict, 'violations', 'slop is refused');
  assert.ok(chk.data.flags.every((f) => f.why), 'every flag says why');
  assert.equal(chk.data.ranWithoutClientRules, true, 'says it ran without client rules');

  const cleanCopy = await post('/api/check', { text: 'Close the month four days faster.', channel: 'linkedin' });
  assert.equal(cleanCopy.data.verdict, 'clean', 'good copy is clean');
  assert.equal(cleanCopy.data.channel, 'linkedin');

  // A client on its own contributes what it knows, and says the rest did not run.
  const withClient = await post('/api/check', { text: 'Hello there.', clientId });
  assert.equal(withClient.status, 200, 'a client without a campaign is allowed');
  assert.equal(withClient.data.ranWithoutClientRules, false, 'and its own rules count as client rules');

  const empty = await post('/api/check', {});
  assert.equal(empty.status, 400, 'no text is a bad request');
  console.log('  copy check route:', chk.data.flags.length, 'flags');

  // The schedule handoff: real dates, in a shape an importer accepts.
  const noDate = await fetch(`${base}/api/clients/${clientId}/campaigns/${cid}/schedule`);
  assert.equal(noDate.status, 400, 'a schedule without a start date is refused');

  const sched = await fetch(`${base}/api/clients/${clientId}/campaigns/${cid}/schedule?start=2026-09-07&format=hootsuite`);
  assert.equal(sched.status, 200, 'the schedule route answers');
  assert.ok(/text\/csv/.test(sched.headers.get('content-type') || ''), 'and returns CSV, not JSON');
  const schedBody = await sched.text();
  assert.ok(/^09\/07\/2026 /.test(schedBody), `Hootsuite wants the date first, got: ${schedBody.slice(0, 30)}`);
  assert.ok(!/^when,/.test(schedBody), 'and no header row');
  console.log('  schedule export:', schedBody.split('\n').length, 'rows');

  console.log('api tests: ok');
  stop();
  process.exit(0);
})().catch((e) => { console.error('api tests FAILED', e); stop(); process.exit(1); });
