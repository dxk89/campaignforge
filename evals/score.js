/**
 * Scoring. Every scorer is a pure function of an agent's output and the
 * brief's expectations, so a score can be recomputed from a stored run and
 * argued with.
 *
 * All scores are 0 to 1, higher is better. A composite per agent is the mean
 * of the scorers that apply to it.
 */

const { validateAssets, validateSocial } = require('../lib/limits');
const { checkCompliance } = require('../lib/agents/tools/compliance');
const { validateActivation } = require('../lib/prompts/activation');

const clamp = (n) => Math.max(0, Math.min(1, n));
const flatten = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => flatten(x, out));
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (!['svg', 'image', 'source', 'sources'].includes(k)) flatten(x, out); });
  return out;
};

/** Hard character-limit compliance across an asset set. */
function limits(output, { agent, language = 'en' }) {
  if (agent === 'copywriter' || agent === 'localiser') {
    const issues = validateAssets(output, language).filter((i) => i.severity === 'violation');
    const fields = flatten(output).length || 1;
    return clamp(1 - issues.length / fields);
  }
  if (agent === 'social-planner') {
    const issues = validateSocial(output, language).filter((i) => i.severity === 'violation');
    return clamp(1 - issues.length / ((output.posts || []).length || 1));
  }
  return null;
}

/** Avoid terms and banned words leaking into the copy. */
function avoidLeak(output, { expected, context }) {
  const avoid = [...(expected.avoidTerms || []), ...((context?.voice?.avoid_terms) || [])];
  if (!avoid.length) return null;
  const flags = checkCompliance(output, { avoid, competitors: [], approvedClaims: null });
  const hits = flags.filter((f) => f.rule === 'avoid').length;
  return clamp(1 - hits / 5);
}

/**
 * Claim traceability: every number or comparative in the copy should be
 * covered by an expected claim. This is the scorer that catches invention.
 */
function claimTrace(output, { expected }) {
  const text = flatten(output).join(' ').toLowerCase();
  const claimy = text.match(/\b\d[\d,.]*\s?(%|percent|x\b|days?|hours?|weeks?|months?|banks?|customers?|users?)/g) || [];
  if (!claimy.length) return 1;
  const allowed = (expected.claims || []).map((c) => c.toLowerCase());
  const covered = claimy.filter((hit) => allowed.some((a) => a.includes(hit.trim()) || hit.trim().includes(a.split(' ')[0])));
  return clamp(covered.length / claimy.length);
}

/** Strings the brief says must never appear. The adversarial cases hinge on this. */
function forbidden(output, { expected }) {
  const must = expected.mustNotContain || [];
  if (!must.length) return null;
  const text = flatten(output).join(' ').toLowerCase();
  const hits = must.filter((m) => text.includes(String(m).toLowerCase()));
  return hits.length ? 0 : 1;
}

/** Structural validity per agent. Binary: it holds together or it does not. */
function structure(output, { agent }) {
  if (agent === 'strategist') {
    const names = (output.angles || []).map((a) => a.name);
    return names.length === 3 && names.includes(output.lead_angle) ? 1 : 0;
  }
  if (agent === 'copywriter') {
    return (output.meta?.length === 3 && output.linkedin?.length === 3
      && output.google?.headlines?.length === 8 && output.google?.descriptions?.length === 4
      && output.email?.emails?.length === 3) ? 1 : 0;
  }
  if (agent === 'social-planner') return (output.posts || []).length === 32 ? 1 : 0;
  if (agent === 'ops-architect') return validateActivation(output).length === 0 ? 1 : 0;
  if (agent === 'landing-writer') return (output.form?.fields?.length || 0) <= 6 && (output.hero?.headline) ? 1 : 0;
  return null;
}

/** Every audience phrase should carry a URL. */
function citations(output, { agent }) {
  if (agent !== 'customer-researcher') return null;
  const urls = (output.sources || []).filter((u) => /^https?:\/\//.test(u));
  const entries = [...(output.language || []), ...(output.pains || [])].length;
  if (!entries) return 1;
  return urls.length ? 1 : 0;
}

/** Brazilian forms in copy that should be European Portuguese. */
function ptPurity(output, { expected }) {
  if (expected.language !== 'pt') return null;
  const flags = checkCompliance(output, { language: 'pt' }).filter((f) => f.rule === 'pt-br');
  return flags.length ? 0 : 1;
}

const SCORERS = { limits, avoidLeak, claimTrace, forbidden, structure, citations, ptPurity };

/**
 * Score one agent's output. Returns the applicable scorers and a composite.
 * Scorers that do not apply return null and are excluded from the mean rather
 * than counted as zero, so an agent is never punished for a test that is not
 * about it.
 */
function scoreOutput(agent, output, ctx) {
  if (!output) return { composite: 0, scores: {}, note: 'no output' };
  const scores = {};
  for (const [name, fn] of Object.entries(SCORERS)) {
    const v = fn(output, { ...ctx, agent });
    if (v !== null && v !== undefined) scores[name] = Number(v.toFixed(3));
  }
  const values = Object.values(scores);
  return { composite: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3)) : null, scores };
}

/** Roll per-brief results into per-agent averages. */
function aggregate(runs) {
  const byAgent = {};
  for (const run of runs) {
    for (const [agent, r] of Object.entries(run.agents || {})) {
      if (!byAgent[agent]) byAgent[agent] = { briefs: 0, complete: 0, composite: [], scores: {}, costEur: 0, ms: 0 };
      const a = byAgent[agent];
      a.briefs++;
      a.complete += r.complete ? 1 : 0;
      a.costEur += r.usage?.costEur || 0;
      a.ms += r.usage?.ms || 0;
      if (r.composite !== null && r.composite !== undefined) a.composite.push(r.composite);
      for (const [k, v] of Object.entries(r.scores || {})) {
        (a.scores[k] = a.scores[k] || []).push(v);
      }
    }
  }
  const mean = (xs) => (xs.length ? Number((xs.reduce((x, y) => x + y, 0) / xs.length).toFixed(3)) : null);
  const out = {};
  for (const [agent, a] of Object.entries(byAgent)) {
    out[agent] = {
      briefs: a.briefs,
      complete: Number((a.complete / a.briefs).toFixed(3)),
      composite: mean(a.composite),
      scores: Object.fromEntries(Object.entries(a.scores).map(([k, v]) => [k, mean(v)])),
      costEur: Number(a.costEur.toFixed(4)),
      msPerBrief: Math.round(a.ms / a.briefs),
    };
  }
  return out;
}

module.exports = { scoreOutput, aggregate, SCORERS };
