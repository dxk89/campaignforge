#!/usr/bin/env node
/**
 * The merge gate.
 *
 * Compares the two most recent non-mock runs over the same briefs and fails if
 * any agent's composite drops materially or its completion rate falls below the
 * floor. This is what makes prompt changes evidence-based rather than a matter
 * of taste, and it is the most defensible thing in the product.
 *
 *   node evals/gate.js               compare the last two real runs
 *   node evals/gate.js --allow-mock  same, including mock runs (for testing the gate)
 */
const fs = require('fs');
const path = require('path');

const DROP = 0.05;          // a composite may not fall by more than this
const COMPLETE_FLOOR = 0.9; // nor completion below this

const dir = path.join(__dirname, 'results');
const allowMock = process.argv.includes('--allow-mock');

// The mock fixtures contain one deliberately over-limit headline so the
// validation flag is visible in the UI, which means the copywriter can never
// reach the completion floor in mock mode. Mock runs exercise the harness;
// they are not evidence about the prompts.
const MOCK_EXEMPT = new Set(['copywriter']);

const runs = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
      .map((f) => ({ file: f, data: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }))
      .filter((r) => allowMock || !r.data.mock)
      .sort((a, b) => a.data.ranAt.localeCompare(b.data.ranAt))
  : [];

if (runs.length === 0) { console.error('No eval runs found. Run `node evals/run.js` first.'); process.exit(1); }
if (runs.length === 1) {
  console.log(`Only one run (${runs[0].file}). Recording it as the baseline; nothing to compare.`);
  process.exit(0);
}

const [previous, latest] = runs.slice(-2);
const sameBriefs = JSON.stringify([...previous.data.briefs].sort()) === JSON.stringify([...latest.data.briefs].sort());
if (!sameBriefs) {
  console.error('The two most recent runs used different briefs, so they cannot be compared.');
  console.error(`  ${previous.file}: ${previous.data.briefs.join(', ')}`);
  console.error(`  ${latest.file}: ${latest.data.briefs.join(', ')}`);
  process.exit(1);
}

console.log(`Comparing ${latest.file} against ${previous.file}\n`);
console.log('agent'.padEnd(22), 'before   after    delta    complete  verdict');

const failures = [];
for (const agent of new Set([...Object.keys(previous.data.byAgent), ...Object.keys(latest.data.byAgent)])) {
  const before = previous.data.byAgent[agent];
  const after = latest.data.byAgent[agent];
  if (!after) { failures.push(`${agent} did not run in the latest run`); continue; }
  if (!before) { console.log(agent.padEnd(22), '-'.padEnd(8), String(after.composite).padEnd(8), '-'.padEnd(8), String(after.complete).padEnd(9), 'new'); continue; }

  const delta = Number(((after.composite ?? 0) - (before.composite ?? 0)).toFixed(3));
  const problems = [];
  if (delta < -DROP) problems.push(`composite fell ${Math.abs(delta)}`);
  const exempt = latest.data.mock && MOCK_EXEMPT.has(agent);
  if (after.complete < COMPLETE_FLOOR && !exempt) problems.push(`completion ${after.complete} is below ${COMPLETE_FLOOR}`);
  if (problems.length) failures.push(`${agent}: ${problems.join('; ')}`);

  console.log(
    agent.padEnd(22),
    String(before.composite ?? '-').padEnd(8),
    String(after.composite ?? '-').padEnd(8),
    `${delta >= 0 ? '+' : ''}${delta}`.padEnd(8),
    String(after.complete).padEnd(9),
    problems.length ? 'FAIL' : exempt ? 'ok (mock exempt)' : 'ok',
  );
}

if (failures.length) {
  console.error(`\n${failures.length} agent(s) regressed:`);
  for (const f of failures) console.error(`  ${f}`);
  console.error('\nThe change does not ship. Either fix the regression or explain in the commit why the scorer is wrong.');
  process.exit(1);
}
console.log('\nNo agent regressed. The change may ship.');
