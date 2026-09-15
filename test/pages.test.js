/**
 * Page-render tests: the workbench and library must render populated data
 * server-side. Catches the classic port bugs (undefined access on a panel,
 * a missing key, a client component receiving a Firestore object).
 * Run: node test/pages.test.js
 */
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const { startNext } = require('./helpers/next-server');

const root = path.join(__dirname, '..');
const env = { ...process.env, MOCK_CLAUDE: '1', MOCK_AUTH: '1', ALLOWED_EMAIL: 'test@example.com' };
const server = startNext(3224, env);
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

  // the image route is gone with Gemini. Fetched directly, not through the
  // post() helper: a deleted route serves Next's HTML 404 page, and post()
  // always calls r.json(), which throws on that body.
  const goneRes = await fetch(`${base}/api/clients/${clientId}/campaigns/${cid}/images`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day: 3, channel: 'instagram' }),
  });
  assert.equal(goneRes.status, 404, 'image generation route removed');

  const led = await html('/ledger');
  assert.equal(led.status, 200);
  assert.ok(led.body.includes('copywriter'), 'ledger lists agents');
  console.log('  ledger page ok');

  const set = await html('/settings');
  assert.equal(set.status, 200);
  assert.ok(set.body.includes('Data handling'), 'settings shows the data-handling statement');
  assert.ok(set.body.includes('In memory'), 'settings is honest about the store');
  assert.ok(set.body.includes('Local, no sign-in'), 'settings says it is the local run (MOCK_AUTH=1 in tests)');
  // The demo-accounts panel went with the account system. What Settings must
  // still show an admin is the thing only an admin may change.
  assert.ok(set.body.includes('Monthly ceiling'), 'settings shows the spend ceiling to an admin');
  assert.ok(!set.body.includes('Demo accounts'), 'and no longer offers accounts to manage');
  console.log('  settings page ok');

  // nav and root redirect (task 11)
  const rootRes = await fetch(base + '/', { redirect: 'manual' });
  assert.ok([307, 302, 303].includes(rootRes.status), 'root redirects: ' + rootRes.status);
  assert.match(rootRes.headers.get('location') || '', /\/clients/, 'root goes to /clients when signed in');
  const clientsPage = await html('/clients');
  assert.ok(clientsPage.body.includes('href="/ledger"'), 'nav links to ledger');
  assert.ok(clientsPage.body.includes('href="/settings"'), 'nav links to settings');
  console.log('  nav and root redirect ok');

  // url + paste sources through the library's routes (task 12)
  const urlSrc = await post(`/api/clients/${clientId}/sources`, { url: 'http://localhost:8099/about/' });
  assert.equal(urlSrc.status, 200, JSON.stringify(urlSrc.data));
  const pasteSrc = await post(`/api/clients/${clientId}/sources`, { label: 'brand-voice.md', text: 'We write short.' });
  assert.equal(pasteSrc.status, 200);
  const lib2 = await html(`/clients/${clientId}`);
  assert.ok(lib2.body.includes('brand-voice.md'), 'pasted source appears in the library');
  assert.ok(lib2.body.includes('Fetch page'), 'url input rendered');
  assert.ok(lib2.body.includes('Brand assets'), 'brand assets section rendered');
  console.log('  library source inputs ok');

  // logo upload + file streaming route (task 12)
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' + '0d0a2db4', 'hex');
  const form = new FormData();
  form.append('logo', new Blob([png], { type: 'image/png' }), 'logo.png');
  const up = await fetch(`${base}/api/clients/${clientId}/assets`, { method: 'POST', body: form });
  const upData = await up.json();
  assert.equal(up.status, 200, JSON.stringify(upData));
  assert.ok(upData.brandKit.logoRef, 'logoRef recorded');
  const fileRes = await fetch(`${base}/api/files/${upData.brandKit.logoRef}`);
  assert.equal(fileRes.status, 200, 'stored file streams back');
  assert.match(fileRes.headers.get('content-type'), /image/);
  const denied = await fetch(`${base}/api/files/users/someone-else/secret.png`);
  assert.equal(denied.status, 404, 'refs outside the namespace read as not found, not 403, so the response reveals nothing about another workspace');
  console.log('  asset upload and file route ok');

  // tracking table on Measurement (task 16) and export buttons (task 15)
  const wb2 = await html(`/clients/${clientId}/campaigns/${cid}`);
  assert.ok(wb2.body.includes('utm_campaign'), 'tracking plan reaches the page');
  assert.ok(wb2.body.includes('Assets CSV') && wb2.body.includes('Social CSV'), 'export buttons render');
  console.log('  tracking table and exports ok');

  // visual briefs still reach the page; they are a brief a person can use
  assert.ok(wb2.body.includes('image_prompt'), 'visual briefs reach the client');

  // Nuelink: the Social tab is client-rendered and not the workbench's
  // default tab, so its "Send to Nuelink" heading does not reach this
  // server-rendered HTML (unlike "Hootsuite CSV", also inside that tab,
  // which is absent from wb2.body for the same reason). Assert the API
  // instead, and that the client page carries the mapping section.
  const hist = await fetch(`${base}/api/clients/${clientId}/campaigns/${cid}/schedule/nuelink`).then((r) => r.json());
  assert.deepEqual(hist, { pushes: [], sent: [] }, 'no pushes yet');
  const nlLib = await html(`/clients/${clientId}`);
  assert.ok(nlLib.body.includes('Nuelink'), 'the client page has the Nuelink mapping section');
  console.log('  nuelink: ok');

  // The clinic renders, and says what it is before asking for anything.
  const clinic = await html('/check');
  assert.equal(clinic.status, 200, 'the clinic page renders');
  assert.ok(/Check copy/.test(clinic.body), 'and says what it is');
  assert.ok(/nothing is saved/.test(clinic.body), 'and that it keeps nothing');
  console.log('  clinic page: ok');

  // The integration list renders, and a blocked one shows its blocker rather
  // than the word soon on its own.
  const settingsPage = await html('/settings');
  assert.ok(/Where campaigns can go/.test(settingsPage.body), 'settings lists the destinations');
  assert.ok(/Marketing Hub Professional/.test(settingsPage.body), 'and names what blocks HubSpot');
  console.log('  integration list: ok');

  // Rewrite is a model call taking tens of seconds and it can fail in ways a
  // person can act on: over the limit (422), or the ceiling refused the spend
  // (402). It used to fire the request and ignore the response, so both
  // looked exactly like the button not working. Asserted at the source,
  // because the failure is in what the handler does with a response rather
  // than in anything the page renders.
  const fsx = require('fs');
  const pathx = require('path');
  const panelsSrc = fsx.readFileSync(pathx.join(__dirname, '..', 'web', 'components', 'EditablePanels.tsx'), 'utf8');
  const editorSrc = fsx.readFileSync(pathx.join(__dirname, '..', 'web', 'components', 'AssetEditor.tsx'), 'utf8');
  assert.ok(/if \(!res\.ok\)/.test(panelsSrc), 'regenerate checks whether the request succeeded');
  assert.ok(/body\?\.error/.test(panelsSrc), 'and returns what the server said went wrong');
  assert.ok(/setRewriting\(true\)/.test(editorSrc), 'the field shows it is working');
  assert.ok(/Rewriting/.test(editorSrc), 'and says so on the button');
  assert.ok(/if \(failure\) setError\(failure\)/.test(editorSrc), 'and shows the failure rather than swallowing it');
  console.log('  rewrite reports success and failure: ok');

  console.log('page tests: ok');
  stop(); process.exit(0);
})().catch((e) => { console.error('page tests FAILED', e); stop(); process.exit(1); });
