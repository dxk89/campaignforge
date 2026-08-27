/** Validate an incoming brief before spending any tokens on it. */
const OBJECTIVES = ['lead_generation', 'trial_signups', 'event_registrations', 'brand_awareness'];
const TONES = ['professional', 'direct', 'warm', 'provocative'];

function validateBrief(brief) {
  const errors = [];
  for (const f of ['productName', 'productDescription', 'targetAudience', 'objective', 'tone']) {
    if (!brief[f] || typeof brief[f] !== 'string' || !brief[f].trim()) errors.push(`${f} is required`);
  }
  if (brief.objective && !OBJECTIVES.includes(brief.objective)) errors.push('objective is not a recognised value');
  if (brief.tone && !TONES.includes(brief.tone)) errors.push('tone is not a recognised value');
  if (!Array.isArray(brief.languages) || !brief.languages.includes('en')) errors.push('languages must include "en"');
  if (brief.sources && !Array.isArray(brief.sources)) errors.push('sources must be a list');
  return errors;
}

module.exports = { validateBrief, OBJECTIVES, TONES };
