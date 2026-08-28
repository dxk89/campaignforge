/** Phase 4: ceiling, telemetry, audit mode, prompts API, settings. */
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const env = { ...process.env, MOCK_CLAUDE: '1', MOCK_AUTH: '1', ALLOWED_EMAIL: 'test@example.com' };
const server = spawn('npx', ['next', 'start', '-p', '3227'], { cwd: path.join(root, 'web'), env, stdio: 'ignore' });
const site = spawn('python3', ['-m', 'http.server', '8099'], { cwd: path.join(__dirname, 'fixture-site'), stdio: 'ignore' });
const stop = () => { server.kill(); site.kill(); };
process.on('exit', stop);

const base = 'http://localhost:3227';
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
    objective: 'trial_signups', tone: 'direct', languages: ['en'], webResearch: false } });
  const cid = camp.campaignId;
  const run = (a) => post(`/api/clients/${clientId}/campaigns/${cid}/run/${a}`, {});

  for (const a of ['brand-analyst', 'strategist', 'copywriter']) await run(a);

  // telemetry counted the runs
  const tel = await api('/api/telemetry');
  assert.ok(tel.data.counters['run.copywriter'] >= 1, 'runs are counted: ' + JSON.stringify(tel.data.counters));
  console.log('  telemetry:', Object.entries(tel.data.counters).map(([k, v]) => `${k}=${v}`).join(' '));

  // the ceiling refuses before spending
  await patch('/api/settings', { monthlyCeilingEur: 0.01, ceilingAction: 'refuse' });
  const refused = await run('social-planner');
  assert.equal(refused.status, 402, 'a run past the ceiling is refused');
  assert.match(refused.data.error, /ceiling/i);
  assert.match(refused.data.error, /Settings/, 'the message says where to change it');
  console.log('  ceiling refused:', refused.data.error.slice(0, 80));

  // warn mode proceeds and says so
  await patch('/api/settings', { ceilingAction: 'warn' });
  const warned = await run('social-planner');
  assert.equal(warned.status, 200, 'warn mode proceeds');
  assert.ok(warned.data.warning, 'and carries the warning');
  await patch('/api/settings', { monthlyCeilingEur: null });
  console.log('  warn mode proceeds with a warning');

  // audit refuses with nothing approved, then runs
  const tooEarly = await post(`/api/clients/${clientId}/campaigns/${cid}/audit`, {});
  assert.equal(tooEarly.status, 409, 'no audit before anything is approved');
  const assets = (await api(`/api/clients/${clientId}/campaigns/${cid}/assets?language=en`)).data.assets;
  const clean = assets.filter((a) => !a.flags?.some((f) => f.severity === 'violation')).slice(0, 5);
  for (const a of clean) await patch(`/api/clients/${clientId}/campaigns/${cid}/assets/${encodeURIComponent(a.assetId)}`, { status: 'approved' });
  const audit = await post(`/api/clients/${clientId}/campaigns/${cid}/audit`, {});
  assert.equal(audit.status, 200, JSON.stringify(audit.data));
  assert.equal(audit.data.audited, clean.length);
  assert.ok(Array.isArray(audit.data.unusedClaims), 'unused approved claims are reported');
  console.log('  audit:', audit.data.audited, 'approved assets |', audit.data.unusedClaims.length, 'unused claims');

  // prompts API returns the code default and refuses a save without a note
  const prompts = await api('/api/prompts/copywriter');
  assert.equal(prompts.status, 200);
  assert.ok(prompts.data.codeRole.includes('submit'), 'the code role is returned');
  assert.equal(prompts.data.storeEnabled, false, 'no store in this run');
  const badSave = await post('/api/prompts/copywriter', { role: 'x', changeNote: '' });
  assert.ok([400, 503].includes(badSave.status), 'a save without a note or a store is refused');
  const unknown = await api('/api/prompts/nonesuch');
  assert.equal(unknown.status, 404);
  console.log('  prompts API ok |', prompts.data.tools.join(','));

  // pages render
  for (const p of ['/settings', '/prompts', '/ledger']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    const body = await r.text();
    assert.ok(!body.includes('Application error'), p + ' rendered');
  }
  console.log('  settings, prompts and ledger pages render');

  console.log('phase 4 tests: ok');
  stop(); process.exit(0);
})().catch((e) => { console.error('phase 4 tests FAILED', e); stop(); process.exit(1); });
