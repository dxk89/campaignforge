/**
 * Data-layer tests against the in-memory store (no Firebase project needed).
 * Run: node test/db.test.js
 */
process.env.MOCK_AUTH = '1';
delete process.env.FIREBASE_SERVICE_ACCOUNT;
const assert = require('assert');
const path = require('path');

// db.ts is TypeScript; compile it on the fly for the test.
require('child_process').execSync(
  'npx tsc server/db.ts server/firebase.ts server/types.ts --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop',
  { cwd: path.join(__dirname, '..', 'web'), stdio: 'pipe' }
);
const db = require('../web/.test-build/db.js');

(async () => {
  db.__resetMemory();

  // client lifecycle
  const client = await db.createClient({ name: 'Ledgerline', domain: 'ledgerline.example' });
  assert.ok(client.clientId);
  assert.equal((await db.listClients()).length, 1);
  assert.equal((await db.getClient(client.clientId)).name, 'Ledgerline');

  await db.updateClient(client.clientId, { voice: { observations: ['short sentences'], preferredTerms: ['exceptions'], avoidTerms: ['errors'], glossary: [] } });
  assert.deepEqual((await db.getClient(client.clientId)).voice.avoidTerms, ['errors']);

  // sources: text withheld unless asked for
  await db.addSource(client.clientId, { name: 'home', kind: 'site', storageRef: null, text: 'We write short.', chars: 15 });
  const lean = await db.listSources(client.clientId);
  assert.equal(lean[0].text, '', 'listSources should omit text by default');
  const full = await db.listSources(client.clientId, true);
  assert.equal(full[0].text, 'We write short.');

  // campaign + versions + current pointer
  const campaign = await db.createCampaign(client.clientId, { productName: 'Ledgerline', productDescription: 'x', targetAudience: 'y', objective: 'trial_signups', tone: 'direct', languages: ['en'] });
  const v1 = await db.addVersion(client.clientId, campaign.campaignId, {
    agent: 'strategist', output: { lead_angle: 'Four days back' }, inputsHash: db.hashOf({ a: 1 }),
    promptVersion: null, model: 'claude-sonnet-4-6', usage: { input: 10, output: 5, ms: 100, costEur: 0.01 },
    trace: [], complete: true, problems: [], parentVersionId: null, changeNote: null,
  });
  let c = await db.getCampaign(client.clientId, campaign.campaignId);
  assert.equal(c.current.strategist, v1.versionId, 'current pointer follows the newest version');

  const v2 = await db.addVersion(client.clientId, campaign.campaignId, {
    agent: 'strategist', output: { lead_angle: 'Exceptions only' }, inputsHash: db.hashOf({ a: 2 }),
    promptVersion: null, model: 'claude-sonnet-4-6', usage: { input: 10, output: 5, ms: 100, costEur: 0.01 },
    trace: [], complete: true, problems: [], parentVersionId: v1.versionId, changeNote: 'retry',
  });
  c = await db.getCampaign(client.clientId, campaign.campaignId);
  assert.equal(c.current.strategist, v2.versionId);
  assert.equal((await db.listVersions(client.clientId, campaign.campaignId, 'strategist')).length, 2, 'history is kept');

  // stale detection: an agent whose recorded input hash no longer matches upstream
  const outputs = await db.currentOutputs(client.clientId, campaign.campaignId);
  assert.equal(outputs.strategist.output.lead_angle, 'Exceptions only');
  const upstreamHash = db.hashOf({ a: 2 });
  assert.equal(outputs.strategist.inputsHash === upstreamHash, true, 'fresh when hashes match');
  assert.equal(outputs.strategist.inputsHash === db.hashOf({ a: 3 }), false, 'stale when upstream changes');

  // ledger
  await db.addLedger({ clientId: client.clientId, campaignId: campaign.campaignId, agent: 'strategist', model: 'claude-sonnet-4-6', input: 100, output: 50, webSearches: 0, images: 0, costEur: 0.02 });
  await db.addLedger({ clientId: client.clientId, campaignId: campaign.campaignId, agent: 'copywriter', model: 'claude-sonnet-4-6', input: 200, output: 300, webSearches: 0, images: 0, costEur: 0.05 });
  const totals = db.ledgerTotals(await db.listLedger());
  assert.equal(totals.costEur, 0.07);
  assert.equal(totals.byAgent.copywriter, 0.05);

  // deletion
  await db.deleteSource(client.clientId, full[0].sourceId);
  assert.equal((await db.listSources(client.clientId)).length, 0);

  console.log('db tests: ok');
})().catch((e) => { console.error('db tests FAILED', e); process.exit(1); });
