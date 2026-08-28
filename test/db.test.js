/**
 * Data-layer tests against the in-memory store (no Firebase project needed).
 * Run: node test/db.test.js
 */
process.env.MOCK_AUTH = '1';

// Two backends, same assertions. With FIRESTORE_EMULATOR_HOST set (see
// `npm run test:emulator`) this runs against a real Firestore; otherwise it
// runs against the in-memory store. Production uses the former, so both must
// pass before a release.
const EMULATED = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (EMULATED) {
  process.env.FIREBASE_SERVICE_ACCOUNT = Buffer.from(JSON.stringify({
    project_id: process.env.GCLOUD_PROJECT || 'demo-cf',
    client_email: 'test@demo-cf.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nemulator\n-----END PRIVATE KEY-----\n',
  })).toString('base64');
} else {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
}
const assert = require('assert');
const path = require('path');

// db.ts is TypeScript; compile it on the fly for the test.
require('child_process').execSync(
  'npx tsc server/db.ts server/firebase.ts server/types.ts --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop',
  { cwd: path.join(__dirname, '..', 'web'), stdio: 'pipe' }
);
const db = require('../web/.test-build/db.js');

(async () => {
  console.log('  backend:', EMULATED ? 'firestore emulator' : 'in-memory');
  if (!EMULATED) db.__resetMemory();

  // Every call below takes the workspace id explicitly, as every real caller
  // now must (session.workspaceId). 'owner' matches MOCK_AUTH's workspace, so
  // this exercises the same root the suite always has.
  const ws = 'owner';

  // client lifecycle
  const client = await db.createClient(ws, { name: 'Ledgerline', domain: 'ledgerline.example' });
  assert.ok(client.clientId);
  assert.equal((await db.listClients(ws)).length, 1);
  assert.equal((await db.getClient(ws, client.clientId)).name, 'Ledgerline');

  await db.updateClient(ws, client.clientId, { voice: { observations: ['short sentences'], preferredTerms: ['exceptions'], avoidTerms: ['errors'], glossary: [] } });
  assert.deepEqual((await db.getClient(ws, client.clientId)).voice.avoidTerms, ['errors']);

  // sources: text withheld unless asked for
  await db.addSource(ws, client.clientId, { name: 'home', kind: 'site', storageRef: null, text: 'We write short.', chars: 15 });
  const lean = await db.listSources(ws, client.clientId);
  assert.equal(lean[0].text, '', 'listSources should omit text by default');
  const full = await db.listSources(ws, client.clientId, true);
  assert.equal(full[0].text, 'We write short.');

  // campaign + versions + current pointer
  const campaign = await db.createCampaign(ws, client.clientId, { productName: 'Ledgerline', productDescription: 'x', targetAudience: 'y', objective: 'trial_signups', tone: 'direct', languages: ['en'] });
  const v1 = await db.addVersion(ws, client.clientId, campaign.campaignId, {
    agent: 'strategist', output: { lead_angle: 'Four days back' }, inputsHash: db.hashOf({ a: 1 }),
    promptVersion: null, model: 'claude-sonnet-4-6', usage: { input: 10, output: 5, ms: 100, costEur: 0.01 },
    trace: [], complete: true, problems: [], parentVersionId: null, changeNote: null,
  });
  let c = await db.getCampaign(ws, client.clientId, campaign.campaignId);
  assert.equal(c.current.strategist, v1.versionId, 'current pointer follows the newest version');

  const v2 = await db.addVersion(ws, client.clientId, campaign.campaignId, {
    agent: 'strategist', output: { lead_angle: 'Exceptions only' }, inputsHash: db.hashOf({ a: 2 }),
    promptVersion: null, model: 'claude-sonnet-4-6', usage: { input: 10, output: 5, ms: 100, costEur: 0.01 },
    trace: [], complete: true, problems: [], parentVersionId: v1.versionId, changeNote: 'retry',
  });
  c = await db.getCampaign(ws, client.clientId, campaign.campaignId);
  assert.equal(c.current.strategist, v2.versionId);
  assert.equal((await db.listVersions(ws, client.clientId, campaign.campaignId, 'strategist')).length, 2, 'history is kept');

  // stale detection: an agent whose recorded input hash no longer matches upstream
  const outputs = await db.currentOutputs(ws, client.clientId, campaign.campaignId);
  assert.equal(outputs.strategist.output.lead_angle, 'Exceptions only');
  const upstreamHash = db.hashOf({ a: 2 });
  assert.equal(outputs.strategist.inputsHash === upstreamHash, true, 'fresh when hashes match');
  assert.equal(outputs.strategist.inputsHash === db.hashOf({ a: 3 }), false, 'stale when upstream changes');

  // ledger
  await db.addLedger(ws, { clientId: client.clientId, campaignId: campaign.campaignId, agent: 'strategist', model: 'claude-sonnet-4-6', input: 100, output: 50, webSearches: 0, images: 0, costEur: 0.02 });
  await db.addLedger(ws, { clientId: client.clientId, campaignId: campaign.campaignId, agent: 'copywriter', model: 'claude-sonnet-4-6', input: 200, output: 300, webSearches: 0, images: 0, costEur: 0.05 });
  const totals = db.ledgerTotals(await db.listLedger(ws));
  assert.equal(totals.costEur, 0.07);
  assert.equal(totals.byAgent.copywriter, 0.05);

  // deletion
  await db.deleteSource(ws, client.clientId, full[0].sourceId);
  assert.equal((await db.listSources(ws, client.clientId)).length, 0);

  // ---- cross-workspace isolation: two workspaces must never see each other's
  // data. This is the property the whole "thread ws through db.ts" change
  // exists for; without it a store-less deployment holding several accounts
  // (see server/accounts.ts) would let any one of them read every other's
  // clients, campaigns and spend.
  const ws_a = 'ws_a';
  const ws_b = 'ws_b';
  const clientA = await db.createClient(ws_a, { name: 'Alice Co' });
  const clientB = await db.createClient(ws_b, { name: 'Bob Co' });

  const listA = await db.listClients(ws_a);
  assert.equal(listA.length, 1, 'ws_a sees only its own client');
  assert.ok(!listA.some((c) => c.clientId === clientB.clientId), 'ws_a does not see ws_b\'s client');
  assert.equal(await db.getClient(ws_a, clientB.clientId), null, 'ws_a cannot fetch ws_b\'s client by id');

  const listB = await db.listClients(ws_b);
  assert.equal(listB.length, 1, 'ws_b sees only its own client');
  assert.ok(!listB.some((c) => c.clientId === clientA.clientId), 'ws_b does not see ws_a\'s client');

  // Ledger: the one an account could use to see another's spend.
  await db.addLedger(ws_a, { clientId: clientA.clientId, campaignId: 'camp-a', agent: 'strategist', model: 'claude-sonnet-4-6', input: 10, output: 5, webSearches: 0, images: 0, costEur: 1.23 });
  await db.addLedger(ws_b, { clientId: clientB.clientId, campaignId: 'camp-b', agent: 'strategist', model: 'claude-sonnet-4-6', input: 10, output: 5, webSearches: 0, images: 0, costEur: 9.99 });

  const ledgerA = await db.listLedger(ws_a);
  assert.equal(ledgerA.length, 1, 'ws_a sees only its own ledger entries');
  assert.equal(db.ledgerTotals(ledgerA).costEur, 1.23, 'ws_a spend excludes ws_b spend');

  const ledgerB = await db.listLedger(ws_b);
  assert.equal(ledgerB.length, 1, 'ws_b sees only its own ledger entries');
  assert.equal(db.ledgerTotals(ledgerB).costEur, 9.99, 'ws_b spend excludes ws_a spend');

  console.log('db tests: ok');
})().catch((e) => { console.error('db tests FAILED', e); process.exit(1); });

// ---- memory (task 17): degrades to empty without a store, and null for claims
(async () => {
  const assert2 = require('assert');
  if (!process.env.FIRESTORE_EMULATOR_HOST) delete process.env.FIREBASE_SERVICE_ACCOUNT;
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test';
  const memory = require('../lib/memory');
  const [ex, le, co, cl, none] = await Promise.all([
    memory.exemplars({ ws: 'owner', clientId: 'c1', channel: 'meta' }),
    memory.learnings({ ws: 'owner', clientId: 'c1' }),
    memory.corrections({ ws: 'owner', clientId: 'c1', agent: 'copywriter' }),
    memory.approvedClaims({ ws: 'owner', clientId: 'c1' }),
    memory.approvedClaims({ ws: 'owner' }),
  ]);
  assert2.deepEqual([ex, le, co], [[], [], []], 'lists are empty without a store');
  assert2.equal(cl, null, 'approvedClaims returns null, not [], so buildRules falls back to proof points');
  assert2.equal(none, null, 'no clientId returns null');

  // and buildRules treats that null correctly
  const { buildRules } = require('../lib/agents/packets');
  const rules = buildRules({ productName: 'X', productDescription: 'd' }, { proof_points: [{ claim: 'four days faster' }] }, cl);
  assert2.equal(rules.claimSeverity, 'warning', 'no registry means claim flags are warnings');
  assert2.ok(rules.approvedClaims.includes('four days faster'), 'falls back to context proof points');
  console.log('memory tests: ok');
})().catch((e) => { console.error('memory tests FAILED', e); process.exit(1); });
