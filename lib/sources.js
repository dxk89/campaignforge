/**
 * Source handling.
 *
 * Sources never touch a database. The server extracts text from whatever the
 * user gives it (file, URL, pasted text), returns that text to the browser,
 * and the browser sends it back with the brief when it generates. Stateless,
 * and the user can see exactly what the model will read.
 *
 * Per-source cap keeps one giant PDF from dominating the research pass;
 * the pass itself has a total budget on top (research.js).
 */

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const MAX_CHARS_PER_SOURCE = 40_000;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

const TEXT_TYPES = new Set(['.txt', '.md', '.csv', '.json', '.html', '.htm']);

function ext(name) {
  const m = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : '';
}

function cap(text) {
  const clean = String(text || '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return clean.length > MAX_CHARS_PER_SOURCE ? clean.slice(0, MAX_CHARS_PER_SOURCE) + '\n[truncated]' : clean;
}

/**
 * Crude but dependable HTML -> text. Production would use a readability
 * extractor; for a demo, dropping scripts, styles, nav and tags is enough
 * to get the copy off a marketing page.
 */
function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(nav|footer|header|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ');
}

/**
 * Extract text from an uploaded file (multer memory buffer).
 * @returns {Promise<{name: string, kind: string, text: string, chars: number}>}
 */
async function extractFile(file) {
  const name = file.originalname;
  const e = ext(name);
  let text;

  if (e === '.pdf') {
    const parsed = await pdfParse(file.buffer);
    text = parsed.text;
  } else if (e === '.docx') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    text = result.value;
  } else if (TEXT_TYPES.has(e)) {
    text = file.buffer.toString('utf8');
    if (e === '.html' || e === '.htm') text = htmlToText(text);
  } else {
    const err = new Error(`Unsupported file type "${e || 'none'}". Use PDF, DOCX, TXT, MD, CSV, JSON or HTML.`);
    err.status = 415;
    throw err;
  }

  const capped = cap(text);
  if (!capped) {
    const err = new Error(`No readable text found in ${name}. Scanned PDFs need OCR first.`);
    err.status = 422;
    throw err;
  }
  return { name, kind: 'file', text: capped, chars: capped.length };
}

/**
 * Fetch a URL and extract its text.
 */
async function extractUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    const err = new Error('Enter a full URL starting with http:// or https://');
    err.status = 400;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'CampaignForge/0.1 (+research source fetch)', accept: 'text/html,text/plain' },
    });
  } catch (e) {
    const err = new Error(`Could not fetch ${url.hostname}: ${e.name === 'AbortError' ? 'timed out' : e.message}`);
    err.status = 502;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = new Error(`${url.hostname} returned HTTP ${res.status}`);
    err.status = 502;
    throw err;
  }

  const type = res.headers.get('content-type') || '';
  const body = await res.text();
  const text = cap(type.includes('html') ? htmlToText(body) : body);
  if (!text) {
    const err = new Error(`No readable text at ${url.hostname}. The page may render client-side.`);
    err.status = 422;
    throw err;
  }
  return { name: url.href, kind: 'url', text, chars: text.length };
}

/** Pasted text needs no extraction, just the same shape and cap. */
function fromPaste(label, text) {
  const capped = cap(text);
  return { name: label || 'Pasted text', kind: 'paste', text: capped, chars: capped.length };
}

module.exports = { extractFile, extractUrl, fromPaste, MAX_UPLOAD_BYTES, MAX_CHARS_PER_SOURCE };
