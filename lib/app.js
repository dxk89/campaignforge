/**
 * The Express app, without the listener, so the same app can be served two
 * ways: a long-running process (server.js, for Render or local) or a
 * serverless function (api/index.js, for Vercel).
 *
 * Three jobs: serve the static front end, extract text from sources the user
 * adds, and run the prompt chain, one pass per request or all at once. The
 * API key never leaves this process.
 */

const path = require('path');
const express = require('express');
const multer = require('multer');
const chain = require('./chain');
const { extractFile, extractUrl, fromPaste, MAX_UPLOAD_BYTES } = require('./sources');
const { MOCK } = require('./claude');

const app = express();

// Sources and intermediate JSON round-trip through the browser, so the JSON
// limit has to allow for a few hundred KB.
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({
  storage: multer.memoryStorage(), // never written to disk
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 10 },
});

/** Wrap an async handler so a thrown error becomes a JSON response. */
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(`[${req.path}] failed:`, err);
    res.status(err.status || 502).json({ error: err.message || 'Request failed', pass: err.pass || null });
  });

app.get('/api/health', (req, res) => res.json({ ok: true, mock: MOCK }));

// ---- Company voice sources -------------------------------------------------

app.post('/api/sources/files', upload.array('files'), wrap(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No files received' });
  const sources = [];
  const errors = [];
  for (const file of files) {
    try { sources.push(await extractFile(file)); } catch (err) { errors.push({ name: file.originalname, error: err.message }); }
  }
  res.json({ sources, errors });
}));

app.post('/api/sources/url', wrap(async (req, res) => {
  res.json({ source: await extractUrl(req.body?.url) });
}));

app.post('/api/sources/paste', (req, res) => {
  const text = String(req.body?.text || '');
  if (!text.trim()) return res.status(400).json({ error: 'Nothing pasted' });
  res.json({ source: fromPaste(req.body?.label, text) });
});

// ---- Briefing document -----------------------------------------------------

// Extract the document, read it into the brief fields, hand both back. The
// browser prefills the form and keeps the document as a source.
app.post('/api/brief/parse', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const source = await extractFile(req.file);
  source.kind = 'brief';
  const parsed = await chain.parseBrief(source.text);
  res.json({ ...parsed, source });
}));

// ---- The chain, one pass per request ---------------------------------------

function requireBrief(req, res) {
  const errors = chain.validateBrief(req.body?.brief || {});
  if (errors.length) { res.status(400).json({ error: 'Invalid brief', details: errors }); return null; }
  return req.body.brief;
}

app.post('/api/pass/research', wrap(async (req, res) => {
  const brief = requireBrief(req, res); if (!brief) return;
  const { sources, webResearch, companyUrl } = req.body;
  res.json(await chain.passResearch({ brief, sources, webResearch, companyUrl }));
}));

app.post('/api/pass/strategy', wrap(async (req, res) => {
  const brief = requireBrief(req, res); if (!brief) return;
  res.json(await chain.passStrategy({ brief, context: req.body.context }));
}));

app.post('/api/pass/assets', wrap(async (req, res) => {
  const brief = requireBrief(req, res); if (!brief) return;
  if (!req.body.strategy) return res.status(400).json({ error: 'strategy is required' });
  res.json(await chain.passAssets({ brief, strategy: req.body.strategy, context: req.body.context }));
}));

app.post('/api/pass/localise', wrap(async (req, res) => {
  if (!req.body?.assets) return res.status(400).json({ error: 'assets is required' });
  res.json(await chain.passLocalise({ assets: req.body.assets, glossary: req.body.glossary }));
}));

// ---- The chain, all at once -------------------------------------------------

app.post('/api/generate', wrap(async (req, res) => {
  const brief = req.body || {};
  const errors = chain.validateBrief(brief);
  if (errors.length) return res.status(400).json({ error: 'Invalid brief', details: errors });
  console.log(`[generate] "${brief.productName}" | ${brief.objective} | ${brief.tone} | ${brief.languages.join(',')} | ${(brief.sources || []).length} sources | web=${Boolean(brief.webResearch)}`);
  const result = await chain.runChain(brief);
  const e = result.economics;
  console.log(`[generate] done: ${e.totalTokens} tokens, EUR ${e.costEur}, ${e.generationMs} ms, ${result.issues.length} issues`);
  res.json(result);
}));

// Multer and JSON parser errors land here.
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (8 MB max)' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large; remove some sources' });
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

module.exports = app;
