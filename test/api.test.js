/**
 * Route-level tests against a running Next server in mock mode.
 * Exercises the Phase 1 contract: client from scan, sources, campaign,
 * per-agent run with persistence, resume, stale detection, ledger, export.
 * Run: node test/api.test.js
 */
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const env = { ...process.env, MOCK_CLAUDE: '1', MOCK_AUTH: '1', ALLOWED_EMAIL: 'test@example.com', PORT: '3223' };
const server = spawn('npx', ['next', 'start', '-p', '3223'], { cwd: path.join(root, 'web'), env, stdio: 'ignore' });
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

  console.log('api tests: ok');
  stop();
  process.exit(0);
})().catch((e) => { console.error('api tests FAILED', e); stop(); process.exit(1); });
