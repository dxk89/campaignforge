/** Runtime tests with a scripted model. No spend. Run: node test/runtime.test.js */
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test';
delete process.env.MOCK_CLAUDE;
const assert = require('assert');
const claude = require('../lib/claude');
const { run } = require('../lib/agents/runtime');
const strategist = require('../lib/agents/roster/strategist');
const copywriter = require('../lib/agents/roster/copywriter');
const { FIXTURES } = require('../lib/mock');

let script = [];
claude.client.messages.create = async () => ({ content: script.shift(), stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 50 } });
const submit = (input, id) => ({ type: 'tool_use', id, name: 'submit', input });
const call = (name, input, id) => ({ type: 'tool_use', id, name, input });
const brief = { productName: 'Ledgerline', objective: 'trial_signups' };

(async () => {
  // self-repair: bad lead_angle, then fixed
  script = [[submit({ ...FIXTURES.strategy, lead_angle: 'Nope' }, 'a')], [submit(FIXTURES.strategy, 'b')]];
  let r = await run(strategist, strategist.packet({ brief, context: null }));
  assert.equal(r.complete, true); assert.equal(r.usage.calls, 2); assert.ok(r.trace[0].tools[0].problems.length);

  // tool round-trip then clean submit
  const clean = { ...FIXTURES.assets, google: { ...FIXTURES.assets.google, headlines: FIXTURES.assets.google.headlines.map((h, i) => (i === 6 ? 'Stripe & Adyen Matching' : h)) } };
  script = [[call('check_limits', { assets: FIXTURES.assets }, 'c')], [submit(clean, 'd')]];
  r = await run(copywriter, copywriter.packet({ brief, strategy: FIXTURES.strategy, context: FIXTURES.research, memory: {} }));
  assert.equal(r.complete, true); assert.equal(r.trace[0].tools[0].name, 'check_limits');

  // hard gate: known-bad set refused until budget
  script = Array.from({ length: 5 }, (_, i) => [submit(FIXTURES.assets, 'g' + i)]);
  r = await run(copywriter, copywriter.packet({ brief, strategy: FIXTURES.strategy, context: FIXTURES.research, memory: {} }));
  assert.equal(r.complete, false); assert.equal(r.usage.calls, 5); assert.match(r.problems[0], /google headline 7/);

  // nudge on prose
  script = [[{ type: 'text', text: 'thinking...' }], [submit(FIXTURES.strategy, 'n')]];
  r = await run(strategist, strategist.packet({ brief, context: null }));
  assert.equal(r.complete, true); assert.equal(r.trace[0].note, 'no tool call; nudged');

  console.log('runtime tests: ok');
})().catch((e) => { console.error('runtime tests FAILED', e); process.exit(1); });
