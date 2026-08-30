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

  // ---- orchestrator forces ws onto the packet ------------------------------
  // Regression: ask_critic broke in production because it read packet.ws, but
  // packet is whatever subset of inputs a roster agent's own packet() chose
  // to return, and none of them forwarded ws. The fix moved the guarantee
  // into orchestrator.runAgent itself, which is the one place that builds a
  // packet from inputs, so no roster file can opt out of it by omission.
  // strategist.packet() here deliberately does NOT return ws (confirmed by
  // reading web/core/agents/roster/strategist.js), so if this assertion
  // passes it is because runAgent added ws back in, not because the agent
  // happened to forward it.
  {
    const path = require('path');
    const runtimePath = path.join(__dirname, '..', 'web', 'core', 'agents', 'runtime.js');
    const orchestratorPath = path.join(__dirname, '..', 'web', 'core', 'agents', 'orchestrator.js');
    const runtimeReal = require(runtimePath);
    const originalRun = runtimeReal.run;
    let capturedPacket = null;
    // Mutate the shared exports object in place, then force orchestrator.js
    // to re-evaluate so its `const { run } = require('./runtime')` picks up
    // the patched function rather than the reference it destructured when
    // first required earlier in this file.
    runtimeReal.run = async (agent, packet, opts) => { capturedPacket = packet; return originalRun(agent, packet, opts); };
    delete require.cache[orchestratorPath];
    const orchestratorFresh = require(orchestratorPath);

    assert.ok(!('ws' in strategist.packet({ brief, context: null })), 'sanity check: strategist.packet() alone does not carry ws');

    script = [[submit(FIXTURES.strategy, 'ws1')]];
    await orchestratorFresh.runAgent('strategist', { brief, context: null, ws: 'ws-regression-check' });
    assert.ok(capturedPacket, 'runtime.run was called');
    assert.equal(capturedPacket.ws, 'ws-regression-check', 'orchestrator.runAgent forces ws onto the packet even when the agent\'s own packet() omits it');

    runtimeReal.run = originalRun;
    delete require.cache[orchestratorPath];
  }
  console.log('ws-in-packet regression: ok');

  console.log('runtime tests: ok');
})().catch((e) => { console.error('runtime tests FAILED', e); process.exit(1); });

/**
 * Turn budgets must cover what the role text demands.
 *
 * Every API call is one turn, tool calls included. An agent told to call
 * check_limits, check_compliance and ask_critic before submitting cannot
 * finish in fewer than five: draft and check, fix and re-check, critic, fix
 * and re-check, submit. That was the exact shape of the one copywriter run
 * that succeeded on production. Its budget was six, so a single extra fix
 * round - one compliance flag - exhausted it, and two of three real runs
 * ended with "no output submitted" after spending EUR 0.40 each.
 *
 * maxTurns is a ceiling, not a spend commitment: a pass that finishes in five
 * turns costs five turns whatever the ceiling is. Headroom is therefore free
 * on success and is the difference between a result and nothing on a bad run.
 *
 * This asserts the arithmetic rather than the numbers, so adding a mandated
 * tool to a role fails here instead of in production.
 */
(async () => {
  const assertBudget = require('assert');
  const { agents } = require('../web/core/agents/roster');
  const MANDATED = /\b(check_limits|check_compliance|check_social_limits|ask_critic)\b/g;

  let checked = 0;
  for (const agent of Object.values(agents)) {
    if (!agent || typeof agent !== 'object' || !agent.name || !agent.role) continue;
    // brand-analyst and critic build their role from the brief, so ask for the
    // default text rather than assuming every role is a plain string.
    const role = typeof agent.role === 'function' ? agent.role({}) : agent.role;
    if (typeof role !== 'string') continue;
    // Only the sentence that mandates them; tools merely offered are fine.
    const demand = role.match(/Before submitting[\s\S]{0,400}/);
    if (!demand) continue;
    const tools = new Set(demand[0].match(MANDATED) || []);
    if (!tools.size) continue;

    const budget = typeof agent.budget === 'function' ? agent.budget({}) : agent.budget;
    // One turn per mandated check, one to draft, one to fix, one to submit,
    // plus two spare fix rounds. Anything less and a flagged asset - which is
    // the normal case, not the exception - runs the pass out of turns.
    const floor = tools.size + 5;
    assertBudget.ok(
      budget.maxTurns >= floor,
      `${agent.name}: role mandates ${tools.size} tool calls (${[...tools].join(', ')}) ` +
        `so maxTurns must be at least ${floor}, found ${budget.maxTurns}`
    );
    checked++;
  }
  assertBudget.ok(checked >= 4, `expected several agents to mandate tools, saw ${checked}`);
  console.log(`budget tests: ok (${checked} agents)`);
})().catch((e) => { console.error('budget tests FAILED', e); process.exit(1); });
