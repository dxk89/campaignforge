/**
 * Reading the lifecycle graph.
 *
 * Two things need the same answers about a lifecycle: the validator, which
 * decides whether it is coherent, and the diagram, which draws it. Keeping
 * those answers here means they cannot disagree about what an entry route is
 * or which steps are reachable.
 *
 * It also absorbs a shape change. A lifecycle used to have one `entry`
 * string, and the model routinely wrote two routes into it: "submits the
 * trial form, or clicks a paid ad and leaves". Those are different audiences
 * wanting different first emails, and the structure could not say so.
 * `entries` is a list now, and campaigns generated before the change still
 * read correctly through here.
 */

/**
 * The entry routes, whichever shape the lifecycle is in.
 *
 * @returns {Array<{ id: string, event: string, first: string|null, note: string }>}
 */
function entriesOf(lifecycle) {
  const steps = lifecycle?.steps || [];
  const firstStep = steps.length ? steps[0].id : null;

  if (Array.isArray(lifecycle?.entries) && lifecycle.entries.length) {
    return lifecycle.entries
      .filter((e) => e && (e.event || e.id))
      .map((e, i) => ({
        id: e.id || `e${i + 1}`,
        event: String(e.event || e.id),
        // An entry without a first step starts at the beginning, which is what
        // a single-route campaign means and what older data implies.
        first: e.first || firstStep,
        note: e.note || '',
      }));
  }

  // The older single-string shape.
  if (lifecycle?.entry) {
    return [{ id: 'entry', event: String(lifecycle.entry), first: firstStep, note: '' }];
  }
  return [];
}

/**
 * Which steps can actually be reached from an entry.
 *
 * A step nobody arrives at is a step that will never run, and it is easy to
 * produce: rewire one branch and something upstream is orphaned without
 * anything else changing. Cheap to detect, invisible to read.
 */
function reachableSteps(lifecycle) {
  const steps = lifecycle?.steps || [];
  const byId = new Map(steps.map((s) => [s.id, s]));
  const seen = new Set();
  const queue = entriesOf(lifecycle).map((e) => e.first).filter(Boolean);

  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id) || !byId.has(id)) continue;
    seen.add(id);

    const step = byId.get(id);
    if (step.type === 'branch') {
      for (const k of ['yes', 'no']) if (step[k]) queue.push(step[k]);
      continue;
    }
    if (step.type === 'exit') continue;
    const i = steps.indexOf(step);
    const next = steps[i + 1];
    if (next) queue.push(next.id);
  }
  return seen;
}

module.exports = { entriesOf, reachableSteps };
