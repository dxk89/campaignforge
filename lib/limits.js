/**
 * Channel character limits.
 *
 * Two kinds of limit:
 *   hard  - the platform will reject or truncate the field (Meta headline,
 *           Google RSA headline). A breach is a violation.
 *   soft  - a length target for quality, not a platform rule (Meta primary
 *           text "~125"). A breach is a warning.
 *
 * The same table is injected into the asset and localisation prompts, so the
 * model and the validator are always working from one definition.
 */

const LIMITS = {
  meta: {
    primary_text: { max: 125, hard: false },
    headline: { max: 40, hard: true },
    description: { max: 30, hard: true },
  },
  linkedin: {
    intro_text: { max: 150, hard: false },
    headline: { max: 70, hard: true },
  },
  google: {
    headline: { max: 30, hard: true, count: 8 },
    description: { max: 90, hard: true, count: 4 },
  },
  email: {
    subject: { max: 60, hard: true },
    preview_text: { max: 90, hard: false },
    body_words: { max: 180, min: 110, hard: false }, // "~150 words"
  },
};

/** Human-readable version for the prompts. */
function limitsForPrompt() {
  return [
    'Meta ads (3 variants): primary_text about 125 chars (soft), headline max 40 chars (hard), description max 30 chars (hard).',
    'LinkedIn ads (3 variants): intro_text about 150 chars (soft), headline max 70 chars (hard).',
    'Google responsive search ad: exactly 8 headlines max 30 chars each (hard), exactly 4 descriptions max 90 chars each (hard).',
    'Email nurture (3 emails): subject max 60 chars (hard), preview_text about 90 chars (soft), body about 150 words.',
    'Character counts include spaces and punctuation. Hard limits are platform rules and will be rejected if breached.',
  ].join('\n');
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Check one field. Returns null if fine, otherwise an issue object.
 */
function check(channel, index, field, value, rule) {
  const length = String(value || '').length;
  if (length > rule.max) {
    return {
      channel,
      index,
      field,
      length,
      limit: rule.max,
      severity: rule.hard ? 'violation' : 'warning',
    };
  }
  return null;
}

/**
 * Validate a full asset set (English or localised; same shape).
 *
 * @param {object} assets  { meta: [], linkedin: [], google: {}, email: {} }
 * @param {string} language  'en' | 'pt' for tagging issues
 * @returns {Array<object>} issues, each with severity 'violation' or 'warning'
 */
function validateAssets(assets, language) {
  const issues = [];
  const push = (i) => i && issues.push({ ...i, language });

  (assets.meta || []).forEach((ad, i) => {
    for (const field of Object.keys(LIMITS.meta)) {
      push(check('meta', i, field, ad[field], LIMITS.meta[field]));
    }
  });

  (assets.linkedin || []).forEach((ad, i) => {
    for (const field of Object.keys(LIMITS.linkedin)) {
      push(check('linkedin', i, field, ad[field], LIMITS.linkedin[field]));
    }
  });

  const g = assets.google || {};
  (g.headlines || []).forEach((h, i) => push(check('google', i, 'headline', h, LIMITS.google.headline)));
  (g.descriptions || []).forEach((d, i) => push(check('google', i, 'description', d, LIMITS.google.description)));
  if ((g.headlines || []).length !== LIMITS.google.headline.count) {
    issues.push({ channel: 'google', index: null, field: 'headlines', length: (g.headlines || []).length, limit: LIMITS.google.headline.count, severity: 'violation', language, note: 'wrong count' });
  }
  if ((g.descriptions || []).length !== LIMITS.google.description.count) {
    issues.push({ channel: 'google', index: null, field: 'descriptions', length: (g.descriptions || []).length, limit: LIMITS.google.description.count, severity: 'violation', language, note: 'wrong count' });
  }

  const e = assets.email || {};
  (e.emails || []).forEach((mail, i) => {
    push(check('email', i, 'subject', mail.subject, LIMITS.email.subject));
    push(check('email', i, 'preview_text', mail.preview_text, LIMITS.email.preview_text));
    const words = wordCount(mail.body);
    if (words > LIMITS.email.body_words.max || words < LIMITS.email.body_words.min) {
      issues.push({ channel: 'email', index: i, field: 'body', length: words, limit: LIMITS.email.body_words.max, severity: 'warning', language, note: `${words} words` });
    }
  });

  return issues;
}

module.exports = { LIMITS, limitsForPrompt, validateAssets, wordCount };
