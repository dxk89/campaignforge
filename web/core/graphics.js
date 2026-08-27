/**
 * Social graphics.
 *
 * The model chooses a template and writes the words. This file draws it,
 * in the client's palette and font, at 1080x1080. Same principle as the
 * UTMs: judgement to the model, determinism to code. A model asked to
 * "draw an SVG" produces something different and often broken every run;
 * a template with slots produces a legible, on-brand card every time.
 *
 * Templates
 *   quote     a pulled line, big, with attribution
 *   stat      one number, one label, one line of context
 *   tip       kicker + headline + short body
 *   list      headline + up to four items
 *   announce  headline + body + a CTA pill
 *
 * The browser turns the SVG into PNG for download (canvas). Fonts fall back
 * to system sans so the PNG never depends on a web font loading.
 */

const { luminance, hexToRgb } = require('./scraper');

const SIZE = 1080;
const PAD = 96;

const TEMPLATES = ['quote', 'stat', 'tip', 'list', 'announce'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Greedy word wrap. maxChars is approximate for the font size. */
function wrap(text, maxChars, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[,.;:]?\s*\S*$/, '') + '…';
    return kept;
  }
  return lines;
}

/** Characters that fit on one line at a font size. 0.56 em average for bold sans, 0.5 for regular. */
const cpl = (fs, bold = true) => Math.floor((SIZE - PAD * 2) / (fs * (bold ? 0.56 : 0.5)));

function tspans(lines, x, y, lineHeight, extra = '') {
  return lines.map((l, i) => `<tspan x="${x}" y="${y + i * lineHeight}" ${extra}>${esc(l)}</tspan>`).join('');
}

/** Pick colours from the brand kit that read well together. */
function scheme(brandKit, variant = 0) {
  const accents = brandKit?.palette?.accents?.length ? brandKit.palette.accents : ['#0e5c6b', '#e4570f'];
  const dark = brandKit?.palette?.dark || '#14181f';
  const light = brandKit?.palette?.light || '#ffffff';
  const accent = accents[variant % accents.length];
  const accent2 = accents[(variant + 1) % accents.length];
  // Alternate: accent background with light text, or light background with accent text.
  const onAccent = luminance(hexToRgb(accent)) < 0.4 ? light : dark;
  const schemes = [
    { bg: accent, fg: onAccent, sub: onAccent, accent: accent2 === accent ? light : accent2 },
    { bg: light, fg: dark, sub: '#5b6470', accent },
    { bg: dark, fg: light, sub: '#c8cdd4', accent },
  ];
  return schemes[variant % schemes.length];
}

function fontStack(brandKit) {
  const f = brandKit?.fonts?.[0];
  return f ? `'${f.replace(/'/g, '')}', Helvetica, Arial, sans-serif` : 'Helvetica, Arial, sans-serif';
}

function frame(brandKit, variant, inner) {
  const c = scheme(brandKit, variant);
  const font = fontStack(brandKit);
  const brand = esc(brandKit?.siteName || '');
  // Uploaded logo as a data URL; only embed if it really is one.
  const logo = /^data:image\/[a-z+]+;base64,/.test(brandKit?.assets?.logo || '') ? brandKit.assets.logo : null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" font-family="${esc(font)}">
<rect width="${SIZE}" height="${SIZE}" fill="${c.bg}"/>
<rect x="${PAD}" y="${PAD}" width="72" height="10" fill="${c.accent}"/>
${inner(c)}
<text x="${PAD}" y="${SIZE - PAD + 8}" font-size="30" font-weight="600" fill="${c.sub}" letter-spacing="1">${brand}</text>
${logo ? `<image href="${logo}" x="${SIZE - PAD - 200}" y="${SIZE - PAD - 44}" width="200" height="64" preserveAspectRatio="xMaxYMid meet"/>` : ''}
</svg>`;
}

const RENDER = {
  quote(g, kit, v) {
    return frame(kit, v, (c) => {
      let fs = 70;
      let lines = wrap(g.headline, cpl(fs), 6);
      if (lines.length > 4) { fs = 58; lines = wrap(g.headline, cpl(fs), 6); }
      return `<text x="${PAD}" y="${PAD + 120}" font-size="140" fill="${c.accent}" font-weight="700">“</text>
<text font-size="${fs}" font-weight="700" fill="${c.fg}">${tspans(lines, PAD, PAD + 240, fs * 1.18)}</text>
<text x="${PAD}" y="${SIZE - PAD - 90}" font-size="34" fill="${c.sub}">${esc(g.footer || '')}</text>`;
    });
  },
  stat(g, kit, v) {
    return frame(kit, v, (c) => {
      const num = String(g.headline || '');
      const fs = num.length > 6 ? 200 : num.length > 3 ? 260 : 320;
      const body = wrap(g.body, cpl(44), 3);
      return `<text x="${PAD}" y="${PAD + 100}" font-size="34" font-weight="600" fill="${c.sub}" letter-spacing="2">${esc((g.kicker || '').toUpperCase())}</text>
<text x="${PAD}" y="${PAD + 160 + fs * 0.85}" font-size="${fs}" font-weight="800" fill="${c.accent}">${esc(num)}</text>
<text font-size="44" font-weight="600" fill="${c.fg}">${tspans(body, PAD, PAD + 210 + fs * 0.85 + 40, 56)}</text>`;
    });
  },
  tip(g, kit, v) {
    return frame(kit, v, (c) => {
      const head = wrap(g.headline, cpl(72), 3);
      const body = wrap(g.body, cpl(38, false), 5);
      const headBottom = PAD + 220 + head.length * 84;
      return `<text x="${PAD}" y="${PAD + 100}" font-size="34" font-weight="600" fill="${c.sub}" letter-spacing="2">${esc((g.kicker || '').toUpperCase())}</text>
<text font-size="72" font-weight="700" fill="${c.fg}">${tspans(head, PAD, PAD + 220, 84)}</text>
<text font-size="38" fill="${c.sub}">${tspans(body, PAD, headBottom + 20, 52)}</text>`;
    });
  },
  list(g, kit, v) {
    return frame(kit, v, (c) => {
      const head = wrap(g.headline, cpl(66), 2);
      const items = (Array.isArray(g.body) ? g.body : String(g.body || '').split(/\s*\|\s*|\n/)).filter(Boolean).slice(0, 4);
      let y = PAD + 200 + head.length * 76 + 40;
      const rows = items.map((it, i) => {
        const lines = wrap(it, cpl(40, false) - 2, 2);
        const row = `<circle cx="${PAD + 14}" cy="${y - 14}" r="12" fill="${c.accent}"/><text font-size="40" fill="${c.fg}">${tspans(lines, PAD + 48, y, 50)}</text>`;
        y += lines.length * 50 + 34;
        return row;
      }).join('');
      return `<text x="${PAD}" y="${PAD + 100}" font-size="34" font-weight="600" fill="${c.sub}" letter-spacing="2">${esc((g.kicker || '').toUpperCase())}</text>
<text font-size="66" font-weight="700" fill="${c.fg}">${tspans(head, PAD, PAD + 200, 76)}</text>${rows}`;
    });
  },
  announce(g, kit, v) {
    return frame(kit, v, (c) => {
      const head = wrap(g.headline, cpl(80), 3);
      const body = wrap(g.body, cpl(38, false), 4);
      const headBottom = PAD + 240 + head.length * 92;
      const cta = String(g.footer || '').slice(0, 32);
      const w = Math.min(SIZE - PAD * 2, cta.length * 22 + 80);
      return `<text x="${PAD}" y="${PAD + 100}" font-size="34" font-weight="600" fill="${c.sub}" letter-spacing="2">${esc((g.kicker || '').toUpperCase())}</text>
<text font-size="80" font-weight="800" fill="${c.fg}">${tspans(head, PAD, PAD + 240, 92)}</text>
<text font-size="38" fill="${c.sub}">${tspans(body, PAD, headBottom + 10, 52)}</text>
${cta ? `<rect x="${PAD}" y="${SIZE - PAD - 190}" width="${w}" height="84" rx="42" fill="${c.accent}"/><text x="${PAD + 40}" y="${SIZE - PAD - 136}" font-size="36" font-weight="700" fill="${luminance(hexToRgb(c.accent)) < 0.4 ? '#ffffff' : '#14181f'}">${esc(cta)}</text>` : ''}`;
    });
  },
};

/**
 * @param {object} graphic  { template, kicker, headline, body, footer }
 * @param {object} brandKit from the site scan (may be null)
 * @param {number} variant  rotates colour schemes so a month isn't one colour
 */
function renderGraphic(graphic, brandKit, variant = 0) {
  const t = TEMPLATES.includes(graphic?.template) ? graphic.template : 'tip';
  return RENDER[t](graphic || {}, brandKit, variant);
}

module.exports = { renderGraphic, TEMPLATES };
