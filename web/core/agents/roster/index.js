/**
 * The roster. One file per agent; this index is what the orchestrator and
 * the routes use. Each agent exports:
 *   name, fixture (mock key), model, role (system prompt), tools[], schema
 *   (submit input schema), budget, packet(inputs) -> packet, validate(output,
 *   packet) -> problems[], postProcess(output, packet) -> output (optional)
 */
const agents = {
  'brief-reader': require('./brief-reader'),
  'brand-analyst': require('./brand-analyst'),
  'customer-researcher': require('./customer-researcher'),
  strategist: require('./strategist'),
  copywriter: require('./copywriter'),
  'social-planner': require('./social-planner'),
  'ops-architect': require('./ops-architect'),
  localiser: require('./localiser'),
  critic: require('./critic'),
  'field-editor': require('./field-editor'),
};

module.exports = { agents, get: (name) => agents[name] };
