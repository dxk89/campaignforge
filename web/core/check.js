/**
 * Every deterministic verdict this codebase has, over one string.
 *
 * The checks already exist and are already pure; what they lacked was a way
 * in that did not involve running an agent pass. Someone writing a post by
 * hand got none of them.
 *
 * Reports, never rewrites (invariant 5). Stores nothing: ad-hoc copy is not a
 * campaign asset, and not storing it makes the data question easy to answer.
 */
const { LIMITS, SOCIAL_CHANNELS } = require('./limits');
const { checkCompliance } = require('./agents/tools/compliance');

/**
 * Why each rule exists, in one sentence. A flag a reader cannot act on is
 * noise, and most people meeting these rules did not write them.
 */
const WHY = {
  avoid: 'The client asked not to use this word.',
  competitor: 'Naming a competitor in your own ad argues their case for them.',
  superlative: 'Brochure language. It makes a claim without making a point.',
  placeholder: 'Scaffolding left in the copy. It will ship if nobody catches it.',
  brand: 'The brand name has a registered spelling and this is not it.',
  claim: 'A number or comparison nobody has approved. Legal risk, not style.',
  'pt-br': 'Brazilian Portuguese in copy marked as European Portuguese.',
  'ai-word': 'Vocabulary that marks text as machine-written.',
  'ai-phrase': 'A stock phrase that marks text as machine-written.',
  'em-dash': 'House style. Use a comma, a semicolon, brackets, or two sentences.',
  'negative-parallelism': 'Say the second half on its own; the construction usually hides a weaker claim.',
  'copula-avoidance': 'Write "is". It is shorter and it commits to something.',
  'false-range': 'List them or pick one. The reader looks for a relationship that is not there.',
  'curly-quote': 'Use the straight version; most ad platform fields will not render this one.',
  'decorative-emoji': 'Decoration standing in for a point.',
};

/** Every place a single line could go, and whether it fits. */
function lengths(chars, channel) {
  const fits = [];
  const over = [];
  const place = (ch, field, limit) => {
    const row = { channel: ch, field, limit };
    if (chars > limit) over.push({ ...row, by: chars - limit });
    else fits.push(row);
  };

  for (const [ch, fields] of Object.entries(LIMITS)) {
    if (channel && ch !== channel) continue;
    for (const [field, rule] of Object.entries(fields)) {
      // body_words is a word count, not a character limit.
      if (field === 'body_words' || !rule || typeof rule.max !== 'number') continue;
      place(ch, field, rule.max);
    }
  }
  for (const [ch, c] of Object.entries(SOCIAL_CHANNELS)) {
    if (channel && ch !== channel) continue;
    place(ch, 'post', c.text.max);
  }
  return { fits, over };
}

/**
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.channel]  Report only this channel.
 * @param {object} [opts.rules]    The client's rules, as buildRules returns.
 */
function checkCopy(text, opts = {}) {
  const value = String(text == null ? '' : text);
  const chars = value.length;
  const rules = opts.rules || null;
  const { fits, over } = lengths(chars, opts.channel || null);

  // checkCompliance walks an object and reports a path per string, so the
  // text is handed to it as one field. It runs the AI-tell catalogue
  // internally, which is why findTells is not called again here.
  const flags = checkCompliance({ text: value }, rules || {}).map((f) => ({
    rule: f.rule,
    detail: f.detail,
    severity: f.severity,
    why: WHY[f.rule] || 'See docs/COPY-CHECKS.md.',
  }));

  // Over a limit only counts as a violation when a channel was named. With no
  // channel, being too long for a Google headline says nothing about whether
  // the line works as a LinkedIn post.
  const tooLong = Boolean(opts.channel) && over.length > 0;
  const verdict = flags.some((f) => f.severity === 'violation') || tooLong
    ? 'violations'
    : flags.length ? 'warnings' : 'clean';

  return {
    text: value,
    chars,
    channel: opts.channel || null,
    fits,
    over,
    flags,
    ranWithoutClientRules: !rules,
    verdict,
  };
}

module.exports = { checkCopy, WHY };
