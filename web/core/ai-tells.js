/**
 * AI writing tells, as a deterministic check.
 *
 * The house standard for outreach copy is the DK Humaniser: a catalogue of 29
 * named patterns and a tiered banned vocabulary, drawn from Wikipedia's "Signs
 * of AI writing". Most of that catalogue needs judgement - paragraph rhythm,
 * whether a claim hovers at abstraction - and belongs to a person or a model.
 * The rest is a list of literal strings, which is code (invariant 1).
 *
 * This is the code half. It is offered to writing agents as a tool and
 * enforced on submit through the compliance checker, so the same function
 * warns early and gates late (invariant 3).
 *
 * Severities follow how load-bearing the tell is:
 *   violation - an em dash, a Tier 1 word, or a stock phrase. Unambiguous,
 *               and always replaceable without changing the meaning.
 *   warning   - Tier 2 and 3 vocabulary and the structural tells, which have
 *               honest uses. Flagged for a person, never blocked
 *               (invariant 5).
 *
 * A term the client actually uses is not a tell. Anything in the brand's
 * preferred terms, glossary or product name is exempt, so a product called
 * Seamless does not fail its own campaign.
 */

// Strongest tells. The Humaniser's Tier 1: handled by its deterministic pass.
const TIER1 = [
  'delve', 'leverage', 'tapestry', 'myriad', 'plethora', 'realm', 'landscape',
  'ever-evolving', 'ever-changing', 'robust', 'seamless', 'comprehensive',
  'holistic', 'intricate', 'multifaceted', 'underscore', 'showcase',
  'facilitate', 'embark', 'foster', 'elevate', 'transformative',
  'groundbreaking', 'pivotal', 'vibrant', 'bustling', 'nestled', 'boasts',
  'renowned', 'esteemed', 'stellar', 'unparalleled', 'cutting-edge',
  'state-of-the-art', 'garner', 'enhance', 'utilise', 'utilize',
];

// Rewrite when they cluster. Common enough in honest copy to stay warnings.
const TIER2 = [
  'align with', 'crucial', 'emphasizing', 'enduring', 'fostering', 'interplay',
  'intricacies', 'navigate', 'navigating', 'paradigm', 'profound', 'testament',
  'valuable', 'vital', 'embrace', 'unlock', 'unleash', 'harness', 'thrive',
  'redefine', 'reimagine', 'reshape', 'revolutionize', 'revolutionise',
  'empower', 'empowering', 'ensure', 'ensuring', 'optimize', 'optimise',
  'streamline', 'scalable', 'frictionless',
];

const TIER3 = [
  'encompass', 'encompassing', 'fundamental', 'immerse', 'integral',
  'paramount', 'profoundly', 'resonate', 'underpin', 'underpinning',
];

// Phrases the Humaniser says to avoid in any rewrite, regardless of context.
const PHRASES = [
  "in today's", 'in the realm of', 'in the heart of',
  'navigate the complexities of', 'unlock the potential of',
  'harness the power of', 'the ever-evolving landscape of',
  'stands as a testament to', 'serves as a reminder that',
  'plays a pivotal role in', 'is a key driver of', 'at the forefront of',
];

/**
 * Structural tells. Each is a shape rather than a word, so they carry an
 * explanation: a writer told only that a sentence "looks like AI" cannot act
 * on it, whereas "negative parallelism" plus the match can be rewritten.
 */
const STRUCTURES = [
  { rule: 'em-dash', re: /[—–]/, severity: 'violation',
    note: 'em dash: use a comma, semicolon or brackets' },
  { rule: 'negative-parallelism', re: /\b(?:not|isn't|isn’t|is not)\s+(?:just|only|merely|simply)\b[^.!?]{0,60}?,?\s+but\b/i, severity: 'warning',
    note: '"not just X, but Y" is a stock AI shape' },
  { rule: 'copula-avoidance', re: /\b(?:serves as|stands as|acts as)\b/i, severity: 'warning',
    note: 'says "serves as" where "is" would do' },
  { rule: 'false-range', re: /\bfrom\s+\w[\w\s]{0,20}\s+to\s+\w[\w\s]{0,20}\b(?=[,.])/i, severity: 'warning',
    note: 'a "from X to Y" range where X and Y are not on a scale' },
  { rule: 'curly-quote', re: /[“”‘’]/, severity: 'warning',
    note: 'curly quotes, which the model inserts and a form field will not' },
  { rule: 'decorative-emoji', re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, severity: 'warning',
    note: 'decorative emoji' },
];

// No regex is needed to find these: every term is letters, hyphens and
// apostrophes, so a scan with a check on the characters either side is both
// simpler and immune to the escaping bugs a built pattern invites.
const WORDISH = /[\w'’-]/;
function hasTerm(text, term) {
  const hay = text.toLowerCase();
  const needle = term.toLowerCase();
  let i = hay.indexOf(needle);
  while (i !== -1) {
    const before = i === 0 ? '' : hay[i - 1];
    const after = hay[i + needle.length] || '';
    if (!WORDISH.test(before) && !WORDISH.test(after)) return true;
    i = hay.indexOf(needle, i + 1);
  }
  return false;
}

/**
 * @param {string} text
 * @param {object} [opts]
 * @param {string[]} [opts.allow]  Terms the client genuinely uses.
 * @returns {Array<{rule: string, term: string, detail: string, severity: string}>}
 */
function findTells(text, opts = {}) {
  if (!text || typeof text !== 'string') return [];
  const allow = new Set((opts.allow || []).filter(Boolean).map((t) => String(t).toLowerCase()));
  const found = [];
  const seen = new Set();
  const add = (rule, term, detail, severity) => {
    const key = rule + '|' + term.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ rule, term, detail, severity });
  };

  for (const phrase of PHRASES) {
    if (allow.has(phrase.toLowerCase())) continue;
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      add('ai-phrase', phrase, `stock phrase "${phrase}"`, 'violation');
    }
  }
  for (const [tier, words, severity] of [['1', TIER1, 'violation'], ['2', TIER2, 'warning'], ['3', TIER3, 'warning']]) {
    for (const w of words) {
      if (allow.has(w.toLowerCase())) continue;
      if (hasTerm(text, w)) add('ai-word', w, `tier ${tier} AI vocabulary "${w}"`, severity);
    }
  }
  for (const s of STRUCTURES) {
    const m = text.match(s.re);
    if (m) add(s.rule, m[0].trim() || s.rule, s.note, s.severity);
  }
  return found;
}

module.exports = { findTells, TIER1, TIER2, TIER3, PHRASES, STRUCTURES };
