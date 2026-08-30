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

/**
 * The social channels a campaign can be planned for.
 *
 * Each carries what the planner needs to write for it: the platform's own
 * limits, a default weekly cadence, and one line on who is actually reading,
 * because the same angle lands differently on LinkedIn and TikTok, and a
 * planner told only "write for TikTok" writes LinkedIn copy with hashtags.
 *
 * Limits checked 2026-08-30. Platforms move them, so invariant 6's habit
 * applies here too: a change carries the date it was checked.
 */
const SOCIAL_CHANNELS = {
  linkedin: {
    label: 'LinkedIn', perWeek: 3, wantsGraphic: true,
    text: { max: 3000, hard: true, soft: 1300 }, hashtags: 5,
    note: 'professional feed, truncated after the first line, so the opening line has to work alone',
  },
  x: {
    label: 'X', perWeek: 3, wantsGraphic: false,
    text: { max: 280, hard: true }, hashtags: 3,
    note: 'one complete thought, no threads, and the hashtags count towards the limit',
  },
  instagram: {
    label: 'Instagram', perWeek: 2, wantsGraphic: 'always',
    text: { max: 2200, hard: true }, hashtags: 30,
    note: 'the image carries the post and the caption explains it; aim for five to eight hashtags rather than thirty',
  },
  facebook: {
    label: 'Facebook', perWeek: 2, wantsGraphic: true,
    text: { max: 63206, hard: true, soft: 500 }, hashtags: 3,
    note: 'a broader, less specialist audience than LinkedIn; the same point with less jargon',
  },
  tiktok: {
    label: 'TikTok', perWeek: 2, wantsGraphic: false,
    text: { max: 2200, hard: true, soft: 150 }, hashtags: 5,
    note: 'the caption supports a video that does not exist yet, so write it as the hook for one',
  },
  threads: {
    label: 'Threads', perWeek: 3, wantsGraphic: false,
    text: { max: 500, hard: true }, hashtags: 3,
    note: 'conversational and short: a remark rather than a post',
  },
  youtube: {
    label: 'YouTube', perWeek: 1, wantsGraphic: true,
    text: { max: 5000, hard: true, soft: 300 }, hashtags: 3,
    note: 'a video or Shorts description, of which only the first two lines show before the fold',
  },
  pinterest: {
    label: 'Pinterest', perWeek: 2, wantsGraphic: 'always',
    text: { max: 500, hard: true }, hashtags: 3,
    note: 'search-led rather than feed-led, so say plainly what the pin is for',
  },
};

const DEFAULT_SOCIAL_CHANNELS = ['linkedin', 'x', 'instagram'];

/**
 * The paid and owned channels the copy pass writes for. Order matters: it is
 * the order the assets appear in, and the order the writer works through.
 */
const AD_CHANNELS = { meta: 'Meta', linkedin: 'LinkedIn', google: 'Google', email: 'Email' };
const DEFAULT_AD_CHANNELS = Object.keys(AD_CHANNELS);

/** The ad channels this campaign runs, defaulting to all of them. */
function adChannelsFor(list) {
  const chosen = (list || []).filter((c) => AD_CHANNELS[c]);
  return chosen.length ? chosen : DEFAULT_AD_CHANNELS;
}

// The shape validateSocial has always read, derived so there is one catalogue.
const SOCIAL_LIMITS = Object.fromEntries(
  Object.entries(SOCIAL_CHANNELS).map(([k, c]) => [k, { text: c.text, hashtags: c.hashtags }])
);

/** The channels this campaign is for, falling back to the original three. */
function socialChannelsFor(list) {
  const chosen = (list || []).filter((c) => SOCIAL_CHANNELS[c]);
  return chosen.length ? chosen : DEFAULT_SOCIAL_CHANNELS;
}

function socialLimitsForPrompt(list) {
  return socialChannelsFor(list).map((k) => {
    const c = SOCIAL_CHANNELS[k];
    const soft = c.text.soft ? `, aim under ${c.text.soft.toLocaleString('en-GB')}` : '';
    const incl = k === 'x' ? ' INCLUDING hashtags' : '';
    return `${c.label}: max ${c.text.max.toLocaleString('en-GB')} chars${incl} (hard)${soft}; up to ${c.hashtags} hashtags. ${c.note}.`;
  }).join('\n');
}

/** Posts per channel across four weeks, and the total. */
function socialPlan(list) {
  const chosen = socialChannelsFor(list);
  const per = chosen.map((k) => ({ channel: k, ...SOCIAL_CHANNELS[k], total: SOCIAL_CHANNELS[k].perWeek * 4 }));
  return { channels: chosen, per, total: per.reduce((n, c) => n + c.total, 0) };
}

/**
 * Validate a social calendar. Text length for X counts hashtags, since they
 * are part of the post. Returns issues shaped like validateAssets's.
 */
function validateSocial(cal, language = 'en') {
  const issues = [];
  const posts = cal?.posts || [];
  posts.forEach((p, i) => {
    const rule = SOCIAL_LIMITS[p.channel];
    if (!rule) { issues.push({ channel: 'social', index: i, field: 'channel', length: 0, limit: 0, severity: 'violation', language, note: `unknown channel ${p.channel}` }); return; }
    const tags = (p.hashtags || []).map((t) => '#' + String(t).replace(/^#/, ''));
    const full = p.channel === 'x' ? [p.text, ...tags].join(' ') : String(p.text || '');
    if (full.length > rule.text.max) issues.push({ channel: 'social', index: i, field: `${p.channel} day ${p.day}`, length: full.length, limit: rule.text.max, severity: 'violation', language });
    else if (rule.text.soft && full.length > rule.text.soft) issues.push({ channel: 'social', index: i, field: `${p.channel} day ${p.day}`, length: full.length, limit: rule.text.soft, severity: 'warning', language });
    if (tags.length > rule.hashtags) issues.push({ channel: 'social', index: i, field: `${p.channel} day ${p.day} hashtags`, length: tags.length, limit: rule.hashtags, severity: 'warning', language });
  });
  if (posts.length && posts.length !== 32) issues.push({ channel: 'social', index: null, field: 'posts', length: posts.length, limit: 32, severity: 'warning', language, note: 'wrong count' });
  return issues;
}

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

module.exports = { LIMITS, SOCIAL_LIMITS, SOCIAL_CHANNELS, AD_CHANNELS, DEFAULT_AD_CHANNELS, adChannelsFor, DEFAULT_SOCIAL_CHANNELS, socialChannelsFor, socialPlan, limitsForPrompt, socialLimitsForPrompt, validateAssets, validateSocial, wordCount };
