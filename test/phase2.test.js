/**
 * Phase 2: the workspace. Editing, regeneration, claims, approvals, gating.
 * Run: node test/phase2.test.js
 */
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const { startNext } = require('./helpers/next-server');

const env = { ...process.env, MOCK_CLAUDE: '1', MOCK_AUTH: '1', ALLOWED_EMAIL: 'test@example.com' };
const server = startNext(3225, env);
const site = spawn('python3', ['-m', 'http.server', '8099'], { cwd: path.join(__dirname, 'fixture-site'), stdio: 'ignore' });
const stop = () => { server.kill(); site.kill(); };
process.on('exit', stop);

const base = 'http://localhost:3225';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (p, opts = {}) => { const r = await fetch(base + p, opts); return { status: r.status, data: await r.json().catch(() => ({})) }; };
const post = (p, b) => api(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const patch = (p, b) => api(p, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

(async () => {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch {} await wait(500); }

  const { data: created } = await post('/api/clients', { url: 'http://localhost:8099' });
  const clientId = created.clientId;
  const { data: camp } = await post(`/api/clients/${clientId}/campaigns`, { brief: {
    productName: 'Ledgerline', productDescription: 'Reconciliation', targetAudience: 'Finance leads',
    objective: 'trial_signups', tone: 'direct', languages: ['en', 'pt'], webResearch: true } });
  const cid = camp.campaignId;
  const run = (agent) => post(`/api/clients/${clientId}/campaigns/${cid}/run/${agent}`, {});

  // research proposes claims, nothing is auto-approved
  await run('brand-analyst');
  let claims = (await api(`/api/clients/${clientId}/claims`)).data.claims;
  assert.ok(claims.length >= 2, 'research proposed claims: ' + claims.length);
  assert.ok(claims.every((c) => c.status === 'proposed'), 'nothing is auto-approved');
  assert.ok(claims.every((c) => c.source), 'every claim carries its source');
  console.log('  claims proposed:', claims.length, '| all proposed, none approved');

  // re-running research does not duplicate them
  await run('brand-analyst');
  const after = (await api(`/api/clients/${clientId}/claims`)).data.claims;
  assert.equal(after.length, claims.length, 'claims deduplicate on re-run');

  for (const a of ['customer-researcher', 'strategist', 'copywriter']) await run(a);

  // assets exploded, one per editable field, with flags computed
  const { data: assetData } = await api(`/api/clients/${clientId}/campaigns/${cid}/assets?language=en`);
  assert.ok(assetData.assets.length >= 25, 'assets exploded: ' + assetData.assets.length);
  const overLimit = assetData.assets.find((a) => a.flags?.some((f) => f.rule === 'limit' && f.severity === 'violation'));
  assert.ok(overLimit, 'the deliberately over-limit fixture headline is flagged');
  console.log('  assets exploded:', assetData.assets.length, '| flagged:', overLimit.assetId, overLimit.flags[0].detail);

  // approving a flagged asset is refused
  const refused = await patch(`/api/clients/${clientId}/campaigns/${cid}/assets/${encodeURIComponent(overLimit.assetId)}`, { status: 'approved' });
  assert.equal(refused.status, 409, 'approval refused while a violation stands');
  console.log('  approval refused:', refused.data.error.slice(0, 60));

  // editing it clears the flag and allows approval
  const fixed = await patch(`/api/clients/${clientId}/campaigns/${cid}/assets/${encodeURIComponent(overLimit.assetId)}`, { text: 'Stripe & Adyen Matching' });
  assert.equal(fixed.status, 200);
  assert.equal(fixed.data.asset.flags.filter((f) => f.severity === 'violation').length, 0, 'flag cleared');
  assert.ok(fixed.data.asset.editedAt, 'edit recorded');
  const approved = await patch(`/api/clients/${clientId}/campaigns/${cid}/assets/${encodeURIComponent(overLimit.assetId)}`, { status: 'approved' });
  assert.equal(approved.data.asset.status, 'approved');

  // editing an approved asset returns it to draft
  const reEdited = await patch(`/api/clients/${clientId}/campaigns/${cid}/assets/${encodeURIComponent(overLimit.assetId)}`, { text: 'Stripe and Adyen Matching' });
  assert.equal(reEdited.data.asset.status, 'draft', 'an edit withdraws approval');
  console.log('  edit → approve → edit returns to draft');

  // export is gated on approval
  const gated = await api(`/api/clients/${clientId}/campaigns/${cid}/package`);
  assert.equal(gated.status, 409, 'package refuses while assets are unapproved');
  assert.ok(gated.data.unapproved.length > 0);
  const forced = await api(`/api/clients/${clientId}/campaigns/${cid}/package?force=1`);
  assert.equal(forced.status, 200);
  assert.equal(forced.data.forced, true, 'a forced package says so');
  console.log('  export gate:', gated.data.error);

  // regenerate one field
  const target = assetData.assets.find((a) => a.channel === 'meta' && a.field === 'headline');
  const regen = await post(`/api/clients/${clientId}/campaigns/${cid}/regenerate`, { scope: 'asset', target: target.assetId, constraint: 'shorter' });
  assert.equal(regen.status, 200, JSON.stringify(regen.data));
  assert.ok(regen.data.asset.text, 'field regenerated');
  assert.equal(regen.data.asset.status, 'draft', 'a regenerated field is a draft');
  console.log('  field regenerated:', JSON.stringify(regen.data.asset.text));

  // an edit survives a writer re-run, and is marked stale instead of overwritten
  const edited = assetData.assets.find((a) => a.channel === 'linkedin' && a.field === 'headline');
  await patch(`/api/clients/${clientId}/campaigns/${cid}/assets/${encodeURIComponent(edited.assetId)}`, { text: 'My own headline' });
  await run('copywriter');
  const afterRerun = (await api(`/api/clients/${clientId}/campaigns/${cid}/assets?language=en`)).data.assets.find((a) => a.assetId === edited.assetId);
  assert.equal(afterRerun.text, 'My own headline', 'a re-run does not destroy an edit');
  assert.ok(afterRerun.generatedText !== 'My own headline', 'the new generated text is kept alongside');
  console.log('  edit survives a re-run, generated text kept as', JSON.stringify(afterRerun.generatedText.slice(0, 30)));

  // Portuguese is adapted from the edited English
  await run('localiser');
  const pt = (await api(`/api/clients/${clientId}/campaigns/${cid}/assets?language=pt`)).data.assets;
  assert.ok(pt.length >= 25, 'pt assets exploded: ' + pt.length);
  console.log('  pt assets:', pt.length);

  // the editor's verdict comes back with a writer run
  const withReview = await run('copywriter');
  assert.ok(withReview.data.review, 'a writer run carries the editor verdict');
  assert.ok(['pass', 'revise'].includes(withReview.data.review.verdict));
  console.log('  editor verdict:', withReview.data.review.verdict, '|', (withReview.data.review.must_fix || []).length, 'must-fix');

  // approving a claim turns claim flags into violations
  const claim = after[0];
  await patch(`/api/clients/${clientId}/claims/${claim.claimId}`, { status: 'approved' });
  const nowApproved = (await api(`/api/clients/${clientId}/claims`)).data.claims.find((c) => c.claimId === claim.claimId);
  assert.equal(nowApproved.status, 'approved');
  assert.ok(nowApproved.approvedAt, 'approval timestamped');

  // expiry is honoured on read
  await patch(`/api/clients/${clientId}/claims/${claim.claimId}`, { expiresAt: '2020-01-01T00:00:00.000Z' });
  const expired = (await api(`/api/clients/${clientId}/claims`)).data.claims.find((c) => c.claimId === claim.claimId);
  assert.equal(expired.status, 'expired', 'an expired claim reads as expired');
  console.log('  claim approve → expire ok');

  console.log('phase 2 tests: ok');
  stop(); process.exit(0);
})().catch((e) => { console.error('phase 2 tests FAILED', e); stop(); process.exit(1); });
