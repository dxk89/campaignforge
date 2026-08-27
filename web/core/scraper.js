/**
 * Site scan.
 *
 * For a third-party client we can't assume we have their brand guidelines,
 * so we go and read the site. Two outputs:
 *
 *   sources    the text of the pages that matter (home, about, product,
 *              pricing, customers, blog). The research pass reads these for
 *              voice: how they write, what they claim, what they avoid.
 *   brandKit   the style: palette pulled from their CSS, fonts, logo, site
 *              name, tagline. The graphics templates use this so every
 *              social graphic is in the client's colours without anyone
 *              typing a hex code.
 *
 * Pure code, no model call, no cost. Bounded: a handful of pages, a few
 * stylesheets, size caps, timeouts. Production would use a headless browser
 * for client-rendered sites; this handles the server-rendered majority.
 */

const { htmlToText } = require('./sources');

const MAX_PAGES = 8;
const MAX_CSS_FILES = 4;
const MAX_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 8_000;
const PAGE_CHARS = 12_000;

// Pages worth reading, in priority order. Matched against the path.
const PRIORITY = ['about', 'product', 'platform', 'solution', 'feature', 'pricing', 'customer', 'case', 'why', 'how-it-works', 'blog', 'news', 'team', 'services'];

async function fetchText(url, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'CampaignForge/0.2 (+site scan for campaign research)', accept },
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return null;
    const text = await res.text();
    return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1] : null;
}

function meta(html, key) {
  const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re);
  return tag ? attr(tag[0], 'content') : null;
}

function headings(html, level) {
  const out = [];
  const re = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, 'gi');
  let m;
  while ((m = re.exec(html)) && out.length < 12) {
    const t = htmlToText(m[1]).replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out;
}

/** Internal links, resolved and de-duplicated, ranked by how useful the page is likely to be. */
function internalLinks(html, base) {
  const seen = new Set();
  const links = [];
  const re = /<a\s[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    let u;
    try { u = new URL(m[1], base); } catch { continue; }
    if (u.host !== base.host || !['http:', 'https:'].includes(u.protocol)) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|css|js|zip|mp4|xml|ico)$/i.test(u.pathname)) continue;
    if (/^mailto:|^tel:/.test(m[1]) || /\/(login|signin|signup|register|cart|account|wp-admin|privacy|terms|cookie)/i.test(u.pathname)) continue;
    u.hash = '';
    u.search = '';
    const key = u.href.replace(/\/$/, '');
    if (seen.has(key) || key === base.href.replace(/\/$/, '')) continue;
    seen.add(key);
    const path = u.pathname.toLowerCase();
    const rank = PRIORITY.findIndex((p) => path.includes(p));
    links.push({ url: u.href, rank: rank === -1 ? 99 : rank, depth: path.split('/').filter(Boolean).length });
  }
  return links.sort((a, b) => a.rank - b.rank || a.depth - b.depth).map((l) => l.url);
}

// ---- Brand kit ---------------------------------------------------------------

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function luminance([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function saturation([r, g, b]) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  return max === 0 ? 0 : (max - min) / max;
}

/** Pull colours out of CSS/HTML, count them, and sort into accents, darks and lights. */
function extractPalette(cssText) {
  const counts = new Map();
  const add = (hex) => counts.set(hex, (counts.get(hex) || 0) + 1);
  for (const m of cssText.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) add(rgbToHex(hexToRgb(m[1])));
  for (const m of cssText.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi)) add(rgbToHex([+m[1], +m[2], +m[3]]));

  const all = [...counts.entries()].map(([hex, n]) => {
    const rgb = hexToRgb(hex);
    return { hex, n, lum: luminance(rgb), sat: saturation(rgb) };
  });
  const accents = all.filter((c) => c.sat > 0.25 && c.lum > 0.02 && c.lum < 0.75).sort((a, b) => b.n - a.n);
  const darks = all.filter((c) => c.lum < 0.05).sort((a, b) => b.n - a.n);
  const lights = all.filter((c) => c.lum > 0.85).sort((a, b) => b.n - a.n);

  // Keep accents that are visibly different from each other.
  const distinct = [];
  for (const c of accents) {
    const rgb = hexToRgb(c.hex);
    if (distinct.every((d) => hexToRgb(d.hex).reduce((s, v, i) => s + Math.abs(v - rgb[i]), 0) > 60)) distinct.push(c);
    if (distinct.length === 5) break;
  }
  return {
    accents: distinct.map((c) => c.hex),
    dark: darks[0]?.hex || '#111111',
    light: lights[0]?.hex || '#ffffff',
  };
}

function extractFonts(cssText) {
  const counts = new Map();
  for (const m of cssText.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const first = m[1].split(',')[0].replace(/["']/g, '').trim();
    if (!first || /^(inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system|var\()/i.test(first)) continue;
    counts.set(first, (counts.get(first) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f);
}

function findLogo(html, base) {
  const imgs = html.match(/<img\s[^>]*>/gi) || [];
  for (const tag of imgs) {
    const src = attr(tag, 'src') || attr(tag, 'data-src');
    const alt = attr(tag, 'alt') || '';
    const cls = attr(tag, 'class') || '';
    if (src && /logo/i.test(src + alt + cls)) {
      try { return new URL(src, base).href; } catch { /* ignore */ }
    }
  }
  return null;
}

async function stylesheets(html, base) {
  const hrefs = [];
  for (const m of html.matchAll(/<link\s[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi)) {
    const href = attr(m[0], 'href');
    if (href) { try { hrefs.push(new URL(href, base).href); } catch { /* ignore */ } }
  }
  const inline = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []).join('\n');
  const styleAttrs = (html.match(/style\s*=\s*["'][^"']*["']/gi) || []).join('\n');
  const fetched = await Promise.all(hrefs.slice(0, MAX_CSS_FILES).map((h) => fetchText(h, 'text/css')));
  return [inline, styleAttrs, ...fetched.filter(Boolean)].join('\n');
}

// ---- Scan -----------------------------------------------------------------------

/**
 * @param {string} rawUrl  The client's website.
 * @returns {Promise<{sources: Array, brandKit: object}>}
 */
async function scanSite(rawUrl, { maxPages = MAX_PAGES } = {}) {
  let base;
  try {
    base = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    const err = new Error('Enter the client website, e.g. https://client.com');
    err.status = 400;
    throw err;
  }

  const home = await fetchText(base.href, 'text/html');
  if (!home) {
    const err = new Error(`Could not fetch ${base.host}. Check the address, or the site may block automated requests.`);
    err.status = 502;
    throw err;
  }

  const links = internalLinks(home, base).slice(0, maxPages - 1);
  const pages = [{ url: base.href, html: home }];
  const others = await Promise.all(links.map(async (url) => ({ url, html: await fetchText(url, 'text/html') })));
  pages.push(...others.filter((p) => p.html));

  const sources = [];
  const pageIndex = [];
  for (const { url, html } of pages) {
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    const description = meta(html, 'description') || meta(html, 'og:description') || '';
    const h1 = headings(html, 1);
    const h2 = headings(html, 2);
    const body = htmlToText(html).replace(/\n{3,}/g, '\n\n').trim().slice(0, PAGE_CHARS);
    if (!body) continue;
    const text = [
      `Title: ${title}`,
      description ? `Description: ${description}` : '',
      h1.length ? `H1: ${h1.join(' | ')}` : '',
      h2.length ? `H2: ${h2.join(' | ')}` : '',
      '',
      body,
    ].filter((l) => l !== '').join('\n');
    sources.push({ name: url, kind: 'site', text, chars: text.length });
    pageIndex.push({ url, title });
  }

  const css = await stylesheets(home, base);
  const palette = extractPalette(css);
  const brandKit = {
    siteName: meta(home, 'og:site_name') || (home.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || base.host).replace(/\s+/g, ' ').trim(),
    tagline: meta(home, 'og:description') || meta(home, 'description') || headings(home, 1)[0] || null,
    domain: base.host,
    palette,
    fonts: extractFonts(css),
    logo: findLogo(home, base),
    ogImage: (() => { const o = meta(home, 'og:image'); try { return o ? new URL(o, base).href : null; } catch { return null; } })(),
    pages: pageIndex,
  };

  return { sources, brandKit };
}

module.exports = { scanSite, extractPalette, extractFonts, luminance, hexToRgb };
