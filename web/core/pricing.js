/**
 * Pricing constants for the economics footer.
 *
 * These are deliberately hardcoded rather than fetched: the point of the
 * footer is to show that cost is a first-class design concern, and a reviewer
 * should be able to see the numbers and the date they were checked.
 *
 * Rates checked 27 Aug 2026 from Anthropic's published API pricing.
 * Model: claude-sonnet-4-6
 *   Input      : USD 3.00 per million tokens
 *   Output     : USD 15.00 per million tokens
 *   Web search : USD 10.00 per 1,000 searches (server tool, billed per search;
 *                the pages it reads are billed as ordinary input tokens)
 *
 * Image generation (optional, needs GEMINI_API_KEY), checked 27 Aug 2026:
 *   gemini-3.1-flash-image at 1K: USD 0.067 per image (1,120 output tokens
 *   at USD 60 per million). Reference images in: about USD 0.001 each,
 *   ignored here as rounding.
 *
 * Prompt caching, checked 31 Aug 2026: a write costs 1.25x the input rate and
 * a read costs 0.1x.
 *
 * This was originally left out on the grounds that the prefix shared BETWEEN
 * passes is small, which is still true. It missed the case that matters:
 * WITHIN a pass, the role and the packet are identical on every turn and a
 * pass takes four to six turns. A live copy pass sent 84,853 input tokens
 * across six calls to write one set of assets, most of it the same context
 * over and over. That prefix is written once and read thereafter.
 */

const USD_PER_MILLION_INPUT = 3.0;
const USD_PER_MILLION_OUTPUT = 15.0;

// Per-model rates, USD per million tokens. Agents pick a model each; the
// ledger prices each call at its own model's rate. Checked 27 Aug 2026.
const MODELS = {
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};
const RATES = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
};
const USD_PER_WEB_SEARCH = 10.0 / 1000;

// USD -> EUR. Update when the rate moves materially. Checked 27 Aug 2026.
const USD_TO_EUR = 0.86;

const MODEL = 'claude-sonnet-4-6';

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const USD_PER_IMAGE = 0.067;

function imageCostEur(images) {
  return images * USD_PER_IMAGE * USD_TO_EUR;
}

/**
 * Cost in EUR. Returns a number, not a string, so the caller decides on
 * rounding for display.
 */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

/**
 * Cached tokens are counted separately by the API and priced differently, so
 * they are passed separately here. Folding them into inputTokens would
 * overstate every figure on the page by roughly the amount caching saves,
 * which is the one number this project cannot afford to get wrong.
 */
function costEur(inputTokens, outputTokens, webSearches = 0, model = MODEL, cache = {}) {
  const r = RATES[model] || { input: USD_PER_MILLION_INPUT, output: USD_PER_MILLION_OUTPUT };
  const usd =
    (inputTokens / 1_000_000) * r.input +
    (outputTokens / 1_000_000) * r.output +
    ((cache.write || 0) / 1_000_000) * r.input * CACHE_WRITE_MULTIPLIER +
    ((cache.read || 0) / 1_000_000) * r.input * CACHE_READ_MULTIPLIER +
    webSearches * USD_PER_WEB_SEARCH;
  return usd * USD_TO_EUR;
}

module.exports = {
  MODEL,
  MODELS,
  RATES,
  GEMINI_IMAGE_MODEL,
  USD_PER_IMAGE,
  imageCostEur,
  USD_PER_MILLION_INPUT,
  USD_PER_MILLION_OUTPUT,
  USD_PER_WEB_SEARCH,
  USD_TO_EUR,
  costEur,
};
