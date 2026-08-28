#!/usr/bin/env node
/**
 * Run the golden briefs through the chain and score every agent.
 *
 * Real API by default, which costs money: about EUR 2-3 per brief, so a full
 * run is EUR 10-15. Use --mock to exercise the harness itself for free.
 *
 *   node evals/run.js                 all briefs, real API
 *   node evals/run.js --mock          fixtures, no spend, checks the harness
 *   node evals/run.js --brief thin    one brief
 *   node evals/run.js --agents strategist,copywriter
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

if (flag('mock')) process.env.MOCK_CLAUDE = '1';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'eval';

const orchestrator = require('../lib/agents/orchestrator');
const research = require('../lib/prompts/research');
const { scoreOutput, aggregate } = require('./score');

const CHAIN = ['brand-analyst', 'customer-researcher', 'strategist', 'copywriter', 'social-planner', 'ops-architect', 'landing-writer', 'localiser'];

async function runBrief(spec, only) {
  const { brief, sources = [], webResearch = false, expected } = spec;
  const agents = {};
  const outputs = {};
  let context = research.emptyContext();

  const wanted = (a) => !only || only.includes(a);

  const step = async (agent, inputs) => {
    if (!wanted(agent)) return null;
    const started = Date.now();
    try {
      const r = await orchestrator.runAgent(agent, inputs);
      const language = agent === 'localiser' ? 'pt' : 'en';
      const scored = scoreOutput(agent, r.output, { expected: { ...expected, language: agent === 'localiser' ? 'pt' : expected.language }, context });
      agents[agent] = { complete: r.complete, problems: r.problems, usage: { ...r.usage, ms: Date.now() - started }, ...scored };
      return r.output;
    } catch (err) {
      agents[agent] = { complete: false, problems: [err.message], usage: { costEur: 0, ms: Date.now() - started }, composite: 0, scores: {} };
      return null;
    }
  };

  outputs.context = (await step('brand-analyst', { brief, sources, webResearch, clientId: null })) || context;
  context = outputs.context;
  outputs.audience = webResearch ? await step('customer-researcher', { brief, context, clientId: null }) : null;
  outputs.strategy = await step('strategist', { brief, context, audience: outputs.audience, clientId: null });
  if (outputs.strategy) {
    outputs.assets = await step('copywriter', { brief, context, audience: outputs.audience, strategy: outputs.strategy, clientId: null });
    if (outputs.assets) {
      outputs.social = await step('social-planner', { brief, context, audience: outputs.audience, strategy: outputs.strategy, assets: outputs.assets, brandKit: null, clientId: null });
      outputs.activation = await step('ops-architect', { brief, context, audience: outputs.audience, strategy: outputs.strategy, assets: outputs.assets, clientId: null });
      if (outputs.activation) {
        outputs.landing = await step('landing-writer', { brief, context, audience: outputs.audience, strategy: outputs.strategy, assets: outputs.assets, activation: outputs.activation, clientId: null });
      }
      if ((brief.languages || []).includes('pt')) {
        outputs.localised = await step('localiser', { brief, context, assets: outputs.assets, glossary: context.glossary, clientId: null });
      }
    }
  }
  return { brief: spec.name, agents };
}

(async () => {
  const dir = path.join(__dirname, 'briefs');
  const only = value('brief');
  const agentFilter = value('agents')?.split(',');
  const specs = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .filter((s) => !only || s.name === only);

  if (!specs.length) { console.error('No briefs matched'); process.exit(1); }
  console.log(`Running ${specs.length} brief(s)${process.env.MOCK_CLAUDE ? ' in mock mode' : ' against the real API'}\n`);

  const runs = [];
  for (const spec of specs) {
    process.stdout.write(`${spec.name}… `);
    const run = await runBrief(spec, agentFilter);
    runs.push(run);
    const composites = Object.values(run.agents).map((a) => a.composite).filter((c) => c !== null);
    const cost = Object.values(run.agents).reduce((n, a) => n + (a.usage?.costEur || 0), 0);
    console.log(`${Object.keys(run.agents).length} agents, mean ${composites.length ? (composites.reduce((a, b) => a + b, 0) / composites.length).toFixed(3) : '-'}, €${cost.toFixed(3)}`);
  }

  const byAgent = aggregate(runs);
  const record = {
    ranAt: new Date().toISOString(),
    mock: Boolean(process.env.MOCK_CLAUDE),
    briefs: specs.map((s) => s.name),
    models: Object.fromEntries(Object.entries(orchestrator.roster).map(([k, a]) => [k, a.model])),
    byAgent, runs,
  };

  const file = path.join(__dirname, 'results', `${record.ranAt.slice(0, 19).replace(/[:T]/g, '-')}${record.mock ? '-mock' : ''}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2));

  console.log('\nPer agent:');
  console.log('agent'.padEnd(22), 'composite  complete  cost     ms');
  for (const [agent, a] of Object.entries(byAgent).sort((x, y) => (x[1].composite ?? 0) - (y[1].composite ?? 0))) {
    console.log(agent.padEnd(22), String(a.composite ?? '-').padEnd(10), String(a.complete).padEnd(9), `€${a.costEur.toFixed(3)}`.padEnd(8), a.msPerBrief);
  }
  const total = Object.values(byAgent).reduce((n, a) => n + a.costEur, 0);
  console.log(`\nTotal €${total.toFixed(3)} · written to ${path.relative(process.cwd(), file)}`);
})().catch((e) => { console.error(e); process.exit(1); });
