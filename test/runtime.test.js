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

  // ---- Critic: gate rules, and ask_critic as a tool round-trip -------------
  // Note: one async block, because every case shares the scripted `script`
  // queue. Two concurrent blocks would interleave their fake responses.
  const critic = require('../lib/agents/roster/critic');
  const orchestrator = require('../lib/agents/orchestrator');
  const packet = critic.packet({ output: FIXTURES.assets, kind: 'assets', brief, context: FIXTURES.research });

  // verdict/must_fix consistency is enforced. The critic's budget is two turns
  // (it reads, it does not iterate), so each bad shape gets its own run.
  const bad = [
    [{ verdict: 'pass', must_fix: [{ path: 'a', problem: 'b', why: 'because it misleads the reader' }], suggestions: [] }, /requires must_fix to be empty/],
    [{ verdict: 'revise', must_fix: [], suggestions: [] }, /requires at least one must_fix/],
    [{ verdict: 'revise', must_fix: [{ path: 'a', problem: 'b', why: 'short' }], suggestions: [] }, /no usable "why"/],
  ];
  for (const [output, expected] of bad) {
    script = [[submit(output, 'x')], [submit({ ...FIXTURES.critic }, 'x2')]];
    r = await run(critic, packet);
    assert.match(r.trace[0].tools[0].problems[0], expected);
    assert.equal(r.complete, true, 'the corrected submit is accepted');
  }

  // a clean pass is accepted first time
  script = [[submit({ verdict: 'pass', must_fix: [], suggestions: ['tighter subject on email 3'] }, 'y1')]];
  r = await run(critic, packet);
  assert.equal(r.complete, true);
  assert.equal(r.output.verdict, 'pass', 'the critic can pass clean work');

  // writers can call ask_critic mid-run and get must_fix back
  script = [
    [call('ask_critic', { output: clean, kind: 'assets' }, 'c1')],
    [submit({ verdict: 'revise', must_fix: [{ path: 'email.emails[1].body', problem: 'unsupported figure', why: 'it reads as a customer result and is not one' }], suggestions: [] }, 'c2')], // the nested critic run
    [submit(clean, 'c3')],
  ];
  r = await run(copywriter, copywriter.packet({ brief, strategy: FIXTURES.strategy, context: FIXTURES.research, memory: {} }));
  assert.equal(r.complete, true, 'copywriter submits after the critic');
  const criticCall = r.trace[0].tools.find((t) => t.name === 'ask_critic');
  assert.ok(criticCall, 'ask_critic appears in the trace');
  assert.match(criticCall.result, /must_fix/, 'the critic verdict came back to the writer');

  // orchestrator.review() is the separate final gate
  script = [[submit({ verdict: 'pass', must_fix: [], suggestions: [] }, 'r1')]];
  const verdict = await orchestrator.review('assets', clean, { brief, context: FIXTURES.research });
  assert.equal(verdict.verdict, 'pass');
  assert.ok(verdict.usage.costEur >= 0, 'review reports its own cost');

  console.log('critic tests: ok');
  console.log('runtime tests: ok');
})().catch((e) => { console.error('runtime tests FAILED', e); process.exit(1); });
