/**
 * Pass 4: Activation.
 *
 * Assets are not a campaign. A campaign is assets plus the machinery around
 * them: who gets which email when and on what signal, when a lead moves to
 * sales and what sales is told, what gets measured against pipeline rather
 * than activity, and what each variant is there to test.
 *
 * This pass produces that machinery as structured JSON so the front end can
 * render it and a CRM could consume it. It runs after the English assets
 * exist, because the workflow references the emails by number and the
 * experiments reference the variants by number.
 *
 * The UTM scheme is deliberately NOT produced here. It is deterministic, so
 * it is generated in code (utm.js). Models are for judgement; code is for
 * anything that must be the same every time.
 */

const { entriesOf, reachableSteps } = require('../lifecycle');

function systemPrompt() {
  return `You are a B2B marketing operations lead. You are given a campaign brief, the chosen strategy, the finished asset set and the company context. Design the operating layer for the campaign.

Return ONLY a JSON object, no prose, no markdown, no code fences. Use this exact shape:

{
  "lifecycle": {
    "entries": [
      { "id": "short id", "event": "one event that enrols someone, e.g. 'submits the trial form'", "first": "the step id this route begins at", "note": "why this audience starts here rather than at the top" }
    ],
    "steps": [
      { "id": "s1", "type": "email", "email": 1, "note": "why this email here" },
      { "id": "s2", "type": "wait", "days": 3 },
      { "id": "s3", "type": "branch", "signal": "clicked the chart link in email 2", "yes": "s5", "no": "s4", "note": "what the signal tells us" },
      { "id": "s6", "type": "handoff", "note": "what triggers the pass to sales and what sales receives" },
      { "id": "s7", "type": "exit", "note": "when someone leaves the workflow" }
    ],
    "signals_used": ["every behavioural signal the branches rely on, e.g. 'email 2 click', 'pricing page visit', 'form submit'"],
    "exit_rules": ["conditions that remove someone regardless of step: replied, booked, unsubscribed, became a customer"]
  },
  "handoff": {
    "mql_definition": ["the criteria, each one testable, that make a lead marketing-qualified for this campaign"],
    "lead_score": [ { "signal": "behaviour or attribute", "points": 10, "why": "one clause" } ],
    "threshold": 30,
    "sla": "what sales commits to once a lead crosses the threshold, e.g. 'BDR contacts within one business day'",
    "bdr_sop": ["ordered steps a BDR follows when the lead lands, 4-7 steps"],
    "talk_track": {
      "opening": "the first sentence a BDR says or writes, in the campaign's voice",
      "objections": [ { "objection": "what the lead says", "response": "what the BDR says back, 1-2 sentences" } ]
    },
    "disqualifiers": ["attributes that route a lead out of sales follow-up"]
  },
  "measurement": {
    "kpi_tree": [
      { "stage": "reach | engagement | capture | qualification | pipeline | revenue", "metric": "name", "target": "number or 'set after week 1' if the brief gives none", "source": "the system of record, e.g. LinkedIn Campaign Manager, GA4, HubSpot, CRM" }
    ],
    "funnel": [ { "stage": "name", "definition": "exact rule for counting someone at this stage" } ],
    "reporting_cadence": "what is reviewed, how often, by whom",
    "data_quality": ["specific checks that keep the numbers trustworthy across systems: UTM discipline, dedupe rules, field mapping, attribution window"],
    "incrementality": { "method": "holdout | geo split | switchback | none possible, and why", "design": "who is held out or which regions, for how long, and the smallest effect this could detect", "caveat": "one sentence on what the platform's own reported conversions will overstate and by roughly how much" }
  },
  "experiments": [
    { "channel": "meta | linkedin | google | email", "hypothesis": "what we believe and why", "variants": "which variants test it, e.g. 'variant 1 vs variant 3'", "primary_metric": "one metric", "decision_rule": "what result changes what decision, including the minimum sample" }
  ]
}

Rules:
- List every way in separately. Someone who filled in the trial form and someone who bounced off a paid ad are different audiences and usually want a different first email, so give each its own entry with its own first step. One route is fine if there genuinely is one; two routes written into one sentence is not.
- Every step must be reachable from an entry. A step nothing arrives at will never run.
- Every KPI in the tree is reported by a platform that is also being asked to prove its own worth, so the plan needs one measurement that does not come from the platform. Say how a lift would be established - a holdout audience, a geo split, a switchback - and what it would take to detect the effect. If the budget or audience is genuinely too small, say "none possible" and say why; a plan that admits it cannot measure lift is more useful than one that reports platform-attributed conversions as if they were incremental.
- The lifecycle must use the three emails in the asset set by number and must branch at least once on a behaviour signal. The asset set's branch_note is the starting point; make it a real workflow.
- Every step id must be unique. Branch yes/no must point at existing step ids. The workflow must terminate: every path reaches an exit or handoff.
- Lead score points and threshold must be consistent: it should be possible, but not trivial, to cross the threshold.
- The KPI tree must run all the way to pipeline and revenue. Activity metrics (impressions, opens) are allowed only at the top, never as the campaign's measure of success. If the brief or company context gives budgets or targets, use them; if not, say 'set after week 1' rather than inventing numbers.
- Experiments: one per channel that has variants. Each must name a real difference between the variants in the asset set, not a generic A/B.
- Use the company's vocabulary from the context. Do not invent tools the company has not mentioned; if the CRM is unknown, say 'CRM'.
- British English. Plain language. No filler.`;
}

function userPrompt(brief, strategy, assets, contextBlock) {
  return `CAMPAIGN BRIEF
Product name: ${brief.productName}
Product description: ${brief.productDescription}
Target audience: ${brief.targetAudience}
Objective: ${brief.objective}
Tone: ${brief.tone}

STRATEGY
${JSON.stringify(strategy, null, 2)}

ASSETS (English; reference emails and variants by number)
${JSON.stringify(assets, null, 2)}

${contextBlock}

Return the activation JSON now.`;
}

/**
 * Structural checks in code: the model is asked for a valid graph, and we
 * verify it. Returns a list of problems; empty means sound.
 */
function validateActivation(a) {
  const problems = [];
  const steps = a?.lifecycle?.steps || [];
  const ids = new Set();
  for (const s of steps) {
    if (!s.id) problems.push('a step has no id');
    else if (ids.has(s.id)) problems.push(`duplicate step id ${s.id}`);
    else ids.add(s.id);
  }
  for (const s of steps) {
    if (s.type === 'branch') {
      for (const k of ['yes', 'no']) if (!ids.has(s[k])) problems.push(`branch ${s.id} points ${k} at unknown step ${s[k]}`);
    }
    if (s.type === 'email' && ![1, 2, 3].includes(Number(s.email))) problems.push(`step ${s.id} references email ${s.email}`);
  }
  if (steps.length && !steps.some((s) => s.type === 'exit' || s.type === 'handoff')) problems.push('workflow has no exit or handoff');

  // Entry routes. A campaign is usually entered more than one way, and each
  // route needs its own start: two audiences described in one sentence cannot
  // be given different first emails.
  const entries = entriesOf(a?.lifecycle);
  if (steps.length && !entries.length) problems.push('lifecycle has no entry route');
  const entryIds = new Set();
  for (const e of entries) {
    if (entryIds.has(e.id)) problems.push(`duplicate entry id ${e.id}`);
    entryIds.add(e.id);
    if (!e.event) problems.push(`entry ${e.id} does not say what enrols someone`);
    if (e.first && !ids.has(e.first)) problems.push(`entry ${e.id} starts at unknown step ${e.first}`);
  }

  // A step nothing arrives at will never run, and rewiring one branch is
  // enough to orphan something upstream without anything else looking wrong.
  if (steps.length && entries.length) {
    const reached = reachableSteps(a.lifecycle);
    const orphans = steps.map((s) => s.id).filter((id) => id && !reached.has(id));
    if (orphans.length) problems.push(`no route reaches ${orphans.join(', ')}`);
  }
  const score = a?.handoff?.lead_score || [];
  const max = score.reduce((n, r) => n + (Number(r.points) || 0), 0);
  if (score.length && Number(a.handoff.threshold) > max) problems.push(`lead score threshold ${a.handoff.threshold} exceeds maximum possible ${max}`);
  const stages = (a?.measurement?.kpi_tree || []).map((k) => String(k.stage || '').toLowerCase());
  if (stages.length && !stages.some((s) => s.includes('pipeline') || s.includes('revenue'))) problems.push('KPI tree stops before pipeline or revenue');
  // Platform-reported conversions are marked, not measured. A plan without a
  // way of establishing lift - or an explicit statement that there is none -
  // reports the ad platform's own homework as the result.
  const inc = a?.measurement?.incrementality;
  if (!inc || !inc.method) problems.push('measurement has no incrementality method; say how lift would be established, or say none is possible and why');
  return problems;
}

module.exports = { systemPrompt, userPrompt, validateActivation };
