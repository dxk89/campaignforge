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
 * Prompt caching is not used. The research pass distils sources into a short
 * context block, so the shared prefix across later passes is small and the
 * cache write premium would cost more than it saves at this volume.
 * ARCHITECTURE.md covers where caching would apply in production.
 */

const USD_PER_MILLION_INPUT = 3.0;
const USD_PER_MILLION_OUTPUT = 15.0;
const USD_PER_WEB_SEARCH = 10.0 / 1000;

// USD -> EUR. Update when the rate moves materially. Checked 27 Aug 2026.
const USD_TO_EUR = 0.86;

const MODEL = 'claude-sonnet-4-6';

/**
 * Cost in EUR. Returns a number, not a string, so the caller decides on
 * rounding for display.
 */
function costEur(inputTokens, outputTokens, webSearches = 0) {
  const usd =
    (inputTokens / 1_000_000) * USD_PER_MILLION_INPUT +
    (outputTokens / 1_000_000) * USD_PER_MILLION_OUTPUT +
    webSearches * USD_PER_WEB_SEARCH;
  return usd * USD_TO_EUR;
}

module.exports = {
  MODEL,
  USD_PER_MILLION_INPUT,
  USD_PER_MILLION_OUTPUT,
  USD_PER_WEB_SEARCH,
  USD_TO_EUR,
  costEur,
};
