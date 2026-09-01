/**
 * The lifecycle, drawn.
 *
 * The activation pass already returns a graph: steps with ids, a type each,
 * and branches whose yes and no point at other step ids. Nothing here infers
 * a diagram, it renders the one that is already there, which is why this is
 * code rather than another model call (invariant 1). The same lifecycle
 * always produces the same picture.
 *
 * The output is Mermaid source. That was chosen over drawing SVG directly
 * because it renders in the places this gets pasted as well as in the app:
 * GitHub, Notion, a Claude conversation, mermaid.live. A diagram nobody can
 * paste into a document is half a diagram.
 */

/** Mermaid node labels are delimited, so the delimiters have to go. */
function label(text, max = 68) {
  const s = String(text == null ? '' : text)
    .replace(/["\[\]{}()<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/** The shape says the kind: a decision is a diamond, an ending is a stadium. */
function node(step, emails) {
  const id = step.id;
  switch (step.type) {
    case 'email': {
      const e = emails[(step.email || 1) - 1];
      const subject = e?.subject ? `: ${label(e.subject, 44)}` : '';
      return `  ${id}["Email ${step.email || '?'}${subject}"]`;
    }
    case 'wait':
      return `  ${id}[/"Wait ${step.days == null ? '?' : step.days} day${step.days === 1 ? '' : 's'}"/]`;
    case 'branch':
      return `  ${id}{"${label(step.signal || 'branch', 52)}"}`;
    case 'handoff':
      return `  ${id}[["Hand to sales"]]`;
    case 'exit':
      return `  ${id}(["Exit"])`;
    default:
      return `  ${id}["${label(step.type || 'step')}"]`;
  }
}

/**
 * @param {object} lifecycle  the activation pass's lifecycle
 * @param {object} [opts]
 * @param {Array}  [opts.emails]  the copy pass's emails, to label the nodes
 * @returns {string} Mermaid flowchart source
 */
function lifecycleToMermaid(lifecycle, opts = {}) {
  const steps = (lifecycle?.steps || []).filter((s) => s && s.id);
  const emails = opts.emails || [];
  const lines = ['flowchart TD'];

  const entry = label(lifecycle?.entry || 'Enrols');
  lines.push(`  entry(["${entry}"])`);

  for (const s of steps) lines.push(node(s, emails));

  // Edges. A branch names its two ways out; everything else falls through to
  // whatever comes next in the list, which is what "steps" means.
  const ids = steps.map((s) => s.id);
  const known = new Set(ids);
  if (ids.length) lines.push(`  entry --> ${ids[0]}`);

  steps.forEach((s, i) => {
    if (s.type === 'branch') {
      // A branch pointing at a step that does not exist would render as a
      // node with no label and no explanation, so it is dropped and the
      // reader is not shown an edge to nowhere.
      if (s.yes && known.has(s.yes)) lines.push(`  ${s.id} -->|yes| ${s.yes}`);
      if (s.no && known.has(s.no)) lines.push(`  ${s.id} -->|no| ${s.no}`);
      return;
    }
    if (s.type === 'exit') return;
    const next = steps[i + 1];
    if (next) lines.push(`  ${s.id} --> ${next.id}`);
  });

  // Exit rules apply everywhere rather than at one step, so they are stated
  // beside the diagram rather than drawn into it. Drawing an edge from every
  // node to a single exit makes the picture unreadable and says less.
  const exits = (lifecycle?.exit_rules || []).filter(Boolean);
  if (exits.length) {
    lines.push('  leaves(["Leaves the workflow"])');
    lines.push(`  note["Anyone who: ${label(exits.join('; '), 120)}"] --> leaves`);
  }

  return lines.join('\n');
}

module.exports = { lifecycleToMermaid };
