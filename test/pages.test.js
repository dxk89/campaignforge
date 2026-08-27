/**
 * Page-render tests: the workbench and library must render populated data
 * server-side. Catches the classic port bugs (undefined access on a panel,
 * a missing key, a client component receiving a Firestore object).
 * Run: node test/pages.test.js
 */
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const env = { ...process.env, MOCK_CLAUDE: '1', MOCK_AUTH: '1', ALLOWED_EMAIL: 'test@example.com' };
const server = spawn('npx', ['next', 'start', '-p', '3224'], { cwd: path.join(root, 'web'), env, stdio: 'ignore' });
const site = spawn('python3', ['-m', 'http.server', '8099'], { cwd: path.join(__dirname, 'fixture-site'), stdio: 'ignore' });
const stop = () => { server.kill(); site.kill(); };
process.on('exit', stop);

const base = 'http://localhost:3224';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json() }));
const html = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.text() }; };

(async () => {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch {} await wait(500); }

  const { data: created } = await post('/api/clients', { url: 'http://localhost:8099' });
  const clientId = created.clientId;

  // library page renders with the brand kit
  const lib = await html(`/clients/${clientId}`);
  assert.equal(lib.status, 200);
  assert.ok(lib.body.includes('Ledgerline'), 'client name rendered');
  assert.ok(lib.body.includes('Brand kit'), 'brand kit section rendered');
  assert.ok(lib.body.includes('Voice rules'), 'voice rules editor rendered');
  assert.ok(/#0f5c6b/i.test(lib.body), 'palette swatch rendered');
  console.log('  library page ok');

  // clients list
  const list = await html('/clients');
  assert.ok(list.body.includes('Ledgerline'), 'client appears in the list');

  // campaign, run the chain, then render the workbench
  const { data: camp } = await post(`/api/clients/${clientId}/campaigns`, { brief: {
    productName: 'Ledgerline', productDescription: 'Reconciliation', targetAudience: 'Finance leads',
    objective: 'trial_signups', tone: 'direct', languages: ['en', 'pt'], webResearch: true } });
  const cid = camp.campaignId;

  const empty = await html(`/clients/${clientId}/campaigns/${cid}`);
  assert.ok(empty.body.includes('Nothing generated yet'), 'empty state renders');

  for (const agent of ['brand-analyst', 'customer-researcher', 'strategist', 'copywriter', 'social-planner', 'ops-architect', 'localiser']) {
    const r = await post(`/api/clients/${clientId}/campaigns/${cid}/run/${agent}`, {});
    assert.equal(r.status, 200, `${agent}: ${JSON.stringify(r.data)}`);
  }

  const wb = await html(`/clients/${clientId}/campaigns/${cid}`);
  assert.equal(wb.status, 200);
  const checks = {
    'stepper labels': /Research[\s\S]*Audience[\s\S]*Strategy[\s\S]*Assets[\s\S]*Social[\s\S]*Activation/,
    'research content': /company_summary|Ledgerline is a reconciliation tool|Positioning/,
    'tabs rendered': /role="tab"/,
    'economics footer': /econ-cost|Cost/,
    'no react error': /^(?!.*Application error)/s,
  };
  for (const [name, re] of Object.entries(checks)) assert.ok(re.test(wb.body), `workbench: ${name}`);
  assert.ok(!wb.body.includes('Nothing generated yet'), 'results replaced the empty state');
  console.log('  workbench page ok |', (wb.body.match(/role="tab"/g) || []).length, 'tabs');

  // every panel renders without throwing: request the page once per tab is
  // client-side, so assert the payload carries each agent's output instead.
  for (const key of ['lead_angle', 'primary_text', 'headlines', 'branch_note', 'lifecycle', 'mql_definition', 'kpi_tree', 'pillars']) {
    assert.ok(wb.body.includes(key), `payload contains ${key}`);
  }
  console.log('  all agent payloads present');

  // images: mock mode returns an SVG placeholder, stored and ledgered
  const social = JSON.parse(wb.body.match(/"posts":\[/) ? '{}' : '{}');
  const img = await post(`/api/clients/${clientId}/campaigns/${cid}/images`, { day: 3, channel: 'instagram' });
  assert.equal(img.status, 200, JSON.stringify(img.data));
  assert.ok(img.data.image.storageRef.includes('day3-instagram'), 'image stored under a readable path');
  assert.ok(img.data.dataUrl.startsWith('data:'), 'data url returned for the UI');
  console.log('  image generated and stored:', img.data.image.storageRef.split('/').pop());

  const badImg = await post(`/api/clients/${clientId}/campaigns/${cid}/images`, { day: 99, channel: 'instagram' });
  assert.equal(badImg.status, 404, 'unknown post refused');

  // ledger page shows the image call
  const led = await html('/ledger');
  assert.equal(led.status, 200);
  assert.ok(led.body.includes('copywriter'), 'ledger lists agents');
  assert.ok(led.body.includes('image'), 'ledger lists the image call');
  console.log('  ledger page ok');

  const set = await html('/settings');
  assert.equal(set.status, 200);
  assert.ok(set.body.includes('Data handling'), 'settings shows the data-handling statement');
  assert.ok(set.body.includes('In memory'), 'settings is honest about the store');
  console.log('  settings page ok');

  console.log('page tests: ok');
  stop(); process.exit(0);
})().catch((e) => { console.error('page tests FAILED', e); stop(); process.exit(1); });
