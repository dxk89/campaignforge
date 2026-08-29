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

// db.ts is TypeScript; compile it on the fly for the test. assets.ts,
// exemplars.ts and telemetry.ts are pulled in too so the cross-workspace
// isolation checks below can exercise their in-memory namespacing directly,
// not just db.ts's.
require('child_process').execSync(
  'npx tsc server/db.ts server/firebase.ts server/types.ts server/assets.ts server/exemplars.ts server/telemetry.ts server/storage.ts --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop',
  { cwd: path.join(__dirname, '..', 'web'), stdio: 'pipe' }
);
const db = require('../web/.test-build/db.js');
const exemplars = require('../web/.test-build/exemplars.js');
const telemetry = require('../web/.test-build/telemetry.js');
const storage = require('../web/.test-build/storage.js');

(async () => {
  console.log('  backend:', EMULATED ? 'firestore emulator' : 'in-memory');
  if (!EMULATED) db.__resetMemory();

  // Every call below takes the workspace id explicitly, as every real caller
  // now must (session.workspaceId). 'owner' matches MOCK_AUTH's workspace, so
  // this exercises the same root the suite always has.
  // Its own workspace: the block above counts the clients in 'owner' and this
  // one shares the in-memory store with it.
  const ws = 'ws-null-dependency';

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

  // Telemetry: usage counters, in-memory keyed by "ws/month" (telemetry.ts).
  // A flattened key (month only, as it was before this task) would make
  // ws_a's count below read 3, not 1.
  await telemetry.count(ws_a, 'run.copywriter', 1);
  await telemetry.count(ws_b, 'run.copywriter', 1);
  await telemetry.count(ws_b, 'run.copywriter', 2); // ws_b totals 3, distinct from ws_a's 1
  const telA = await telemetry.read(ws_a);
  const telB = await telemetry.read(ws_b);
  assert.equal(telA.counters['run.copywriter'], 1, 'ws_a telemetry is exactly its own count, not summed with ws_b');
  assert.equal(telB.counters['run.copywriter'], 3, 'ws_b telemetry is exactly its own count');

  // Exemplars: the approved-copy bank, in-memory keyed by "ws/clientId"
  // (exemplars.ts). Deliberately reuse the SAME clientId string across both
  // workspaces here: that is the only case a flattened key (clientId alone)
  // collides on. Using two random clientIds, as an earlier version of this
  // test did, does not discriminate — distinct ids land on distinct keys
  // even with ws dropped entirely, so that shape passes against a broken
  // implementation too.
  const sharedClientId = 'shared-client-id';
  const assetFor = (text) => ({
    assetId: 'meta.v1.headline.en', channel: 'meta', unit: 'v1', field: 'headline', language: 'en',
    text, generatedText: text, versionId: 'v1', editedAt: null,
    status: 'approved', approvedAt: null, note: null, flags: [],
  });
  await exemplars.recordExemplar(ws_a, sharedClientId, assetFor('Close the month 4 days faster'), 'camp-a', {}, 'approved');
  await exemplars.recordExemplar(ws_b, sharedClientId, assetFor('Ship the report before Friday'), 'camp-b', {}, 'approved');
  const exA = await exemplars.listExemplars(ws_a, sharedClientId);
  const exB = await exemplars.listExemplars(ws_b, sharedClientId);
  assert.equal(exA.length, 1, 'ws_a sees exactly one exemplar for a clientId shared with ws_b');
  assert.equal(exA[0].text, 'Close the month 4 days faster', 'ws_a exemplar text is its own, not ws_b\'s, despite the same clientId');
  assert.equal(exB.length, 1, 'ws_b sees exactly one exemplar for a clientId shared with ws_a');
  assert.equal(exB[0].text, 'Ship the report before Friday', 'ws_b exemplar text is its own, not ws_a\'s, despite the same clientId');

  // Storage: the same cross-workspace isolation, but for object storage
  // (server/storage.ts). getFile enforces the users/<ws>/ prefix itself now,
  // rather than leaving it to a single route, so this proves the module-level
  // guard directly.
  storage.__resetFiles();
  const refA = await storage.putFile('ws_a', 'clients/c1/logo.png', Buffer.from('A'), 'image/png');
  assert.ok((await storage.getFile('ws_a', refA)).buffer.toString() === 'A', 'own workspace can read its file');
  assert.equal(await storage.getFile('ws_b', refA), null, 'another workspace cannot read it');

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

/**
 * Firestore path parity.
 *
 * A Firestore path alternates collection and document, so a chain ending in
 * .doc() needs an even number of components and one ending in .collection()
 * an odd number. Getting this wrong throws only when a real store is
 * attached, and every suite here runs against the in-memory one, so
 * 'system/spend/global' shipped to production and 500ed the whole Settings
 * page - taking the admin panel, which renders inside it, down with it.
 *
 * This reads the source rather than calling anything, which is the only way
 * to check it without a live Firestore. Parity is counted across the whole
 * chain from fsdb(), because each link is relative to the last:
 * .collection('system').doc('auth').collection('accounts') is three
 * components and correct, though no single call in it looks it.
 *
 * Each ${...} counts as one component - an id, a month, an ip key. A chain
 * interpolating a path helper (root, path, rpath, lpath) expands to a number
 * of components this cannot see, so it is skipped; those are covered by the
 * emulator suite, which uses a real store.
 */
(async () => {
  const assertPaths = require('assert');
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'web', 'server');

  const OPAQUE = /\$\{\s*(root|path|rpath|lpath)\s*\(/;
  // The argument may itself contain a call - `.../${key(ip)}` - so one level
  // of nesting is allowed before the closing paren is taken as the end.
  const LINK = /\.(doc|collection)\(\s*((?:[^()]|\([^()]*\))*?)\s*\)/g;
  const STRING = /^([`'"])([^`'"]*)\1$/;

  // A path pulled out into a constant - SETTINGS_PATH - is still a literal
  // path, so resolve single-quoted consts declared in the same file rather
  // than treating the reference as one opaque component.
  const constants = (src) => {
    const found = {};
    for (const [, name, , value] of src.matchAll(/\bconst\s+(\w+)\s*=\s*([`'"])([^`'"]*)\2\s*;/g)) found[name] = value;
    return found;
  };

  let checked = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const consts = constants(src);
    for (const [chain] of src.matchAll(/fsdb\(\)((?:\s*\.(?:doc|collection)\([^()]*(?:\([^()]*\))?[^()]*\))+)/g)) {
      if (OPAQUE.test(chain)) continue;
      let components = 0;
      let last = null;
      for (const [, method, arg] of chain.matchAll(LINK)) {
        last = method;
        const m = STRING.exec(arg);
        const literal = m ? m[2] : (arg in consts ? consts[arg] : undefined);
        // A genuinely dynamic argument - .doc(row.id) - is one component.
        components += literal === undefined
          ? 1
          : literal.replace(/\$\{[^}]*\}/g, 'x').split('/').filter(Boolean).length;
      }
      const wanted = last === 'doc' ? 0 : 1;
      assertPaths.equal(
        components % 2,
        wanted,
        `${file}: ${chain.replace(/\s+/g, ' ')} is ${components} components; ` +
          `a chain ending in .${last}() needs an ${wanted === 0 ? 'even' : 'odd'} number`
      );
      checked++;
    }
  }
  assertPaths.ok(checked >= 3, `expected several chains to check, saw ${checked}`);

  // The one that broke, named explicitly so a regression is unambiguous.
  const spend = fs.readFileSync(path.join(dir, 'spend.ts'), 'utf8');
  assertPaths.ok(
    /SETTINGS_PATH = 'system\/spend'/.test(spend),
    'the global ceiling document is system/spend, a two-component path'
  );
  console.log(`firestore path tests: ok (${checked} chains)`);
})().catch((e) => { console.error('firestore path tests FAILED', e); process.exit(1); });

/**
 * A dependency that ran but submitted nothing is not a dependency that is met.
 *
 * The runtime records a pass that exhausts its call budget without calling
 * submit: cost, token counts and problems are all kept, and the output is
 * null, because invariant 2 forbids accepting an ungated output. buildInputs
 * used to test only whether the record existed, so it handed that null on as
 * though it were the assets and the next pass died inside a prompt builder
 * with "Cannot read properties of null (reading 'meta')" - a TypeError naming
 * a channel, for a copy pass that did not finish.
 *
 * Compiled separately from the block above because inputs.ts pulls in the
 * whole server module graph.
 */
(async () => {
  const assertNeed = require('assert');
  const path = require('path');
  const cp = require('child_process');
  const web = path.join(__dirname, '..', 'web');

  process.env.MOCK_CLAUDE = '1';
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test';
  // tsc takes --paths only from a config file, and inputs.ts imports through
  // both the @/ and @core/ aliases, so the config is written rather than
  // passed as flags.
  const cfg = path.join(web, '.test-inputs.tsconfig.json');
  require('fs').writeFileSync(cfg, JSON.stringify({
    compilerOptions: {
      outDir: '.test-build', module: 'commonjs', target: 'es2022',
      skipLibCheck: true, esModuleInterop: true, moduleResolution: 'node',
      baseUrl: '.', paths: { '@core/*': ['core/*'], '@/*': ['./*'] },
    },
    files: ['server/inputs.ts'],
  }));
  cp.execSync('npx tsc -p .test-inputs.tsconfig.json', { cwd: web, stdio: 'pipe' });

  // tsc rewrites types, not require paths, so @core/ survives into the
  // emitted JS. inputs.ts uses three of them and they all live in web/core.
  const Module = require('module');
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    const req = request.startsWith('@core/') ? path.join(web, 'core', request.slice('@core/'.length)) : request;
    return resolve.call(this, req, ...rest);
  };

  const dbm = require('../web/.test-build/db.js');
  const { buildInputs } = require('../web/.test-build/inputs.js');
  const ws = 'owner';

  const client = await dbm.createClient(ws, { name: 'Null Output Co', website: 'https://example.com', brandKit: {}, voice: {} });
  const campaign = await dbm.createCampaign(ws, client.clientId, {
    brief: { productName: 'P', productDescription: 'd', targetAudience: 'a', objective: 'trial_signups', channels: ['linkedin', 'email'], languages: ['en'] },
  });

  const usage = { input: 0, output: 0, ms: 0, costEur: 0 };
  const version = (agent, output, complete = true) => dbm.addVersion(ws, client.clientId, campaign.campaignId, {
    agent, output, inputsHash: 'h', promptVersion: null, model: 'test', usage, complete,
  });
  await version('brand-analyst', { company_summary: 's', proof_points: [], glossary: [] });
  await version('strategist', { angles: [], lead_angle: 'x', key_messages: [] });
  // A null current output, which is what campaigns written before addVersion
  // stopped moving the pointer for a failed pass still hold. complete is left
  // undefined here on purpose: that is the shape of those older records, and
  // it is the only way the pointer still lands on a null output.
  await dbm.addVersion(ws, client.clientId, campaign.campaignId, {
    agent: 'copywriter', output: null, inputsHash: 'h', promptVersion: null, model: 'test', usage,
  });
  const cur = await dbm.currentOutputs(ws, client.clientId, campaign.campaignId);
  assertNeed.equal(cur.copywriter.output, null, 'the fixture really does have a null current output');

  // A failed re-run must not replace a good output. This happened on
  // production: a copy pass succeeded, a second run of it submitted nothing,
  // and the null took over as current. The good version was still in history
  // and no route reads history back, so the work was unreachable.
  const clientB = await dbm.createClient(ws, { name: 'Clobber Co', website: 'https://example.com', brandKit: {}, voice: {} });
  const campB = await dbm.createCampaign(ws, clientB.clientId, {
    brief: { productName: 'P', productDescription: 'd', targetAudience: 'a', objective: 'trial_signups', channels: ['linkedin'], languages: ['en'] },
  });
  const good = await dbm.addVersion(ws, clientB.clientId, campB.campaignId, {
    agent: 'copywriter', output: { meta: ['kept'] }, inputsHash: 'h', promptVersion: null, model: 'test', usage, complete: true,
  });
  await dbm.addVersion(ws, clientB.clientId, campB.campaignId, {
    agent: 'copywriter', output: null, inputsHash: 'h', promptVersion: null, model: 'test', usage,
    complete: false, problems: ['no output submitted'],
  });
  const currentB = await dbm.currentOutputs(ws, clientB.clientId, campB.campaignId);
  assertNeed.equal(currentB.copywriter.versionId, good.versionId, 'a failed re-run must not become the current output');
  assertNeed.deepEqual(currentB.copywriter.output, { meta: ['kept'] }, 'the good output survives a failed re-run');

  let err = null;
  try {
    await buildInputs(ws, client.clientId, campaign.campaignId, 'social-planner');
  } catch (e) { err = e; }

  assertNeed.ok(err, 'a null dependency output must be refused, not passed on');
  assertNeed.equal(err.status, 409, 'refused as a dependency problem, not a 500');
  assertNeed.ok(
    /has not been generated yet/.test(err.message),
    `the message should name the missing pass, got: ${err.message}`
  );
  console.log('null-dependency tests: ok');
})().catch((e) => { console.error('null-dependency tests FAILED', e); process.exit(1); });
