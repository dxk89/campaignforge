/** Export builders are pure functions; test them directly. */
const assert = require('assert');
const path = require('path');
require('child_process').execSync(
  'npx tsc components/exports.ts --outDir .test-build --module commonjs --target es2022 --skipLibCheck --esModuleInterop --lib es2022,dom',
  { cwd: path.join(__dirname, '..', 'web'), stdio: 'pipe' }
);
const ex = require('../web/.test-build/exports.js');
const { FIXTURES } = require('../lib/mock');
const { trackingPlan } = require('../lib/utm');

const brief = { productName: 'Ledgerline', objective: 'trial_signups' };
const tracking = trackingPlan(brief, FIXTURES.assets, FIXTURES.localise, 'https://ledgerline.example/trial');

const rows = ex.flattenAssets(FIXTURES.assets, 'en', tracking);
assert.equal(rows.length, 9 + 6 + 8 + 4 + 9 + 1, 'a row per field: ' + rows.length);
assert.ok(rows.every((r) => r.length === 7), 'seven columns');
const metaHeadline = rows.find((r) => r[0] === 'meta' && r[3] === 'headline');
assert.equal(metaHeadline[5], String(metaHeadline[4]).length, 'char count matches the text');
assert.match(String(metaHeadline[6]), /utm_campaign=ledgerline/, 'tracking url attached');

const pt = ex.flattenAssets(FIXTURES.localise, 'pt', tracking);
assert.ok(pt.every((r) => r[2] === 'pt'), 'language column');
assert.match(String(pt.find((r) => r[0] === 'meta')[6]), /-pt$/, 'pt tracking url');

const social = ex.socialRows(FIXTURES.social);
assert.equal(social.length, 33, 'header plus 32 posts');
assert.equal(social[0][0], 'day');
const xPost = social.slice(1).find((r) => r[2] === 'x');
assert.ok(xPost[7] > 0 && xPost[7] <= 280, 'x char count includes hashtags and fits');

// csv escaping
const csv = ex.toCsv([['a', 'has "quotes"'], ['b', 'has,comma'], ['c', 'has\nnewline']]);
assert.ok(csv.includes('"has ""quotes"""'), 'quotes doubled');
assert.ok(csv.includes('"has,comma"'), 'commas quoted');
assert.ok(csv.startsWith('\ufeff'), 'BOM for Excel');

assert.equal(ex.clientSlug('Ledgerline Ltd.'), 'ledgerline-ltd');
console.log('export tests: ok');
