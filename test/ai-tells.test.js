/**
 * The deterministic half of the DK Humaniser.
 *
 * The house standard for outreach copy is that it goes through the Humaniser
 * before it ships. Most of that catalogue needs judgement and stays with a
 * person; the banned vocabulary, the stock phrases, the em dashes and a few
 * structural shapes are literal strings, and those belong in code
 * (invariant 1). This covers the code half and the places it must NOT fire.
 */
const assert = require('assert');
const { findTells } = require('../web/core/ai-tells');
const { checkCompliance } = require('../web/core/agents/tools/compliance');

const rules = (r) => findTells(r);
const has = (list, rule, term) =>
  list.some((t) => t.rule === rule && (!term || t.term.toLowerCase().includes(term.toLowerCase())));

(async () => {
  // Tier 1 is a violation: unambiguous, and always replaceable.
  const slop = rules('A robust, seamless, comprehensive platform.');
  assert.ok(has(slop, 'ai-word', 'robust'), 'tier 1 vocabulary is caught');
  assert.ok(slop.every((t) => t.rule !== 'ai-word' || t.severity === 'violation' || t.detail.includes('tier 2') || t.detail.includes('tier 3')),
    'tier 1 words are violations');

  // Tier 2 is a warning: it has honest uses, so it is flagged, not blocked.
  const tier2 = rules('We help teams thrive.');
  assert.ok(has(tier2, 'ai-word', 'thrive'), 'tier 2 vocabulary is caught');
  assert.equal(tier2.find((t) => t.term === 'thrive').severity, 'warning', 'tier 2 is a warning');

  // Structural tells, each named so a writer can act on it.
  assert.ok(has(rules('Fast — and cheap.'), 'em-dash'), 'em dashes are caught (invariant 10)');
  assert.ok(has(rules('Not just fast, but reliable.'), 'negative-parallelism'), 'negative parallelism is caught');
  assert.ok(has(rules('It serves as a hub.'), 'copula-avoidance'), 'copula avoidance is caught');
  assert.ok(has(rules('It stands as a testament to design.'), 'ai-phrase'), 'stock phrases are caught');

  // The half that matters most: it must be quiet on good copy. A checker that
  // fires on everything gets switched off.
  const clean = [
    'Close the month four days faster. No spreadsheet.',
    'Connects to Stripe, Adyen and 2,400 banks. You review the exceptions.',
    'Start a free 14-day trial. No card required.',
    'Your finance team loses a week a month to payout matching.',
  ];
  for (const line of clean) {
    assert.deepEqual(findTells(line), [], `no false positive on: ${line}`);
  }

  // A client that genuinely uses a word is not writing slop.
  assert.deepEqual(findTells('Seamless is our product.', { allow: ['Seamless'] }), [],
    'house terms are exempt');
  assert.ok(has(findTells('Seamless is our product.'), 'ai-word'), 'and only when declared');

  // Word boundaries. A term inside a longer word is not that term: "delved"
  // is not "delve", "elevated" is not "elevate". Getting this wrong is how a
  // checker earns a reputation for crying wolf and stops being read.
  assert.deepEqual(findTells('They delved deeper from an elevated position.'), [],
    'a banned term inside a longer word is not a match');
  assert.ok(has(findTells('We foster growth.'), 'ai-word', 'foster'),
    'but the term on its own still is');

  // Through the gate, which is how an agent actually meets it.
  const flags = checkCompliance({ headline: 'A robust platform — built to thrive.' }, { houseTerms: [] });
  assert.ok(flags.some((f) => f.rule === 'ai-word' && f.severity === 'violation'), 'gate reports tier 1 as a violation');
  assert.ok(flags.some((f) => f.rule === 'em-dash'), 'gate reports em dashes');
  assert.equal(flags.filter((f) => f.rule === 'superlative' && /robust/.test(f.detail)).length, 0,
    'a word caught as AI vocabulary is not also reported as a superlative');

  // Portuguese is out of scope: vital and crucial are ordinary Portuguese.
  assert.deepEqual(
    checkCompliance({ h: 'Uma ferramenta vital e crucial para a equipa.' }, { language: 'pt' }), [],
    'the English vocabulary list does not run over pt-PT copy'
  );

  console.log('ai-tell tests: ok');
})().catch((e) => { console.error('ai-tell tests FAILED', e); process.exit(1); });

/**
 * Prompt caching and what it costs.
 *
 * A pass takes four to six turns and re-sent the same role and packet on
 * every one of them: a live copy pass spent 84,853 input tokens writing one
 * set of assets. The prefix is written to the cache once and read after that.
 *
 * The pricing half matters as much as the caching half. Cached tokens are
 * counted separately by the API and priced differently, so folding them into
 * the input count would overstate every figure on the page by about the
 * amount caching saves.
 */
(async () => {
  const c = require('assert');
  const fs = require('fs');
  const path = require('path');
  const { costEur } = require('../web/core/pricing');

  // A read is a tenth of the input rate, a write is a quarter more than it.
  const base = costEur(10000, 0);
  c.ok(Math.abs(costEur(0, 0, 0, undefined, { read: 10000 }) - base * 0.1) < 1e-9, 'a cache read is 0.1x input');
  c.ok(Math.abs(costEur(0, 0, 0, undefined, { write: 10000 }) - base * 1.25) < 1e-9, 'a cache write is 1.25x input');
  c.equal(costEur(10000, 0, 0, undefined, {}), base, 'no cache tokens changes nothing');

  // The shape a real pass takes: one write, then reads on the later turns.
  const uncached = costEur(60000, 20000);
  const cached = costEur(12000, 20000, 0, undefined, { write: 10000, read: 38000 });
  c.ok(cached < uncached, 'caching a repeated prefix costs less than re-sending it');

  const runtime = fs.readFileSync(path.join(__dirname, '..', 'web', 'core', 'agents', 'runtime.js'), 'utf8');
  c.ok(/system: \[\{ type: 'text', text: agent\.role, cache_control/.test(runtime), 'the role is cached');
  c.ok(/cache_creation_input_tokens/.test(runtime) && /cache_read_input_tokens/.test(runtime),
    'both cache counters are read from the response');
  c.ok(/write: usage\.cacheWrite, read: usage\.cacheRead/.test(runtime),
    'and they reach the price, rather than being counted as ordinary input');

  console.log('caching tests: ok');
})().catch((e) => { console.error('caching tests FAILED', e); process.exit(1); });
