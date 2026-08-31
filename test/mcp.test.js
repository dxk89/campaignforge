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
  assert.deepEqual(names, ['check_copy', 'scan_site'], 'two tools, named as documented');

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

  console.log('mcp tests: ok');
})().catch((e) => { console.error('mcp tests FAILED', e); process.exit(1); });
