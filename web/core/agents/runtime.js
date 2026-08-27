/**
 * Agent runtime.
 *
 * Every agent in the roster runs on this loop. An agent is a role prompt, a
 * set of tools, a submit schema, a validator and a budget. The loop:
 *
 *   1. Send the packet (what the agent is shown) with the agent's tools plus
 *      a `submit` tool whose input schema is the agent's output schema.
 *   2. If the model calls ordinary tools, run them in code and return results.
 *   3. If it calls `submit`, run the agent's validator. Clean: return. Dirty:
 *      hand the errors back as the tool result and let it revise.
 *   4. Stop at the turn or token budget with whatever is best so far, flagged.
 *
 * Why submit-as-a-tool: the final answer arrives as structured input against
 * a schema, so there is no JSON to strip or repair. Malformed output is a
 * schema error the agent sees and fixes.
 *
 * Why validators as gates: the agent can call a checker mid-run (it's in its
 * tool list), but the runtime insists on submit. An agent cannot ship an
 * over-limit headline; it can only fail to fix it within budget, which is
 * reported, never hidden.
 */

const { client: anthropic, MOCK } = require('../claude');
const { costEur, MODELS } = require('../pricing');
const { mockCall } = require('../mock');

const DEFAULT_BUDGET = { maxTurns: 5, maxOutputTokens: 4096, maxSearches: 0 };

/** Summarise a value for the trace without storing whole documents. */
function brief(v, n = 160) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + '…' : s;
}

/**
 * @param {object} agent   from lib/agents/roster
 * @param {object} packet  { user: string, ...context the tools may need }
 * @param {object} [opts]  { budget, ledger(entry), model }
 * @returns {Promise<{output: object, usage: object, trace: Array, complete: boolean, problems: string[]}>}
 */
async function run(agent, packet, opts = {}) {
  const started = Date.now();
  const budget = { ...DEFAULT_BUDGET, ...(agent.budget || {}), ...(opts.budget || {}) };
  const model = opts.model || agent.model || MODELS.sonnet;
  const usage = { input: 0, output: 0, webSearches: 0, calls: 0 };
  const trace = [];

  // ---- Mock: fixture at the agent level, still run through the validator so
  // the gate is exercised and the UI sees the same shape. --------------------
  if (MOCK) {
    const m = await mockCall(agent.fixture || agent.name);
    const output = agent.postProcess ? agent.postProcess(m.data, packet) : m.data;
    const problems = agent.validate ? agent.validate(output, packet) : [];
    const u = { ...m.usage, ms: m.ms, model, costEur: Number(costEur(m.usage.input, m.usage.output, m.usage.webSearches || 0, model).toFixed(4)) };
    opts.ledger?.({ agent: agent.name, ...u });
    return { output, usage: u, trace: [{ turn: 0, note: 'mock fixture', problems }], complete: problems.length === 0, problems };
  }

  const submitTool = {
    name: 'submit',
    description: `Submit your final output. Call this exactly once, when your output satisfies every rule in your instructions. If validation fails you will get the errors back; fix them and submit again.`,
    input_schema: agent.schema,
  };
  const tools = [
    ...(agent.tools || []).map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
    submitTool,
  ];
  if (budget.maxSearches > 0) tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: budget.maxSearches });
  const byName = Object.fromEntries((agent.tools || []).map((t) => [t.name, t]));

  const messages = [{ role: 'user', content: packet.user }];
  let best = null;
  let bestProblems = ['no output submitted'];

  for (let turn = 1; turn <= budget.maxTurns; turn++) {
    const res = await anthropic.messages.create({
      model,
      max_tokens: budget.maxOutputTokens,
      temperature: agent.temperature ?? 0.4,
      system: agent.role,
      tools,
      messages,
    });
    usage.calls++;
    usage.input += res.usage?.input_tokens || 0;
    usage.output += res.usage?.output_tokens || 0;
    usage.webSearches += res.usage?.server_tool_use?.web_search_requests || 0;

    const calls = res.content.filter((b) => b.type === 'tool_use');
    const entry = { turn, stop: res.stop_reason, tools: [] };
    trace.push(entry);
    messages.push({ role: 'assistant', content: res.content });

    if (!calls.length) {
      // Text only. Nudge once toward submit; if it keeps talking, budget ends it.
      messages.push({ role: 'user', content: 'Call the submit tool with your final output now. Do not reply in prose.' });
      entry.note = 'no tool call; nudged';
      continue;
    }

    const results = [];
    let submitted = false;
    for (const call of calls) {
      if (call.name === 'submit') {
        submitted = true;
        const output = agent.postProcess ? agent.postProcess(call.input, packet) : call.input;
        const problems = agent.validate ? agent.validate(output, packet) : [];
        entry.tools.push({ name: 'submit', problems });
        if (!problems.length) {
          const u = finish(usage, started, model);
          opts.ledger?.({ agent: agent.name, ...u });
          return { output, usage: u, trace, complete: true, problems: [] };
        }
        best = output;
        bestProblems = problems;
        results.push({ type: 'tool_result', tool_use_id: call.id, content: `Validation failed. Fix every item and submit again:\n- ${problems.join('\n- ')}` });
        continue;
      }
      const tool = byName[call.name];
      let result;
      try {
        result = tool ? await tool.run(call.input, packet) : { error: `unknown tool ${call.name}` };
      } catch (err) {
        result = { error: err.message };
      }
      entry.tools.push({ name: call.name, input: brief(call.input), result: brief(result) });
      results.push({ type: 'tool_result', tool_use_id: call.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: results });
    if (!submitted && res.stop_reason === 'end_turn') {
      // Model finished its tool calls and stopped without submitting; continue so it can.
    }
  }

  const u = finish(usage, started, model);
  opts.ledger?.({ agent: agent.name, ...u, incomplete: true });
  return { output: best, usage: u, trace, complete: false, problems: bestProblems };
}

function finish(usage, started, model) {
  return {
    ...usage,
    ms: Date.now() - started,
    model,
    costEur: Number(costEur(usage.input, usage.output, usage.webSearches, model).toFixed(4)),
  };
}

module.exports = { run };
