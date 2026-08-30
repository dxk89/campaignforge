/**
 * Palette and font extraction.
 *
 * These are pure functions over CSS text, so they need no server and no
 * network. The cases are the ones that were wrong in production against a
 * real site rather than invented shapes: a framework bundle whose own palette
 * outnumbers the brand's, and an icon font declared as a font family.
 */
const assert = require('assert');
const { extractPalette, extractFonts } = require('../web/core/scraper.js');

(async () => {
  // A hand-written stylesheet: the brand's colours are the only colours.
  const plain = '.btn{background:#0F5C6B}.accent{color:#E4570F}body{color:#14181F;background:#fff}';
  const simple = extractPalette(plain);
  assert.equal(simple.accents[0], '#0f5c6b', 'a plain stylesheet ranks its own colours first');
  assert.equal(simple.uncertain, false, 'nothing boilerplate about a hand-written palette');

  // A framework bundle. Bootstrap's link blue is declared far more often than
  // the brand's yellow, and Material's swatches are declared once each in a
  // block - the exact shape that made bne IntelliNews report Bootstrap's
  // alert colours as its brand.
  const material = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
    '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b',
    '#ffc107', '#ff9800', '#ff5722', '#795548', '#9e9e9e', '#607d8b'];
  const dump = material
    .map((c, i) => `.md-${i}{color:${c}}.md-${i}-bg{background:${c}}.md-${i}-br{border-color:${c}}`)
    .join('');
  // The greys any real bundle is padded with. They are not accents, but they
  // count towards the bundle being large enough for a plateau to mean
  // something.
  const filler = Array.from({ length: 30 }, (_, i) => {
    const v = (i * 8 + 10).toString(16).padStart(2, '0');
    return `.f${i}{color:#${v}${v}${v}}`;
  }).join('');
  const bundle =
    '.a{color:#337ab7}'.repeat(20) +          // Bootstrap link blue, everywhere
    '.alert-danger{color:#a94442}'.repeat(9) + // and its alert colours
    dump + filler +
    '.masthead{background:#f4d010}.byline{color:#9e1d0a}'; // the actual brand

  const kit = extractPalette(bundle);
  assert.equal(kit.accents[0], '#f4d010', 'the brand colour outranks the framework it is buried in');
  assert.ok(kit.accents.includes('#9e1d0a'), 'and so does the second brand colour');
  assert.ok(
    kit.accents.indexOf('#337ab7') === -1 || kit.accents.indexOf('#337ab7') > 1,
    'Bootstrap blue is ranked last, not first, despite being the most frequent'
  );
  assert.equal(kit.uncertain, false, 'a real brand colour was found, so this is not a guess');

  // Nothing but framework. Saying so beats reporting Bootstrap as a brand.
  const only = '.a{color:#337ab7}'.repeat(20) + '.b{color:#a94442}'.repeat(9);
  assert.equal(extractPalette(only).uncertain, true, 'an all-boilerplate palette is declared uncertain');

  // rgb() in every shape. Traced SVGs emit percentages, which used to be
  // skipped entirely by a pattern that only allowed commas and digits.
  const rgb = extractPalette('.a{color:rgb(158,29,10)}.b{color:rgb(0% ,0%, 0%)}.c{color:rgb(244 208 16)}');
  assert.ok(rgb.accents.includes('#9e1d0a'), 'comma rgb is read');
  assert.ok(rgb.accents.includes('#f4d010'), 'space-separated rgb is read');
  assert.equal(rgb.dark, '#000000', 'percentage rgb is read');

  // Icon sets are declared as font families but are not typefaces.
  const fonts = extractFonts(
    'body{font-family:"Open Sans",sans-serif}.i{font-family:FontAwesome}.j{font-family:"Material Icons"}'
  );
  assert.deepEqual(fonts, ['Open Sans'], 'icon fonts are not reported as brand typefaces');

  console.log('scraper tests: ok');
})().catch((e) => { console.error('scraper tests FAILED', e); process.exit(1); });

/**
 * Social channel selection.
 *
 * The brief now chooses which platforms the month is planned for, and three
 * things have to follow that choice or the campaign is wrong in a way nobody
 * notices until it is scheduled: the cadence and post count, the limits and
 * audience note the planner is given, and what the gate accepts back.
 */
(async () => {
  const assertCh = require('assert');
  const limits = require('../web/core/limits');
  const social = require('../web/core/prompts/social');
  const planner = require('../web/core/agents/roster/social-planner');

  // Unchanged for a campaign that does not choose: the original three.
  const base = limits.socialPlan();
  assertCh.deepEqual(base.channels, ['linkedin', 'x', 'instagram'], 'the default is the original three');
  assertCh.equal(base.total, 32, 'and the original 32 posts');
  assertCh.deepEqual(limits.socialChannelsFor([]).length, 3, 'an empty choice falls back rather than planning nothing');
  assertCh.deepEqual(limits.socialChannelsFor(['nonsense']).length, 3, 'and so does an unknown channel');

  // The count follows the choice rather than staying at 32.
  const two = limits.socialPlan(['linkedin', 'tiktok']);
  assertCh.equal(two.total, 20, 'LinkedIn 3 a week plus TikTok 2 a week over four weeks is 20');

  // The prompt describes the chosen channels and nothing else.
  const role = planner.role({ brief: { socialChannels: ['linkedin', 'tiktok'] } });
  assertCh.ok(/across 2 channels: linkedin, tiktok/.test(role), 'the prompt names the chosen channels');
  assertCh.ok(/Exactly 20 posts/.test(role), 'and the count it asked for');
  assertCh.ok(/TikTok: max 2,200/.test(role), 'with that platform\'s real limit');
  assertCh.ok(!/X posts must be complete thoughts/.test(role), 'and no rule for a channel it is not using');
  assertCh.ok(/hook for one/.test(role), 'each channel says who is reading, not just how long the text may be');

  // Every supported channel is offered to the model; the brief is enforced on
  // the way back, so a stray channel is a fixable problem rather than a
  // schema rejection with no explanation.
  const chans = planner.schema.properties.posts.items.properties.channel.enum;
  assertCh.ok(chans.includes('tiktok') && chans.includes('pinterest'), 'the schema offers the full catalogue');
  const problems = planner.validate(
    { posts: [{ day: 1, channel: 'x', text: 'hello' }] },
    { brief: { socialChannels: ['linkedin'] }, rules: {} }
  );
  assertCh.ok(problems.some((p) => /not running: x/.test(p)), 'a post on an unchosen channel is refused');

  // Channels whose post is carried by the image still need one.
  const noPin = planner.validate(
    { posts: [{ day: 1, channel: 'pinterest', text: 'hello' }] },
    { brief: { socialChannels: ['pinterest'] }, rules: {} }
  );
  assertCh.ok(noPin.some((p) => /Pinterest post\(s\) have no graphic/.test(p)), 'a Pinterest post without a graphic is refused');

  // Every channel offered in the UI must exist in the catalogue, or a person
  // can tick something the planner cannot plan for.
  const fs = require('fs');
  const path = require('path');
  const ui = fs.readFileSync(path.join(__dirname, '..', 'web', 'app', 'clients', '[id]', 'campaigns', '[cid]', 'workbench.tsx'), 'utf8');
  // Only the social list. The file also declares the ad channels, and meta
  // and google are not social channels.
  const block = ui.split('SOCIAL_CHANNEL_OPTIONS')[1].split('];')[0];
  const offered = [...block.matchAll(/\['([a-z]+)', '[^']+'\]/g)].map((m) => m[1]);
  for (const c of offered) {
    assertCh.ok(limits.SOCIAL_CHANNELS[c], `the brief offers "${c}" but core/limits.js has no such channel`);
  }
  assertCh.ok(offered.length >= 6, `expected the full list in the UI, saw ${offered.length}`);

  console.log(`social channel tests: ok (${offered.length} channels)`);
})().catch((e) => { console.error('social channel tests FAILED', e); process.exit(1); });

/**
 * Ad channels, the deadline, and the send-to-platform links.
 *
 * The copy pass timed out on production at exactly 300,178ms, the platform's
 * function ceiling: it was killed mid-run, so nothing was written and the
 * spend was not even recorded. Turns were never the binding constraint. Time
 * is, and the two answers are to stop before the platform does, and to write
 * fewer assets when the campaign does not need them.
 */
(async () => {
  const a = require('assert');
  const fs = require('fs');
  const path = require('path');
  const limits = require('../web/core/limits');
  const cw = require('../web/core/agents/roster/copywriter');
  const assets = require('../web/core/prompts/assets');

  // Unchanged by default: a campaign that does not choose still gets all four.
  a.deepEqual(limits.adChannelsFor(), ['meta', 'linkedin', 'google', 'email'], 'default is every channel');
  a.deepEqual(limits.adChannelsFor([]), ['meta', 'linkedin', 'google', 'email'], 'an empty choice is not no channels');

  // The schema stops demanding what the campaign is not running. Without this
  // the model must return all four whatever the prompt says, because the
  // submit tool rejects the call.
  a.equal(typeof cw.schema, 'function', 'the output shape depends on the brief');
  a.deepEqual(cw.schema({}).required, ['meta', 'linkedin', 'google', 'email']);
  a.deepEqual(cw.schema({ brief: { adChannels: ['linkedin', 'email'] } }).required, ['linkedin', 'email'],
    'only the chosen channels are required');

  // And the prompt asks for less work, which is where the time is saved.
  const two = assets.systemPrompt({ channels: ['linkedin', 'email'] });
  a.ok(/Counts: 3 linkedin variants, 3 emails\./.test(two), 'counts follow the choice');
  a.ok(/runs LinkedIn and Email only/.test(two), 'and it is told not to write the rest');
  a.ok(!/8 google headlines/.test(two.match(/Counts:[^\n]*/)[0]), 'no counts for an unused channel');

  // A missing chosen channel is still a problem; a missing unchosen one is not.
  const missing = cw.validate({ linkedin: [] }, { brief: { adChannels: ['linkedin', 'email'] }, rules: {} });
  a.ok(missing.some((p) => /missing email/.test(p)), 'a channel the campaign runs must be written');
  a.ok(!missing.some((p) => /missing meta/.test(p)), 'one it does not run is not missing');

  // The loop must stop before the platform kills it.
  const runtime = fs.readFileSync(path.join(__dirname, '..', 'web', 'core', 'agents', 'runtime.js'), 'utf8');
  a.ok(/WALL_CLOCK_MS/.test(runtime), 'the runtime has a wall-clock deadline');
  const deadline = Number((runtime.match(/AGENT_DEADLINE_MS \|\| (\d+)/) || [])[1]);
  const route = fs.readFileSync(path.join(__dirname, '..', 'web', 'app', 'api', 'clients', '[id]', 'campaigns', '[cid]', 'run', '[agent]', 'route.ts'), 'utf8');
  const maxDuration = Number((route.match(/maxDuration = (\d+)/) || [])[1]) * 1000;
  a.ok(deadline > 0 && maxDuration > 0, 'both limits are readable');
  a.ok(deadline < maxDuration, `the agent deadline (${deadline}ms) must be under the function limit (${maxDuration}ms)`);
  a.ok(maxDuration - deadline >= 30000, 'leave at least 30s to finish the turn in flight and write the version');

  // The send links open a composer; they never post on someone's behalf.
  const panels = fs.readFileSync(path.join(__dirname, '..', 'web', 'components', 'panels.tsx'), 'utf8');
  a.ok(/intent\/post\?text=/.test(panels), 'X opens its composer with the text');
  a.ok(/shareActive=true/.test(panels), 'LinkedIn opens its composer with the text');
  a.ok(!/access_token|Bearer |\/v\d+\/me\/feed/.test(panels), 'nothing here posts through an API');

  console.log('ad channel and deadline tests: ok');
})().catch((e) => { console.error('ad channel and deadline tests FAILED', e); process.exit(1); });
