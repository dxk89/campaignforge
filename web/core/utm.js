/**
 * UTM scheme.
 *
 * Every asset gets a tracking URL built from one convention, so the
 * measurement plan's "UTM discipline" line is enforced rather than hoped
 * for. Generated in code because a naming scheme has to be identical every
 * run; asking a model for it would produce a slightly different scheme each
 * time and break the reporting.
 *
 * Convention (lower-case, hyphenated):
 *   utm_source    where the click came from: linkedin | google | meta | email
 *   utm_medium    how it was bought: paid-social | cpc | email
 *   utm_campaign  <product>-<objective>-<yyyymm>
 *   utm_content   <channel>-<unit>-<lang>   e.g. linkedin-v2-en, email-3-pt, google-rsa-en
 */

const CHANNEL = {
  meta: { source: 'meta', medium: 'paid-social' },
  linkedin: { source: 'linkedin', medium: 'paid-social' },
  google: { source: 'google', medium: 'cpc' },
  email: { source: 'email', medium: 'email' },
};

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function campaignName(brief, date = new Date()) {
  const ym = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${slug(brief.productName)}-${slug(brief.objective).replace(/-/g, '')}-${ym}`;
}

function buildUrl(landing, params) {
  const base = landing && /^https?:\/\//.test(landing) ? landing : 'https://example.com/landing';
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * One tracking row per asset unit (an ad variant, the RSA, an email).
 * @returns {Array<{channel, unit, language, utm_source, utm_medium, utm_campaign, utm_content, url}>}
 */
function trackingPlan(brief, assets, localised, landing) {
  const campaign = campaignName(brief);
  const rows = [];
  const add = (channel, unit, language) => {
    const c = CHANNEL[channel];
    const content = `${channel}-${unit}-${language}`;
    rows.push({
      channel,
      unit,
      language,
      utm_source: c.source,
      utm_medium: c.medium,
      utm_campaign: campaign,
      utm_content: content,
      url: buildUrl(landing, { utm_source: c.source, utm_medium: c.medium, utm_campaign: campaign, utm_content: content }),
    });
  };
  const forSet = (set, language) => {
    if (!set) return;
    (set.meta || []).forEach((_, i) => add('meta', `v${i + 1}`, language));
    (set.linkedin || []).forEach((_, i) => add('linkedin', `v${i + 1}`, language));
    if (set.google) add('google', 'rsa', language);
    (set.email?.emails || []).forEach((_, i) => add('email', String(i + 1), language));
  };
  forSet(assets, 'en');
  forSet(localised, 'pt');
  return { campaign, landing: landing || null, rows };
}

module.exports = { trackingPlan, campaignName, slug };
