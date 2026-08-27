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
const orchestrator = require('./agents/orchestrator');
const { validateBrief } = require('./brief');
const { validateAssets, validateSocial } = require('./limits');
const { trackingPlan } = require('./utm');
const research = require('./prompts/research');
const { extractFile, extractUrl, fromPaste, MAX_UPLOAD_BYTES } = require('./sources');
const { MOCK } = require('./claude');
const { scanSite } = require('./scraper');
const images = require('./images');

const app = express();

// Sources and intermediate JSON round-trip through the browser, so the JSON
// limit has to allow for a few hundred KB.
app.use(express.json({ limit: '12mb' })); // brand assets travel as data URLs
app.use(express.static(path.join(__dirname, '..', '..', 'legacy', 'public')));

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

app.get('/api/health', (req, res) => res.json({ ok: true, mock: MOCK, images: images.available() }));

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

// Crawl the client's site: page text becomes sources, CSS becomes a brand kit.
app.post('/api/sources/site', wrap(async (req, res) => {
  res.json(await scanSite(req.body?.url));
}));

app.post('/api/sources/paste', (req, res) => {
  const text = String(req.body?.text || '');
  if (!text.trim()) return res.status(400).json({ error: 'Nothing pasted' });
  res.json({ source: fromPaste(req.body?.label, text) });
});

// ---- Briefing document -----------------------------------------------------

app.post('/api/brief/parse', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const source = await extractFile(req.file);
  source.kind = 'brief';
  const r = await orchestrator.runAgent('brief-reader', { text: source.text });
  res.json({ fields: r.output, usage: r.usage, source });
}));

// ---- Agents ------------------------------------------------------------------

function requireBrief(req, res) {
  const errors = validateBrief(req.body?.brief || {});
  if (errors.length) { res.status(400).json({ error: 'Invalid brief', details: errors }); return null; }
  return req.body.brief;
}

/** Incomplete runs surface their unfixed problems as issues the UI already knows how to show. */
const asIssues = (r, channel, language = 'en') => (r.complete ? [] : r.problems.map((note) => ({ channel, index: null, field: 'unresolved', length: 0, limit: 0, severity: 'violation', language, note })));
const meta = (r) => ({ usage: r.usage, complete: r.complete, problems: r.problems, trace: r.trace });

app.get('/api/agents', (req, res) => {
  res.json({ agents: Object.values(orchestrator.roster).map((a) => ({ name: a.name, model: a.model, tools: (a.tools || []).map((t) => t.name) })) });
});

// Generic: run any roster agent with raw inputs. Scripts and the future orchestrator agent use this.
app.post('/api/agents/:name/run', wrap(async (req, res) => {
  const r = await orchestrator.runAgent(req.params.name, req.body?.inputs || {});
  res.json({ output: r.output, ...meta(r) });
}));

// The pass routes the browser drives, mapped onto agents. Shapes unchanged for the front end.
app.post('/api/pass/research', wrap(async (req, res) => {
  const brief = requireBrief(req, res); if (!brief) return;
  const { sources = [], webResearch, companyUrl } = req.body;
  if (!sources.length && !webResearch) return res.json({ context: research.emptyContext(), usage: null, skipped: true });
  const r = await orchestrator.runAgent('brand-analyst', { brief, sources, webResearch: Boolean(webResearch), companyUrl, clientId: brief.clientId });
  res.json({ context: r.output, sourceChars: sources.reduce((n, x) => n + String(x.text || '').length, 0), ...meta(r) });
}));

app.post('/api/pass/audience', wrap(async (req, res) => {
  const brief = requireBrief(req, res); if (!brief) return;
  if (!req.body.webResearch) return res.json({ audience: null, usage: null, skipped: true });
  const r = await orchestrator.runAgent('customer-researcher', { brief, context: req.body.context, clientId: brief.clientId });
  res.json({ audience: r.output, ...meta(r) });
}));

app.post('/api/pass/strategy', wrap(async (req, res) => {
  const brief = requireBrief(req, res); if (!brief) return;
  const r = await orchestrator.runAgent('strategist', { brief, context: req.body.context, audience: req.body.audience, clientId: brief.clientId });
  res.json({ strategy: r.output, ...meta(r) });
}));

app.post('/api/pass/assets', wrap(async (req, res) => {
  const brief = requireBrief(req, res); if (!brief) return;
  if (!req.body.strategy) return res.status(400).json({ error: 'strategy is required' });
  const r = await orchestrator.runAgent('copywriter', { brief, strategy: req.body.strategy, context: req.body.context, audience: req.body.audience, clientId: brief.clientId });
  res.json({ assets: r.output, issues: [...validateAssets(r.output || {}, 'en'), ...asIssues(r, 'assets')], ...meta(r) });
}));

app.post('/api/pass/social', wrap(async (req, res) => {
  const brief = requireBrief(req, res); if (!brief) return;
  if (!req.body.strategy || !req.body.assets) return res.status(400).json({ error: 'strategy and assets are required' });
  const r = await orchestrator.runAgent('social-planner', { brief, strategy: req.body.strategy, assets: req.body.assets, context: req.body.context, audience: req.body.audience, brandKit: req.body.brandKit, clientId: brief.clientId });
  res.json({ social: r.output, issues: [...validateSocial(r.output || {}, 'en'), ...asIssues(r, 'social')], ...meta(r) });
}));

app.post('/api/pass/activation', wrap(async (req, res) => {
  const brief = requireBrief(req, res); if (!brief) return;
  if (!req.body.strategy || !req.body.assets) return res.status(400).json({ error: 'strategy and assets are required' });
  const r = await orchestrator.runAgent('ops-architect', { brief, strategy: req.body.strategy, assets: req.body.assets, context: req.body.context, audience: req.body.audience, landingUrl: req.body.landingUrl, clientId: brief.clientId });
  res.json({ activation: r.output, problems: r.problems, tracking: trackingPlan(brief, req.body.assets, null, req.body.landingUrl), ...meta(r) });
}));

app.post('/api/pass/localise', wrap(async (req, res) => {
  if (!req.body?.assets) return res.status(400).json({ error: 'assets is required' });
  const r = await orchestrator.runAgent('localiser', { assets: req.body.assets, glossary: req.body.glossary, brief: req.body.brief, context: req.body.context, clientId: req.body.brief?.clientId });
  res.json({ localised: r.output, issues: [...validateAssets(r.output || {}, 'pt'), ...asIssues(r, 'localise', 'pt')], ...meta(r) });
}));

// ---- Images (on demand, per post) --------------------------------------------

app.post('/api/images/generate', wrap(async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  res.json(await images.generateImage({ prompt, brandKit: req.body.brandKit, aspect: req.body.aspect }));
}));

// ---- The whole campaign in one request (scripts, curl) -----------------------

app.post('/api/generate', wrap(async (req, res) => {
  const brief = req.body || {};
  const errors = validateBrief(brief);
  if (errors.length) return res.status(400).json({ error: 'Invalid brief', details: errors });
  console.log(`[generate] "${brief.productName}" | ${brief.objective} | ${brief.tone} | ${brief.languages.join(',')} | ${(brief.sources || []).length} sources | web=${Boolean(brief.webResearch)}`);
  const result = await orchestrator.runCampaign(brief);
  const e = result.economics;
  console.log(`[generate] done: ${e.totalTokens} tokens, EUR ${e.costEur}, ${e.generationMs} ms`);
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
