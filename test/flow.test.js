/**
 * Drawing the lifecycle.
 *
 * The activation pass already returns a graph, so this renders it rather than
 * inferring it, and the same lifecycle must always produce the same picture.
 * The cases here are the ones that make a diagram wrong rather than ugly: a
 * branch pointing at a step that does not exist, a subject line containing a
 * character Mermaid treats as syntax, and a step list in an order the reader
 * would not expect.
 */
const assert = require('assert');
const { lifecycleToMermaid } = require('../web/core/flow');

const lifecycle = {
  entry: 'Submits the early access form',
  steps: [
    { id: 's1', type: 'email', email: 1 },
    { id: 's2', type: 'wait', days: 3 },
    { id: 's3', type: 'branch', signal: 'clicked the chart link in email 1', yes: 's4', no: 's5' },
    { id: 's4', type: 'handoff' },
    { id: 's5', type: 'email', email: 2 },
    { id: 's6', type: 'exit' },
  ],
  exit_rules: ['replied', 'booked a call', 'unsubscribed'],
};

(async () => {
  const emails = [{ subject: 'Close the month four days faster' }, { subject: 'What your ledger cannot see' }];
  const m = lifecycleToMermaid(lifecycle, { emails });

  assert.ok(m.startsWith('flowchart TD'), 'it is a Mermaid flowchart');

  // Entry is a node, and it leads into the first step.
  assert.ok(/entry\(\["Submits the early access form"\]\)/.test(m), 'the entry event is drawn');
  assert.ok(/entry --> s1/.test(m), 'and leads into the first step');

  // The email node carries its subject, so the diagram is readable without
  // cross-referencing the email tab.
  assert.ok(/s1\["Email 1: Close the month four days faster"\]/.test(m), 'emails are labelled with their subject');

  // Shape carries meaning: a branch is a decision, an exit is an ending.
  assert.ok(/s3\{"clicked the chart link in email 1"\}/.test(m), 'a branch is a diamond');
  assert.ok(/s6\(\["Exit"\]\)/.test(m), 'an exit is a stadium');
  assert.ok(/s2\[\/"Wait 3 days"\/\]/.test(m), 'a wait says how long');

  // Branch edges are labelled, and the rest fall through in order.
  assert.ok(/s3 -->\|yes\| s4/.test(m), 'the yes branch is labelled');
  assert.ok(/s3 -->\|no\| s5/.test(m), 'and the no branch');
  assert.ok(/s1 --> s2/.test(m), 'ordinary steps fall through to the next');
  assert.ok(!/s3 --> s4$/m.test(m), 'a branch does not also fall through');
  assert.ok(!/s6 -->/.test(m), 'and an exit leads nowhere');

  // A branch pointing at a step that does not exist must not draw an edge to
  // nowhere: Mermaid would invent an unlabelled node and the reader would
  // have no idea what it was.
  const broken = lifecycleToMermaid({
    entry: 'x',
    steps: [{ id: 'a', type: 'branch', signal: 'signal', yes: 'ghost', no: 'a' }],
  });
  assert.ok(!/ghost/.test(broken), 'an edge to a step that does not exist is dropped');
  assert.ok(/a -->\|no\| a/.test(broken), 'and the one that does exist survives');

  // Mermaid treats brackets and quotes as syntax, so a subject containing them
  // has to be cleaned or the whole diagram fails to parse.
  const risky = lifecycleToMermaid(
    { entry: 'x', steps: [{ id: 's1', type: 'email', email: 1 }] },
    { emails: [{ subject: 'Read this [now] "really"' }] }
  );
  const riskyLine = risky.split('\n').find((l) => l.includes('s1[')) || '';
  const inside = (riskyLine.match(/\["(.*)"\]/) || [])[1] || '';
  assert.ok(inside.length > 0, 'the node has a label');
  assert.ok(!/[\[\]"]/.test(inside),
    `brackets and quotes inside a label are removed, got: ${inside}`);
  assert.ok(/Read this now really/.test(risky), 'and the words survive');

  // Exit rules apply everywhere, so they are stated rather than drawn from
  // every node. An edge from each step to one exit makes the picture useless.
  assert.ok(/Anyone who: replied; booked a call; unsubscribed/.test(m), 'exit rules are stated');
  assert.equal((m.match(/--> leaves/g) || []).length, 1, 'and drawn once, not from every step');

  // Deterministic: the same lifecycle gives the same diagram.
  assert.equal(lifecycleToMermaid(lifecycle, { emails }), m, 'the same input gives the same output');

  // Nothing to draw is not a crash.
  assert.ok(lifecycleToMermaid(null).startsWith('flowchart TD'), 'an absent lifecycle still returns a diagram');
  assert.ok(lifecycleToMermaid({ steps: [] }).includes('entry'), 'and an empty one keeps its entry node');

  console.log('flow tests: ok');
})().catch((e) => { console.error('flow tests FAILED', e); process.exit(1); });

/**
 * Entry routes, and steps nothing reaches.
 *
 * A lifecycle used to have one `entry` string, and the model routinely wrote
 * two routes into it: "submits the trial form, or clicks a paid ad and
 * leaves". Those are different audiences wanting different first emails, and
 * the structure could not say so, so the difference survived only as prose
 * that nothing checked.
 */
(async () => {
  const a = require('assert');
  const { entriesOf, reachableSteps } = require('../web/core/lifecycle');
  const { lifecycleToMermaid } = require('../web/core/flow');
  const { validateActivation } = require('../web/core/prompts/activation');

  const two = {
    entries: [
      { id: 'trial', event: 'Submits the trial form', first: 's1' },
      { id: 'retarget', event: 'Clicks a paid ad and leaves', first: 's3' },
    ],
    steps: [
      { id: 's1', type: 'email', email: 1 },
      { id: 's2', type: 'exit' },
      { id: 's3', type: 'email', email: 2 },
      { id: 's4', type: 'exit' },
    ],
  };

  // Each route is its own node, into its own first step.
  const m = lifecycleToMermaid(two);
  a.ok(/trial\(\["Submits the trial form"\]\)/.test(m), 'the first route is drawn');
  a.ok(/retarget\(\["Clicks a paid ad and leaves"\]\)/.test(m), 'and so is the second');
  a.ok(/trial --> s1/.test(m), 'each route enters where it starts');
  a.ok(/retarget --> s3/.test(m), 'rather than both at the top');

  // Campaigns generated before the change still read. Their single string
  // becomes one route beginning at the first step.
  const old = { entry: 'Fills the form', steps: [{ id: 's1', type: 'email', email: 1 }] };
  const [only] = entriesOf(old);
  a.equal(only.event, 'Fills the form', 'the old single entry is still read');
  a.equal(only.first, 's1', 'and starts at the first step');
  a.ok(/entry --> s1/.test(lifecycleToMermaid(old)), 'and still draws');

  // Reachability. Rewiring one branch is enough to orphan something upstream
  // without anything else looking wrong.
  a.deepEqual([...reachableSteps(two)].sort(), ['s1', 's2', 's3', 's4'], 'both routes reach their steps');
  const orphaned = {
    entries: [{ id: 'e1', event: 'x', first: 's1' }],
    steps: [{ id: 's1', type: 'exit' }, { id: 's9', type: 'email', email: 1 }],
  };
  a.ok(!reachableSteps(orphaned).has('s9'), 's9 is not reachable');
  a.ok(validateActivation({ lifecycle: orphaned }).some((p) => /no route reaches s9/.test(p)),
    'and the gate says so');

  // An entry starting at a step that does not exist is refused, the same way
  // a branch pointing at one is.
  a.ok(
    validateActivation({ lifecycle: { entries: [{ id: 'e1', event: 'x', first: 'ghost' }], steps: [{ id: 's1', type: 'exit' }] } })
      .some((p) => /entry e1 starts at unknown step ghost/.test(p)),
    'an entry into nowhere is refused'
  );

  // And a lifecycle with steps but no way in at all.
  a.ok(validateActivation({ lifecycle: { steps: [{ id: 's1', type: 'exit' }] } })
    .some((p) => /no entry route/.test(p)), 'a lifecycle nobody can enter is refused');

  console.log('entry route tests: ok');
})().catch((e) => { console.error('entry route tests FAILED', e); process.exit(1); });
