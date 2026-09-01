/**
 * Turning a planned month into a schedule.
 *
 * The social pass produces day numbers because a plan is written before
 * anyone decides when it starts. Everything a scheduler needs, and everything
 * an API push would need, comes from this conversion, so it is worth testing
 * on its own rather than through a CSV.
 */
const assert = require('assert');
const { scheduleRows, hootsuiteCsv, scheduleCsv, DEFAULT_TIMES } = require('../web/core/schedule');

const cal = (posts) => ({ posts });

(async () => {
  // A start date is required. Guessing one would silently schedule a month.
  assert.throws(() => scheduleRows(cal([]), {}), /start date/i, 'no start date is refused');
  assert.throws(() => scheduleRows(cal([]), { startDate: 'next monday' }), /start date/i,
    'and so is a date it cannot parse');

  // Day 1 lands on the start date, at the channel's time.
  // 2026-09-07 is a Monday.
  const one = scheduleRows(cal([{ day: 1, channel: 'linkedin', text: 'Hello' }]), { startDate: '2026-09-07' });
  assert.equal(one.length, 1);
  assert.equal(one[0].when.getFullYear(), 2026);
  assert.equal(one[0].when.getMonth(), 8, 'September');
  assert.equal(one[0].when.getDate(), 7, 'day 1 is the start date');
  assert.equal(one[0].when.getHours(), 8, 'LinkedIn posts at 08:30 by default');
  assert.equal(one[0].when.getMinutes(), 30);
  assert.equal(one[0].moved, false);

  // Day 7 from a Monday start is the following Sunday, which is moved.
  const weekend = scheduleRows(cal([{ day: 7, channel: 'linkedin', text: 'Hi' }]), { startDate: '2026-09-07' });
  assert.equal(weekend[0].when.getDay(), 1, 'a Sunday post moves to Monday');
  assert.equal(weekend[0].moved, true, 'and says it was moved');

  // Unless asked not to. Silently moving someone's plan without a way to stop
  // it would be worse than not moving it.
  const kept = scheduleRows(cal([{ day: 7, channel: 'linkedin', text: 'Hi' }]),
    { startDate: '2026-09-07', skipWeekends: false });
  assert.equal(kept[0].when.getDay(), 0, 'the plan is kept exactly when asked');
  assert.equal(kept[0].moved, false);

  // Two posts at the same minute are separated. Most importers reject the
  // collision, and a reader would see it as a double post.
  const clash = scheduleRows(
    cal([{ day: 1, channel: 'linkedin', text: 'A' }, { day: 1, channel: 'linkedin', text: 'B' }]),
    { startDate: '2026-09-07' }
  );
  assert.notEqual(clash[0].when.getTime(), clash[1].when.getTime(), 'no two posts share a minute');
  assert.equal((clash[1].when - clash[0].when) / 60000, 15, 'separated by fifteen minutes');
  // Schedulers require five-minute increments, so the stagger has to respect them.
  assert.ok(clash.every((r) => r.when.getMinutes() % 5 === 0), 'every time is on a five-minute increment');

  // Times can be overridden, because these defaults are a starting point.
  const custom = scheduleRows(cal([{ day: 1, channel: 'x', text: 'Hi' }]),
    { startDate: '2026-09-07', times: { x: '07:05' } });
  assert.equal(custom[0].when.getHours(), 7);
  assert.equal(custom[0].when.getMinutes(), 5);
  assert.equal(DEFAULT_TIMES.x, '12:00', 'and the default is unchanged by the override');

  // Rows come back in the order they will be posted, not the order planned.
  const ordered = scheduleRows(
    cal([{ day: 3, channel: 'x', text: 'later' }, { day: 1, channel: 'x', text: 'sooner' }]),
    { startDate: '2026-09-07' }
  );
  assert.deepEqual(ordered.map((r) => r.text), ['sooner', 'later'], 'sorted by when they go out');

  // Hootsuite: three columns, no header, date first, and the hashtags are
  // part of the message rather than a column of their own.
  const rows = scheduleRows(
    cal([{ day: 1, channel: 'linkedin', text: 'Close the month faster.', hashtags: ['finance'], link: 'https://example.com' }]),
    { startDate: '2026-09-07' }
  );
  const hoot = hootsuiteCsv(rows);
  assert.ok(!/^when|^date/i.test(hoot), 'no header row');
  assert.ok(hoot.startsWith('09/07/2026 08:30,'), `date first in MM/DD/YYYY, got: ${hoot.slice(0, 40)}`);
  assert.ok(/#finance/.test(hoot), 'hashtags travel inside the message');
  assert.ok(/https:\/\/example\.com/.test(hoot), 'and the link is its own column');

  // A message containing a comma must not break the row.
  const comma = hootsuiteCsv(scheduleRows(cal([{ day: 1, channel: 'x', text: 'One, two, three.' }]), { startDate: '2026-09-07' }));
  assert.ok(/"One, two, three\."/.test(comma), 'commas are quoted');

  // The readable export keeps a header and ISO dates.
  const generic = scheduleCsv(rows);
  assert.ok(generic.split('\n')[0].startsWith('when,channel,day'), 'the readable one has a header');
  assert.ok(/2026-09-07 08:30/.test(generic), 'and ISO dates');

  console.log('schedule tests: ok');
})().catch((e) => { console.error('schedule tests FAILED', e); process.exit(1); });

/**
 * The integration status list.
 *
 * "Coming soon" with no reason is the sort of thing that is still there two
 * years later. Anything not ready has to name what is in the way, so the
 * section reads as a record of decisions rather than a promise.
 */
(async () => {
  const a = require('assert');
  const fs = require('fs');
  const path = require('path');
  const { INTEGRATIONS } = require('../web/core/integrations');

  a.ok(INTEGRATIONS.length >= 4, 'the destinations worth naming are named');

  for (const i of INTEGRATIONS) {
    a.ok(i.name && i.what, `${i.name}: says what it is and what it would do`);
    a.ok(['ready', 'blocked'].includes(i.status), `${i.name}: has a known status`);
    a.ok(i.detail && i.detail.length > 40, `${i.name}: explains itself`);
    if (i.status === 'blocked') {
      a.ok(i.blocker && i.blocker.length > 10,
        `${i.name}: is not available and must say what blocks it, not just that it is coming`);
    } else {
      a.ok(!i.blocker, `${i.name}: is available, so it should not carry a blocker`);
    }
  }

  // The two ready ones must be things that actually exist in the code, or the
  // list is advertising rather than reporting.
  const ready = INTEGRATIONS.filter((i) => i.status === 'ready').map((i) => i.name);
  a.ok(ready.includes('Scheduler import'), 'the scheduler export is listed as available');
  a.ok(fs.existsSync(path.join(__dirname, '..', 'web', 'core', 'schedule.js')),
    'and the module behind it exists');
  const panels = fs.readFileSync(path.join(__dirname, '..', 'web', 'components', 'panels.tsx'), 'utf8');
  a.ok(/socialIntent/.test(panels), 'the composer links are listed as available and exist');

  console.log('integration status tests: ok');
})().catch((e) => { console.error('integration status tests FAILED', e); process.exit(1); });
