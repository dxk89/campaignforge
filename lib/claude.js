/**
 * Thin wrapper around the Anthropic SDK.
 *
 * Every pass in the chain wants the same thing: send a system prompt and a
 * user prompt, get back a JSON object, and know how many tokens it cost.
 * Centralising that here keeps the prompt files focused on the prompts.
 *
 * MOCK_CLAUDE=1 swaps in fixtures (see mock.js) so the UI runs with no key.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { MODEL } = require('./pricing');
const { mockCall } = require('./mock');

const MOCK = process.env.MOCK_CLAUDE === '1';

if (!MOCK && !process.env.ANTHROPIC_API_KEY) {
  // Fail loudly at startup rather than on the first request.
  throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in, or run with MOCK_CLAUDE=1.');
}

const client = MOCK ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Strip markdown code fences and any preamble the model might add despite
 * being told not to. We ask for JSON only, but "parse defensively" means
 * assuming the instruction will occasionally be ignored.
 */
function extractJson(text) {
  let cleaned = text.trim();

  // Remove ```json ... ``` or ``` ... ``` wrappers.
  const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) cleaned = fence[1].trim();

  // If there's still chatter around the object, take the outermost braces.
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first > 0 || (last !== -1 && last < cleaned.length - 1)) {
    cleaned = cleaned.slice(first, last + 1);
  }

  return JSON.parse(cleaned);
}

/**
 * Make one JSON-only call to Claude.
 *
 * @param {object} opts
 * @param {string} opts.system      System prompt for this pass.
 * @param {string} opts.user        User prompt (the brief, prior JSON, etc).
 * @param {number} [opts.maxTokens] Output ceiling. Asset pass needs more room.
 * @param {string} opts.label       Pass name, for logs and error messages.
 * @param {boolean} [opts.webSearch] Give the model the API web search tool.
 * @param {number} [opts.maxSearches] Cap on searches when webSearch is on.
 * @returns {Promise<{data: object, usage: {input: number, output: number, webSearches: number}, ms: number}>}
 */
async function callJson({ system, user, maxTokens = 2048, label, webSearch = false, maxSearches = 5 }) {
  if (MOCK) return mockCall(label);

  const started = Date.now();

  const request = {
    model: MODEL,
    max_tokens: maxTokens,
    // Low temperature: we want consistent structure, not creative variance
    // in the JSON shape. Creativity lives in the prompt instructions.
    temperature: 0.4,
    system,
    messages: [{ role: 'user', content: user }],
  };

  if (webSearch) {
    // Server-side tool: Anthropic runs the searches, the model reads the
    // results, and we get one response. Capped so research can't run away.
    request.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }];
  }

  const response = await client.messages.create(request);
  const ms = Date.now() - started;

  // With web search on, the response interleaves tool blocks with text
  // blocks. The JSON lives in the text blocks; join them.
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  let data;
  try {
    data = extractJson(text);
  } catch (err) {
    // Surface enough of the raw output to debug, but not the whole thing.
    const preview = text.slice(0, 300).replace(/\s+/g, ' ');
    const error = new Error(`${label} pass returned non-JSON output: ${preview}`);
    error.pass = label;
    throw error;
  }

  const usage = {
    input: response.usage?.input_tokens ?? 0,
    output: response.usage?.output_tokens ?? 0,
    webSearches: response.usage?.server_tool_use?.web_search_requests ?? 0,
  };

  console.log(
    `[${label}] ${usage.input} in / ${usage.output} out tokens` +
      (usage.webSearches ? `, ${usage.webSearches} searches` : '') +
      `, ${ms} ms, stop=${response.stop_reason}`
  );

  if (response.stop_reason === 'max_tokens') {
    // The JSON parsed, but it may have been cut off mid-list. The validator
    // will catch missing variants; log so it shows in Render logs.
    console.warn(`[${label}] hit max_tokens (${maxTokens}); output may be truncated`);
  }

  return { data, usage, ms };
}

module.exports = { callJson, extractJson, MOCK };
