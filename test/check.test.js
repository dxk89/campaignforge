/**
 * checkCopy: every deterministic verdict this codebase has, over one string.
 *
 * The quiet case matters as much as the loud one. A checker that fires on
 * good copy gets switched off, so real headlines must come back clean.
 */
const assert = require('assert');
const { checkCopy } = require('../web/core/check');

(async () => {
  // Clean copy, no channel: says where it fits and reports nothing else.
  const clean = checkCopy('Close the month four days faster.');
  assert.equal(clean.verdict, 'clean', 'good copy is clean');
  assert.equal(clean.chars, 33);
  assert.deepEqual(clean.flags, [], 'no flags on good copy');
  assert.ok(clean.fits.some((f) => f.channel === 'linkedin' && f.field === 'headline'),
    'a 33 character line fits a LinkedIn headline');
  assert.ok(clean.over.some((f) => f.channel === 'google' && f.field === 'headline'),
    'and is too long for a Google headline');

  // With a channel, only that channel is reported.
  const one = checkCopy('Close the month four days faster.', { channel: 'google' });
  assert.equal(one.channel, 'google');
  assert.ok([...one.fits, ...one.over].every((f) => f.channel === 'google'),
    'a chosen channel reports only itself');

  // Social channels are included, not just ad channels.
  assert.ok(checkCopy('hello').fits.some((f) => f.channel === 'x'),
    'social channels are covered too');

  // The humaniser still applies.
  const slop = checkCopy('A robust, seamless platform.');
  assert.equal(slop.verdict, 'violations');
  assert.ok(slop.flags.some((f) => f.rule === 'ai-word' && /robust/.test(f.detail)));

  // Every flag explains itself. This is the difference between a linter and
  // a tool that teaches its own standard.
  assert.ok(slop.flags.every((f) => typeof f.why === 'string' && f.why.length > 10),
    'every flag says why the rule exists');

  // Without client rules it says so, rather than implying a full check.
  assert.equal(checkCopy('hello').ranWithoutClientRules, true);
  assert.equal(checkCopy('hello', { rules: { avoid: ['synergy'] } }).ranWithoutClientRules, false);

  // And with them, the client's own rules apply.
  const avoided = checkCopy('Real synergy here.', { rules: { avoid: ['synergy'] } });
  assert.ok(avoided.flags.some((f) => f.rule === 'avoid'), 'client avoid terms are checked');

  // Over a limit is only a violation when a channel was named. Without one,
  // being too long for Google says nothing about a LinkedIn post.
  assert.equal(checkCopy('Close the month four days faster.').verdict, 'clean',
    'no channel means no length violation');
  assert.equal(checkCopy('Close the month four days faster.', { channel: 'google' }).verdict, 'violations',
    'a named channel it does not fit is a violation');

  console.log('check tests: ok');
})().catch((e) => { console.error('check tests FAILED', e); process.exit(1); });
