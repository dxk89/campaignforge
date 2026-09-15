/**
 * The MCP server's tools.
 *
 * The server is a second entry point into core/, so the risk is drift: a
 * schema promising an argument the function does not take fails only inside
 * someone else's client, where nobody can debug it. This asserts the schemas
 * against the functions they call, without starting a server.
 */
const assert = require('assert');
const { TOOLS, callTool } = require('../mcp/server');

(async () => {
  const names = TOOLS.map((t) => t.name).sort();
  assert.deepEqual(names, ['check_copy', 'cost', 'create_campaign', 'create_client', 'get_output', 'list_campaigns', 'list_clients', 'nuelink_setup', 'push_to_nuelink', 'run_agent', 'scan_site'], 'eleven tools, named as documented');

  for (const t of TOOLS) {
    assert.ok(t.description && t.description.length > 30, `${t.name} explains itself`);
    assert.equal(t.inputSchema.type, 'object', `${t.name} takes an object`);
    assert.ok(Array.isArray(t.inputSchema.required), `${t.name} says what is required`);
  }

  // The schema must offer exactly what checkCopy reads. Anything more is a
  // promise the function does not keep.
  const copy = TOOLS.find((t) => t.name === 'check_copy');
  assert.deepEqual(copy.inputSchema.required, ['text'], 'only text is required');
  assert.deepEqual(
    Object.keys(copy.inputSchema.properties).sort(),
    ['channel', 'text'],
    'the schema offers exactly the arguments checkCopy reads'
  );

  const site = TOOLS.find((t) => t.name === 'scan_site');
  assert.deepEqual(site.inputSchema.required, ['url'], 'scan_site needs a url');
  assert.deepEqual(Object.keys(site.inputSchema.properties).sort(), ['maxPages', 'url']);

  // The result is read by a person or quoted by a model, so it is plain text
  // with the verdict first.
  const out = await callTool('check_copy', { text: 'A robust, seamless platform.' });
  assert.ok(/^Needs a fix/.test(out), 'the verdict leads');
  assert.ok(/robust/.test(out), 'and it names the problem');
  assert.ok(/without a client/.test(out), 'and says which rules did not run');

  const clean = await callTool('check_copy', { text: 'Close the month four days faster.' });
  assert.ok(/^Clean/.test(clean), 'good copy comes back clean');

  // A named channel it does not fit is reported as too long.
  const narrow = await callTool('check_copy', { text: 'Close the month four days faster.', channel: 'google' });
  assert.ok(/Too long for: google/.test(narrow), 'a chosen channel reports its own limits');

  await assert.rejects(() => callTool('nope', {}), /unknown tool/i, 'an unknown tool is refused');

  // The data claim in the documentation has to stay true: check_copy must not
  // reach the network. scan_site is the only tool that fetches anything.
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'mcp', 'server.js'), 'utf8');
  const checkBranch = src.slice(src.indexOf("if (name === 'check_copy')"), src.indexOf("if (name === 'scan_site')"));
  assert.ok(!/fetch\(|http/.test(checkBranch), 'check_copy makes no network call');

  // The app tools talk to a running instance. With none, they say so.
  process.env.CF_URL = 'http://localhost:1';
  const down = await callTool('list_clients', {});
  assert.match(down, /npm run local/, 'a dead app says how to start it');

  // Against a running instance they round-trip. Same pattern as api.test.js.
  const { startNext } = require('./helpers/next-server');
  const server = startNext(3229, { ...process.env, MOCK_CLAUDE: '1', MOCK_AUTH: '1', PORT: '3229' });
  process.on('exit', () => server.kill());
  process.env.CF_URL = 'http://localhost:3229';
  for (let i = 0; i < 40; i++) { try { const r = await fetch('http://localhost:3229/api/health'); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const none = await callTool('list_clients', {});
  assert.match(none, /No clients yet/, 'an empty library reads as a sentence');
  const made = await callTool('create_client', { name: 'Acme' });
  assert.match(made, /Acme/, 'a client can be created by name');
  const id = /id: ([0-9a-f-]{36})/.exec(made)[1];
  const camp = await callTool('create_campaign', { clientId: id, brief: { productName: 'Widget', productDescription: 'A widget', targetAudience: 'Buyers', objective: 'trial_signups', tone: 'direct', languages: ['en'], webResearch: false } });
  const cid = /id: ([0-9a-f-]{36})/.exec(camp)[1];
  const ran = await callTool('run_agent', { clientId: id, campaignId: cid, agent: 'brand-analyst' });
  assert.match(ran, /brand-analyst/, 'a run reports its agent');
  const output = await callTool('get_output', { clientId: id, campaignId: cid, agent: 'brand-analyst' });
  assert.ok(output.length > 50, 'the output is returned as text');
  const spend = await callTool('cost', { campaignId: cid });
  assert.match(spend, /EUR/, 'cost is a money line');
  server.kill();

  console.log('mcp tests: ok');
})().catch((e) => { console.error('mcp tests FAILED', e); process.exit(1); });
