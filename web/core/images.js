/**
 * Image generation via the Gemini API.
 *
 * Division of labour, same as everywhere else in this codebase:
 *   Claude   writes the visual brief for each post (social pass, image_prompt)
 *   Gemini   makes the picture, guided by the brand kit and the client's own
 *            artwork as reference images
 *   code     composites the logo and exports the PNG (browser, canvas)
 *
 * Images are generated on demand from the Social tab, never automatically,
 * because at roughly seven cents each a month of them is a visible line on
 * the bill and the person running the campaign should choose which posts
 * earn a photo.
 *
 * Plain fetch against the REST endpoint rather than an SDK: one call, one
 * shape, nothing to keep up to date.
 */

const { GEMINI_IMAGE_MODEL, imageCostEur } = require('./pricing');

const MOCK = process.env.MOCK_CLAUDE === '1';
const KEY = process.env.GEMINI_API_KEY || '';
const ENDPOINT = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const available = () => MOCK || Boolean(KEY);

/** Turn the brand kit into style guidance the image model can act on. */
function styleBlock(brandKit) {
  if (!brandKit) return 'Clean, modern, editorial business photography or flat illustration.';
  const accents = brandKit.palette?.accents || [];
  const parts = [];
  if (brandKit.siteName) parts.push(`Brand: ${brandKit.siteName}.`);
  if (accents.length) parts.push(`Brand colours to feature: ${accents.join(', ')}. Use them as the dominant palette.`);
  if (brandKit.assets?.artwork?.length) parts.push('Match the visual style, mood and colour treatment of the attached reference images.');
  parts.push('No text, no letters, no logos, no watermarks in the image. Leave the lower-right corner uncluttered for a logo overlay.');
  return parts.join(' ');
}

/**
 * @param {object} opts
 * @param {string} opts.prompt        Visual brief from the social pass.
 * @param {object} [opts.brandKit]    Palette, name, and optionally assets.artwork[] as data URLs.
 * @param {string} [opts.aspect]      '1:1' (default), '4:5', '16:9'
 * @returns {Promise<{mime: string, data: string, usage: {images: number, costEur: number, ms: number}}>}
 */
async function generateImage({ prompt, brandKit, aspect = '1:1' }) {
  const started = Date.now();

  if (MOCK) {
    // A placeholder that looks like an image and costs nothing, so the UI
    // flow can be exercised end to end without a key.
    const accent = brandKit?.palette?.accents?.[0] || '#0e5c6b';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="#14181f"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#g)"/><circle cx="760" cy="360" r="220" fill="#ffffff" fill-opacity="0.12"/><text x="80" y="980" font-family="Helvetica, Arial" font-size="30" fill="#ffffff" fill-opacity="0.7">mock image · ${String(prompt || '').slice(0, 60).replace(/[<>&]/g, '')}</text></svg>`;
    await new Promise((r) => setTimeout(r, 400));
    return { mime: 'image/svg+xml', data: Buffer.from(svg).toString('base64'), usage: { images: 1, costEur: 0, ms: Date.now() - started, mock: true } };
  }

  if (!KEY) {
    const err = new Error('GEMINI_API_KEY is not set, so image generation is off. Add it to .env to enable.');
    err.status = 503;
    throw err;
  }

  const parts = [{ text: `${prompt}\n\nStyle: ${styleBlock(brandKit)}` }];
  for (const dataUrl of (brandKit?.assets?.artwork || []).slice(0, 6)) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }

  const res = await fetch(ENDPOINT(GEMINI_IMAGE_MODEL), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect, imageSize: '1K' } },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Gemini returned HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }
  const json = await res.json();
  const image = (json.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
  if (!image) {
    const err = new Error('Gemini returned no image. The prompt may have been blocked; try rewording it.');
    err.status = 502;
    throw err;
  }
  const inline = image.inlineData || image.inline_data;
  return {
    mime: inline.mimeType || inline.mime_type || 'image/png',
    data: inline.data,
    usage: { images: 1, costEur: Number(imageCostEur(1).toFixed(4)), ms: Date.now() - started },
  };
}

module.exports = { generateImage, available };
