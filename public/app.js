/**
 * Campaign Forge front end. Plain JS, no build step.
 *
 * State lives in three places:
 *   sources     what the research pass will read (kept client-side, sent with the brief)
 *   result      the last generation
 *   briefUsage  tokens spent parsing an uploaded briefing document, so the
 *               footer can count them alongside the generation
 */

'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const LIMITS = {
  meta: { primary_text: { max: 125, hard: false }, headline: { max: 40, hard: true }, description: { max: 30, hard: true } },
  linkedin: { intro_text: { max: 150, hard: false }, headline: { max: 70, hard: true } },
  google: { headline: { max: 30, hard: true }, description: { max: 90, hard: true } },
  email: { subject: { max: 60, hard: true }, preview_text: { max: 90, hard: false } },
};

const PASS_LABELS = {
  research: 'Researching the company material',
  audience: 'Understanding the customer',
  strategy: 'Choosing the angle',
  assets: 'Writing every channel',
  social: 'Planning a month of social and drawing the graphics',
  activation: 'Building the lifecycle, handoff and measurement plan',
  localise: 'Adapting for Portugal',
};

const MAX_TOTAL_SOURCE_CHARS = 60000;

let sources = [];
let result = null;
let briefUsage = null;
let brandKit = null;
let imagesAvailable = false;
let imageUsage = { images: 0, costEur: 0 };
fetch('/api/health').then((r) => r.json()).then((h) => { imagesAvailable = Boolean(h.images); }).catch(() => {});
let activeTab = 'strategy';
let activeLang = 'en';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 1800);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1200);
  } else {
    toast('Copied');
  }
}

function fmtInt(n) { return Number(n || 0).toLocaleString('en-GB'); }
function fmtEur(n) { return '€' + Number(n || 0).toFixed(4); }
function fmtMs(ms) { return (ms / 1000).toFixed(1) + 's'; }

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data });
  return data;
}

async function postForm(url, formData) {
  const res = await fetch(url, { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data });
  return data;
}

// ---------------------------------------------------------------------------
// Briefing document
// ---------------------------------------------------------------------------

const briefInput = $('#brief-file');
const briefStatus = $('#brief-status');

function setBriefStatus(html, isError) {
  briefStatus.innerHTML = html;
  briefStatus.classList.toggle('error', Boolean(isError));
  briefStatus.hidden = false;
}

async function handleBriefFile(file) {
  if (!file) return;
  setBriefStatus(`Reading <strong>${esc(file.name)}</strong>…`);
  const fd = new FormData();
  fd.append('file', file);
  try {
    const data = await postForm('/api/brief/parse', fd);
    const f = data.fields;
    const form = $('#brief-form');
    const filled = [];
    for (const key of ['productName', 'productDescription', 'targetAudience']) {
      if (f[key]) { form.elements[key].value = f[key]; filled.push(key); }
    }
    if (f.objective) { form.elements.objective.value = f.objective; filled.push('objective'); }
    if (f.tone) { form.elements.tone.value = f.tone; filled.push('tone'); }
    const ptBox = form.querySelector('input[name="languages"][value="pt"]');
    if (Array.isArray(f.languages) && f.languages.includes('pt')) ptBox.checked = true;

    // Keep the document as a source: the research pass should read the whole
    // thing, not just the five fields we pulled out.
    addSource(data.source);
    briefUsage = data.usage;

    const missing = ['productName', 'productDescription', 'targetAudience', 'objective', 'tone'].filter((k) => !filled.includes(k));
    setBriefStatus(
      `Filled ${filled.length} of 5 fields from <strong>${esc(file.name)}</strong>` +
        (missing.length ? ` · check ${missing.map((m) => m.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')}` : '') +
        (f.notes ? `<br>Note from the brief: ${esc(f.notes)}` : '') +
        `<br><span class="cost">${fmtInt(data.usage.input + data.usage.output)} tokens · ${fmtEur(data.usage.costEur)} · kept as a source</span>`
    );
  } catch (err) {
    setBriefStatus(`Could not read the brief: ${esc(err.message)}`, true);
  }
  briefInput.value = '';
}

briefInput.addEventListener('change', () => handleBriefFile(briefInput.files[0]));
wireDrop($('#brief-dropzone'), (files) => handleBriefFile(files[0]));

// ---------------------------------------------------------------------------
// Company voice sources
// ---------------------------------------------------------------------------

const sourceList = $('#source-list');
const sourceTotal = $('#source-total');
const sourceError = $('#source-error');

function showSourceError(msg) {
  sourceError.textContent = msg;
  sourceError.hidden = !msg;
}

function addSource(src) {
  // Replace a source with the same name rather than duplicating it.
  sources = sources.filter((s) => s.name !== src.name);
  sources.push(src);
  renderSources();
}

function renderSources() {
  sourceList.innerHTML = sources
    .map(
      (s, i) => `<li>
        <span class="source-kind">${esc(s.kind)}</span>
        <span class="source-name" title="${esc(s.name)}">${esc(s.name)}</span>
        <span class="source-chars">${fmtInt(s.chars)} ch</span>
        <button type="button" class="source-remove" data-i="${i}" aria-label="Remove ${esc(s.name)}">×</button>
      </li>`
    )
    .join('');
  const total = sources.reduce((n, s) => n + s.chars, 0);
  sourceTotal.hidden = sources.length === 0;
  sourceTotal.textContent = `${sources.length} source${sources.length === 1 ? '' : 's'} · ${fmtInt(total)} characters ≈ ${fmtInt(Math.round(total / 4))} tokens` +
    (total > MAX_TOTAL_SOURCE_CHARS ? ` · over the ${fmtInt(MAX_TOTAL_SOURCE_CHARS)} budget, the rest will be truncated` : '');
  sourceTotal.classList.toggle('over', total > MAX_TOTAL_SOURCE_CHARS);
}

sourceList.addEventListener('click', (e) => {
  const btn = e.target.closest('.source-remove');
  if (!btn) return;
  sources.splice(Number(btn.dataset.i), 1);
  renderSources();
});

function wireDrop(zone, onFiles) {
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', (e) => onFiles(Array.from(e.dataTransfer.files || [])));
}

async function handleSourceFiles(files) {
  if (!files.length) return;
  showSourceError('');
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  try {
    const data = await postForm('/api/sources/files', fd);
    data.sources.forEach(addSource);
    if (data.errors?.length) showSourceError(data.errors.map((e) => `${e.name}: ${e.error}`).join(' · '));
  } catch (err) {
    showSourceError(err.message);
  }
  $('#file-input').value = '';
}

$('#file-input').addEventListener('change', (e) => handleSourceFiles(Array.from(e.target.files)));
wireDrop($('#dropzone'), handleSourceFiles);

$('#url-add').addEventListener('click', async () => {
  const input = $('#url-input');
  const url = input.value.trim();
  if (!url) return;
  showSourceError('');
  const btn = $('#url-add');
  btn.disabled = true;
  btn.textContent = 'Fetching…';
  try {
    const data = await postJson('/api/sources/url', { url });
    addSource(data.source);
    input.value = '';
  } catch (err) {
    showSourceError(err.message);
  }
  btn.disabled = false;
  btn.textContent = 'Fetch page';
});
$('#url-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#url-add').click(); } });

$('#paste-add').addEventListener('click', async () => {
  const text = $('#paste-text').value;
  if (!text.trim()) return;
  showSourceError('');
  try {
    const data = await postJson('/api/sources/paste', { label: $('#paste-label').value.trim(), text });
    addSource(data.source);
    $('#paste-text').value = '';
    $('#paste-label').value = '';
  } catch (err) {
    showSourceError(err.message);
  }
});

$('#site-scan').addEventListener('click', async () => {
  const input = $('#site-input');
  const url = input.value.trim();
  if (!url) return;
  showSourceError('');
  const btn = $('#site-scan');
  btn.disabled = true;
  btn.textContent = 'Scanning…';
  try {
    const data = await postJson('/api/sources/site', { url });
    data.sources.forEach(addSource);
    brandKit = { ...data.brandKit, assets: brandKit?.assets || { logo: null, artwork: [] } };
    renderBrandKit();
    if (!$('#brief-form').elements.clientName.value && brandKit.siteName) $('#brief-form').elements.clientName.value = brandKit.siteName;
    if (!$('#brief-form').elements.companyUrl.value) $('#brief-form').elements.companyUrl.value = url;
  } catch (err) {
    showSourceError(err.message);
  }
  btn.disabled = false;
  btn.textContent = 'Scan site';
});
$('#site-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#site-scan').click(); } });

/** Read an image file, downscale it, return a data URL. Logos keep PNG (transparency); artwork becomes JPEG. */
function fileToDataUrl(file, { max, png }) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not a readable image')); };
    img.src = url;
  });
}

function ensureKit() {
  if (!brandKit) brandKit = { siteName: $('#brief-form').elements.clientName.value.trim() || $('#brief-form').elements.productName.value.trim() || '', palette: null, fonts: [], pages: [] };
  if (!brandKit.assets) brandKit.assets = { logo: null, artwork: [] };
  return brandKit;
}

$('#logo-input').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { ensureKit().assets.logo = await fileToDataUrl(f, { max: 600, png: true }); renderAssets(); } catch (err) { showSourceError(err.message); }
  e.target.value = '';
});

$('#artwork-input').addEventListener('change', async (e) => {
  const kit = ensureKit();
  for (const f of Array.from(e.target.files).slice(0, 6 - kit.assets.artwork.length)) {
    try { kit.assets.artwork.push(await fileToDataUrl(f, { max: 1024, png: false })); } catch (err) { showSourceError(err.message); }
  }
  renderAssets();
  e.target.value = '';
});

function renderAssets() {
  const el = $('#asset-strip');
  const a = brandKit?.assets;
  if (!a || (!a.logo && !a.artwork.length)) { el.hidden = true; return; }
  el.innerHTML =
    (a.logo ? `<div class="thumb logo" title="Logo"><img src="${a.logo}" alt="logo"><button type="button" data-rm="logo" aria-label="Remove logo">×</button></div>` : '') +
    a.artwork.map((d, i) => `<div class="thumb" title="Artwork ${i + 1}"><img src="${d}" alt=""><button type="button" data-rm="${i}" aria-label="Remove">×</button></div>`).join('');
  el.hidden = false;
}

$('#asset-strip').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rm]');
  if (!b) return;
  if (b.dataset.rm === 'logo') brandKit.assets.logo = null; else brandKit.assets.artwork.splice(Number(b.dataset.rm), 1);
  renderAssets();
});

function renderBrandKit() {
  const el = $('#brand-kit');
  if (!brandKit) { el.hidden = true; return; }
  const p = brandKit.palette || {};
  const swatches = [...(p.accents || []), p.dark, p.light].filter(Boolean).map((c) => `<span class="swatch" style="background:${esc(c)}" title="${esc(c)}"></span>`).join('');
  el.innerHTML = `<div class="swatches">${swatches}</div>
    <div class="kit-line"><b>${esc(brandKit.siteName)}</b>${brandKit.tagline ? ` · ${esc(brandKit.tagline)}` : ''}</div>
    <div class="kit-line">Fonts: <b>${esc((brandKit.fonts || []).join(', ') || 'none found')}</b> · ${(brandKit.pages || []).length} pages read${brandKit.logo ? ` · <img class="kit-logo" src="${esc(brandKit.logo)}" alt="logo">` : ''}</div>`;
  el.hidden = false;
}

$('#web-research').addEventListener('change', (e) => {
  $('#company-url-field').hidden = !e.target.checked;
});

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const chain = $('#chain');
function setPass(pass, state) {
  const li = chain.querySelector(`[data-pass="${pass}"]`);
  if (li) li.dataset.state = state;
}
function resetChain() {
  $$('#chain li').forEach((li) => delete li.dataset.state);
}

function readBrief() {
  const form = $('#brief-form');
  const languages = ['en'];
  if (form.querySelector('input[name="languages"][value="pt"]').checked) languages.push('pt');
  return {
    clientName: form.elements.clientName.value.trim() || undefined,
    productName: form.elements.productName.value.trim(),
    productDescription: form.elements.productDescription.value.trim(),
    targetAudience: form.elements.targetAudience.value.trim(),
    objective: form.elements.objective.value,
    tone: form.elements.tone.value,
    languages,
    webResearch: $('#web-research').checked,
    companyUrl: form.elements.companyUrl.value.trim() || undefined,
    landingUrl: form.elements.landingUrl.value.trim() || undefined,
    brandKit: brandKit || undefined,
    sources: sources.map(({ name, kind, text }) => ({ name, kind, text })),
  };
}

$('#brief-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const brief = readBrief();
  const formError = $('#form-error');
  const missing = ['productName', 'productDescription', 'targetAudience'].filter((k) => !brief[k]);
  if (missing.length) {
    formError.textContent = 'Fill in ' + missing.map((m) => m.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ') + ' first.';
    formError.hidden = false;
    return;
  }
  formError.hidden = true;

  const btn = $('#generate-btn');
  btn.disabled = true;
  btn.textContent = 'Generating…';

  resetChain();
  $('#results-empty').hidden = true;
  $('#results-body').hidden = true;
  $('#results-error').hidden = true;
  $('#results-loading').hidden = false;
  $('#economics').hidden = true;

  // The browser drives the chain one pass at a time. Progress is therefore
  // real, and each request is short enough for a serverless host.
  const { sources: srcs, webResearch, companyUrl, landingUrl, brandKit: kit, ...briefFields } = brief;
  const passes = {};
  const started = Date.now();
  let current = null;
  imageUsage = { images: 0, costEur: 0 };

  const run = async (pass, body) => {
    current = pass;
    setPass(pass, 'running');
    $('#loading-line').textContent = PASS_LABELS[pass];
    const data = await postJson(`/api/pass/${pass}`, body);
    setPass(pass, data.skipped ? 'skipped' : 'done');
    if (data.usage) passes[pass] = data.usage;
    return data;
  };

  try {
    let context = null;
    let sourceChars = 0;
    if (srcs.length || webResearch) {
      const r = await run('research', { brief: briefFields, sources: srcs, webResearch, companyUrl });
      context = r.context;
      sourceChars = r.sourceChars || 0;
    } else {
      setPass('research', 'skipped');
    }

    let audienceData = null;
    if (webResearch) {
      const au = await run('audience', { brief: briefFields, context, webResearch: true });
      audienceData = au.audience;
    } else {
      setPass('audience', 'skipped');
    }

    const s = await run('strategy', { brief: briefFields, context, audience: audienceData });
    const a = await run('assets', { brief: briefFields, strategy: s.strategy, context, audience: audienceData });
    const issues = [...(a.issues || [])];

    const so = await run('social', { brief: briefFields, strategy: s.strategy, assets: a.assets, context, audience: audienceData, brandKit: kit });
    issues.push(...(so.issues || []));

    const act = await run('activation', { brief: briefFields, strategy: s.strategy, assets: a.assets, context, audience: audienceData, landingUrl });

    let localised = null;
    if (brief.languages.includes('pt')) {
      const l = await run('localise', { assets: a.assets, glossary: context?.glossary || [] });
      localised = l.localised;
      issues.push(...(l.issues || []));
    } else {
      setPass('localise', 'skipped');
    }

    result = {
      brief: briefFields,
      context,
      audience: audienceData,
      brandKit: kit || null,
      strategy: s.strategy,
      assets: a.assets,
      social: so.social,
      localised,
      activation: act.activation,
      activationProblems: act.problems || [],
      tracking: localised ? extendTracking(act.tracking, localised) : act.tracking,
      issues,
      economics: summarise(passes, { generationMs: Date.now() - started, sourceChars }),
    };
    activeLang = 'en';
    activeTab = context ? 'research' : 'strategy';
    renderResult();
  } catch (err) {
    if (current) setPass(current, 'failed');
    $('#results-loading').hidden = true;
    const el = $('#results-error');
    el.innerHTML = `<strong>Generation failed${current ? ` in the ${esc(current)} pass` : ''}.</strong>${esc(err.message)}` +
      (err.data?.details ? `<br>${esc(err.data.details.join('; '))}` : '') +
      `<br>The passes that finished are still shown above; press Generate to try again.`;
    el.hidden = false;
  }

  btn.disabled = false;
  btn.textContent = 'Generate campaign';
});

/** The server built EN tracking rows before pt-PT existed; add the PT rows using the same convention. */
function extendTracking(tracking, localised) {
  const rows = [...tracking.rows];
  const en = tracking.rows.filter((r) => r.language === 'en');
  for (const r of en) {
    const content = r.utm_content.replace(/-en$/, '-pt');
    const url = r.url.replace(/utm_content=[^&]*/, 'utm_content=' + content);
    rows.push({ ...r, language: 'pt', utm_content: content, url });
  }
  return { ...tracking, rows };
}

/** Sum per-pass usage into the footer numbers. Cost per pass comes from the server. */
function summarise(passes, extra) {
  let input = 0, output = 0, webSearches = 0, costEur = 0;
  for (const p of Object.values(passes)) {
    input += p.input; output += p.output; webSearches += p.webSearches || 0; costEur += p.costEur || 0;
  }
  return { passes, inputTokens: input, outputTokens: output, totalTokens: input + output, webSearches, costEur, ...extra };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderResult() {
  $('#results-loading').hidden = true;
  $('#results-body').hidden = false;

  const hasPt = Boolean(result.localised);
  $('#lang-toggle').hidden = !hasPt;
  $$('#lang-toggle button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === activeLang)));

  // Tab flags: number of hard violations per channel in the active language.
  const counts = {};
  for (const i of result.issues || []) {
    if (i.severity === 'violation' && i.language === activeLang) counts[i.channel] = (counts[i.channel] || 0) + 1;
  }
  $$('#tabs button').forEach((b) => {
    const tab = b.dataset.tab;
    b.setAttribute('aria-selected', String(tab === activeTab));
    b.innerHTML = esc(b.textContent.replace(/\d+$/, '').trim()) + (counts[tab] ? `<span class="tab-flag">${counts[tab]}</span>` : '');
  });

  renderIssues();
  renderTab();
  renderEconomics();
}

function renderIssues() {
  const box = $('#issues');
  const issues = (result.issues || []).filter((i) => i.language === activeLang);
  const violations = issues.filter((i) => i.severity === 'violation');
  const warnings = issues.filter((i) => i.severity === 'warning');
  box.hidden = false;
  box.className = 'issues ' + (violations.length ? 'has-violations' : warnings.length ? 'warnings-only' : 'clean');
  const lang = activeLang.toUpperCase();
  if (!issues.length) {
    box.textContent = `${lang}: every asset is within its character limit.`;
    return;
  }
  const describe = (i) => {
    const where = i.index === null || i.index === undefined ? i.field : `${i.field} ${i.index + 1}`;
    return `<li><code>${esc(i.channel)}</code> ${esc(where)}: ${i.note ? esc(i.note) : `${i.length} / ${i.limit}`}</li>`;
  };
  box.innerHTML =
    `<strong>${lang}: ${violations.length} over a hard limit${warnings.length ? `, ${warnings.length} over a soft target` : ''}.</strong> ` +
    `Flagged in the copy rather than silently trimmed; fix before you ship.` +
    `<ul>${violations.concat(warnings).map(describe).join('')}</ul>`;
}

function assetsForLang() {
  return activeLang === 'pt' && result.localised ? result.localised : result.assets;
}

function countCell(text, rule) {
  const len = String(text || '').length;
  const cls = len > rule.max ? (rule.hard ? 'over' : 'warn') : '';
  return `<span class="count ${cls}">${len}/${rule.max}</span>`;
}

function lineHtml(label, text, rule, bodyClass = '') {
  const len = String(text || '').length;
  const over = rule && len > rule.max && rule.hard;
  return `<div class="line ${over ? 'over' : ''}">
    <div><span class="line-label">${esc(label)}</span><div class="line-text ${bodyClass}">${esc(text)}</div></div>
    ${rule ? countCell(text, rule) : ''}
  </div>`;
}

function card(title, bodyHtml, copyPayload) {
  return `<article class="card">
    <div class="card-head"><span class="card-title">${esc(title)}</span>
      <button type="button" class="copy-btn" data-copy="${esc(copyPayload)}">Copy</button></div>
    <div class="card-body">${bodyHtml}</div>
  </article>`;
}

function renderTab() {
  const panel = $('#tab-panel');
  const a = assetsForLang();

  if (activeTab === 'research') {
    panel.innerHTML = renderResearch(result.context);
  } else if (activeTab === 'strategy') {
    panel.innerHTML = renderStrategy(result.strategy);
  } else if (activeTab === 'meta') {
    panel.innerHTML = (a.meta || []).map((ad, i) =>
      card(`Meta · variant ${i + 1}`,
        lineHtml('Primary text', ad.primary_text, LIMITS.meta.primary_text) +
        lineHtml('Headline', ad.headline, LIMITS.meta.headline) +
        lineHtml('Description', ad.description, LIMITS.meta.description),
        [ad.primary_text, ad.headline, ad.description].join('\n'))
    ).join('');
  } else if (activeTab === 'linkedin') {
    panel.innerHTML = (a.linkedin || []).map((ad, i) =>
      card(`LinkedIn · variant ${i + 1}`,
        lineHtml('Intro text', ad.intro_text, LIMITS.linkedin.intro_text) +
        lineHtml('Headline', ad.headline, LIMITS.linkedin.headline),
        [ad.intro_text, ad.headline].join('\n'))
    ).join('');
  } else if (activeTab === 'google') {
    const rows = (items, rule) => items.map((t, i) => {
      const len = String(t).length;
      return `<div class="line-row ${len > rule.max ? 'over' : ''}"><span class="idx">${i + 1}</span><span class="line-text">${esc(t)}</span>${countCell(t, rule)}<button type="button" class="mini-copy" data-copy="${esc(t)}" aria-label="Copy">⧉</button></div>`;
    }).join('');
    panel.innerHTML =
      card('Google RSA · 8 headlines', rows(a.google?.headlines || [], LIMITS.google.headline), (a.google?.headlines || []).join('\n')) +
      card('Google RSA · 4 descriptions', rows(a.google?.descriptions || [], LIMITS.google.description), (a.google?.descriptions || []).join('\n'));
  } else if (activeTab === 'audience') {
    panel.innerHTML = renderAudience(result.audience);
  } else if (activeTab === 'social') {
    panel.innerHTML = renderSocial(result.social);
  } else if (activeTab === 'lifecycle') {
    panel.innerHTML = renderLifecycle(result.activation, result.activationProblems);
  } else if (activeTab === 'handoff') {
    panel.innerHTML = renderHandoff(result.activation?.handoff);
  } else if (activeTab === 'measurement') {
    panel.innerHTML = renderMeasurement(result.activation, result.tracking);
  } else if (activeTab === 'email') {
    const e = a.email || {};
    panel.innerHTML =
      (e.emails || []).map((m, i) =>
        card(`Email ${i + 1}`,
          lineHtml('Subject', m.subject, LIMITS.email.subject) +
          lineHtml('Preview text', m.preview_text, LIMITS.email.preview_text) +
          lineHtml(`Body · ${String(m.body || '').trim().split(/\s+/).length} words`, m.body, null, 'body'),
          `Subject: ${m.subject}\nPreview: ${m.preview_text}\n\n${m.body}`)
      ).join('') +
      (e.branch_note ? `<div class="note"><strong>Branch between email 2 and 3:</strong> ${esc(e.branch_note)}</div>` : '');
  }
}

function renderStrategy(s) {
  if (!s) return '';
  const angles = (s.angles || []).map((an) => `<div class="angle ${an.name === s.lead_angle ? 'lead' : ''}">
      <span class="angle-name">${esc(an.name)}</span>${an.name === s.lead_angle ? '<span class="lead-tag">leads</span>' : ''}
      <p>${esc(an.summary)}</p><p><em>${esc(an.why_it_works)}</em></p></div>`).join('');
  return `<div class="prose">
    <section><h3>Angles</h3>${angles}</section>
    <section><h3>Why this one leads</h3><p>${esc(s.lead_reasoning)}</p></section>
    <section><h3>Hook per channel</h3><dl class="kv">${Object.entries(s.hooks || {}).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></section>
    <section><h3>Key messages</h3><ul>${(s.key_messages || []).map((m) => `<li>${esc(m)}</li>`).join('')}</ul></section>
  </div>`;
}

function renderResearch(c) {
  if (!c) return '';
  const tags = (arr, cls = '') => arr?.length ? `<div class="tag-list">${arr.map((t) => `<span class="tag ${cls}">${esc(t)}</span>`).join('')}</div>` : '<p>—</p>';
  const list = (arr) => arr?.length ? `<ul>${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p>—</p>';
  return `<div class="prose">
    ${c._truncated ? '<div class="note">This research output hit its length limit and was repaired; the last section may be incomplete. Fewer or shorter sources will fix it.</div>' : ''}
    <section><h3>Company</h3><p>${esc(c.company_summary)}</p>${c.positioning ? `<p><strong>Positioning:</strong> ${esc(c.positioning)}</p>` : ''}</section>
    <section><h3>Voice</h3>${list(c.voice?.observations)}
      <p style="margin-top:8px"><strong>Use:</strong></p>${tags(c.voice?.preferred_terms)}
      <p style="margin-top:8px"><strong>Avoid:</strong></p>${tags(c.voice?.avoid_terms, 'avoid')}</section>
    <section><h3>Proof points the copy may use</h3>${c.proof_points?.length ? `<ul class="proof">${c.proof_points.map((p) => `<li>${esc(p.claim)} <span class="src">${esc(p.source)}</span></li>`).join('')}</ul>` : '<p>None found. Copy is capability-led; nothing was invented.</p>'}</section>
    <section><h3>Product facts</h3>${list(c.product_facts)}</section>
    <section><h3>Audience insights</h3>${list(c.audience_insights)}</section>
    <section><h3>Competitors named</h3>${tags(c.competitors)}</section>
    ${c.glossary?.length ? `<section><h3>Glossary for localisation</h3><dl class="kv">${c.glossary.map((g) => `<dt>${esc(g.term)}</dt><dd>${esc(g.treatment)}</dd>`).join('')}</dl></section>` : ''}
    <section><h3>Gaps</h3><ul class="gap-list">${(c.gaps || []).map((g) => `<li>${esc(g)}</li>`).join('') || '<li>None</li>'}</ul></section>
    ${c.sources_used?.length ? `<section><h3>Sources used</h3>${tags(c.sources_used)}</section>` : ''}
  </div>`;
}

function renderLifecycle(act, problems) {
  const lc = act?.lifecycle;
  if (!lc) return '<div class="prose"><p>No lifecycle generated.</p></div>';
  const steps = (lc.steps || []).map((st) => {
    let main = '';
    if (st.type === 'email') main = `Send email ${st.email}`;
    else if (st.type === 'wait') main = `Wait ${st.days} day${st.days === 1 ? '' : 's'}`;
    else if (st.type === 'branch') main = `If: ${esc(st.signal)}`;
    else if (st.type === 'handoff') main = 'Hand off to sales';
    else main = 'Exit';
    return `<div class="flow-step ${esc(st.type)}"><span class="sid">${esc(st.id)}</span><span class="stype">${esc(st.type)}</span>
      <div><div class="smain">${main}</div>${st.note ? `<div class="snote">${esc(st.note)}</div>` : ''}
      ${st.type === 'branch' ? `<div class="sbranch">yes → <b>${esc(st.yes)}</b> &nbsp; no → <b>${esc(st.no)}</b></div>` : ''}</div></div>`;
  }).join('');
  const list = (arr) => arr?.length ? `<ul>${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p>—</p>';
  return `<div class="prose">
    ${problems?.length ? `<div class="problems"><strong>Structural checks flagged ${problems.length} issue${problems.length === 1 ? '' : 's'}:</strong> ${problems.map(esc).join('; ')}. Shown as generated; fix before building the workflow.</div>` : ''}
    <section><h3>Enrolment</h3><p>${esc(lc.entry)}</p></section>
    <section><h3>Workflow</h3><div class="flow">${steps}</div></section>
    <section><h3>Signals used</h3>${list(lc.signals_used)}</section>
    <section><h3>Exit rules</h3>${list(lc.exit_rules)}</section>
  </div>`;
}

function renderHandoff(h) {
  if (!h) return '<div class="prose"><p>No handoff plan generated.</p></div>';
  const list = (arr) => arr?.length ? `<ul>${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p>—</p>';
  const ol = (arr) => arr?.length ? `<ol>${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : '<p>—</p>';
  const max = (h.lead_score || []).reduce((n, r) => n + (Number(r.points) || 0), 0);
  return `<div class="prose">
    <section><h3>MQL definition</h3>${list(h.mql_definition)}</section>
    <section><h3>Lead score <span class="stage-tag">threshold ${esc(h.threshold)} of ${max}</span></h3>
      <table class="grid-table"><tr><th>Signal</th><th>Points</th><th>Why</th></tr>
      ${(h.lead_score || []).map((r) => `<tr><td>${esc(r.signal)}</td><td class="num">${esc(r.points)}</td><td>${esc(r.why)}</td></tr>`).join('')}</table></section>
    <section><h3>Service level</h3><p>${esc(h.sla)}</p></section>
    <section><h3>BDR procedure</h3>${ol(h.bdr_sop)}</section>
    <section><h3>Talk track</h3><div class="talk"><div>${esc(h.talk_track?.opening)}</div>
      ${(h.talk_track?.objections || []).map((o) => `<div class="obj">"${esc(o.objection)}"</div><div>${esc(o.response)}</div>`).join('')}</div></section>
    <section><h3>Disqualifiers</h3>${list(h.disqualifiers)}</section>
  </div>`;
}

function renderMeasurement(act, tracking) {
  const m = act?.measurement;
  const list = (arr) => arr?.length ? `<ul>${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p>—</p>';
  return `<div class="prose" style="max-width:none">
    ${m ? `<section><h3>KPI tree</h3><table class="grid-table"><tr><th>Stage</th><th>Metric</th><th>Target</th><th>Source of record</th></tr>
      ${(m.kpi_tree || []).map((k) => `<tr><td><span class="stage-tag ${esc(String(k.stage).toLowerCase())}">${esc(k.stage)}</span></td><td>${esc(k.metric)}</td><td class="mono">${esc(k.target)}</td><td>${esc(k.source)}</td></tr>`).join('')}</table></section>
    <section><h3>Funnel definitions</h3><dl class="kv">${(m.funnel || []).map((f) => `<dt>${esc(f.stage)}</dt><dd>${esc(f.definition)}</dd>`).join('')}</dl></section>
    <section><h3>Reporting</h3><p>${esc(m.reporting_cadence)}</p></section>
    <section><h3>Data quality</h3>${list(m.data_quality)}</section>` : ''}
    <section><h3>Experiments</h3><table class="grid-table"><tr><th>Channel</th><th>Hypothesis</th><th>Variants</th><th>Metric</th><th>Decision rule</th></tr>
      ${(act?.experiments || []).map((x) => `<tr><td class="mono">${esc(x.channel)}</td><td>${esc(x.hypothesis)}</td><td>${esc(x.variants)}</td><td>${esc(x.primary_metric)}</td><td>${esc(x.decision_rule)}</td></tr>`).join('')}</table></section>
    <section><h3>Tracking links <span class="stage-tag">campaign ${esc(tracking?.campaign)}</span></h3>
      <p class="snote">One convention, generated in code, stamped on every asset${tracking?.landing ? '' : '. No landing page given, so example.com is the placeholder'}.</p>
      <table class="grid-table"><tr><th>Asset</th><th>Lang</th><th>URL</th><th></th></tr>
      ${(tracking?.rows || []).map((r) => `<tr><td class="mono">${esc(r.channel)}-${esc(r.unit)}</td><td class="mono">${esc(r.language)}</td><td class="utm-url">${esc(r.url)}</td><td><button type="button" class="mini-copy" data-copy="${esc(r.url)}" aria-label="Copy">⧉</button></td></tr>`).join('')}</table></section>
  </div>`;
}

function renderAudience(a) {
  if (!a) return '<div class="prose"><p>Audience research runs when "Research online" is ticked. It uses web search to find how the customer actually talks about the problem.</p></div>';
  const list = (arr) => arr?.length ? `<ul>${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p>—</p>';
  const tags = (arr) => arr?.length ? `<div class="tag-list">${arr.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : '<p>—</p>';
  return `<div class="prose">
    <section><h3>Who</h3><p>${esc(a.who)}</p></section>
    <section><h3>Their words</h3>${tags(a.language)}</section>
    <section><h3>Pains</h3>${list(a.pains)}</section>
    <section><h3>Triggers</h3>${list(a.triggers)}</section>
    <section><h3>Objections</h3>${list(a.objections)}</section>
    <section><h3>Where they gather</h3>${list(a.where_they_gather)}</section>
    <section><h3>What they read</h3>${list(a.content_they_consume)}</section>
    <section><h3>What competitors tell them</h3>${(a.competitor_messages || []).length ? `<dl class="kv">${a.competitor_messages.map((c) => `<dt>${esc(c.competitor)}</dt><dd>"${esc(c.message)}" <span class="src">weak on: ${esc(c.weakness)}</span></dd>`).join('')}</dl>` : '<p>—</p>'}</section>
    <section><h3>Search terms</h3>${tags(a.search_terms)}</section>
    ${a.sources?.length ? `<section><h3>Sources</h3><ul>${a.sources.map((u) => `<li class="utm-url">${esc(u)}</li>`).join('')}</ul></section>` : ''}
  </div>`;
}

const SOCIAL_MAX = { linkedin: 3000, x: 280, instagram: 2200 };

function renderSocial(cal) {
  if (!cal?.posts?.length) return '<div class="prose"><p>No social calendar generated.</p></div>';
  const weeks = [[], [], [], []];
  cal.posts.forEach((p, i) => weeks[Math.min(3, Math.floor((p.day - 1) / 7))].push({ ...p, i }));
  const post = (p) => {
    const tags = (p.hashtags || []).map((t) => '#' + String(t).replace(/^#/, ''));
    const full = p.channel === 'x' ? [p.text, ...tags].join(' ') : p.text;
    const max = SOCIAL_MAX[p.channel] || 3000;
    const len = String(full || '').length;
    const copy = [p.text, tags.join(' ')].filter(Boolean).join('\n\n');
    return `<article class="post ${p.graphic?.svg ? '' : 'no-graphic'}">
      <div>
        <div class="post-head"><span class="post-day">Day ${p.day}</span><span class="chan ${esc(p.channel)}">${esc(p.channel)}</span><span class="pill">${esc(p.pillar)}</span></div>
        <div class="post-text">${esc(p.text)}</div>
        ${tags.length ? `<div class="post-tags">${esc(tags.join(' '))}</div>` : ''}
        ${p.cta ? `<div class="snote">CTA: ${esc(p.cta)}</div>` : ''}
        <div class="post-foot"><span class="count ${len > max ? 'over' : ''}">${len}/${max}</span><button type="button" class="copy-btn" data-copy="${esc(copy)}">Copy</button></div>
      </div>
      ${p.graphic?.svg ? `<div class="gfx">
        ${p.graphic.image ? `<div class="gfx-tabs"><button type="button" data-view="card" data-i="${p.i}" aria-pressed="${p.graphic.view !== 'photo'}">Card</button><button type="button" data-view="photo" data-i="${p.i}" aria-pressed="${p.graphic.view === 'photo'}">Photo</button></div>` : ''}
        ${p.graphic.view === 'photo' && p.graphic.image ? `<img src="${p.graphic.image}" alt="">` : p.graphic.svg}
        ${imagesAvailable && !p.graphic.image && p.graphic.image_prompt ? `<button type="button" class="mini-copy" data-gen="${p.i}">Generate image</button>` : ''}
        ${p.graphic.image_prompt ? `<div class="img-prompt">${esc(p.graphic.image_prompt)}</div>` : ''}
        <button type="button" class="mini-copy" data-png="${p.i}">Download PNG</button>
      </div>` : ''}
    </article>`;
  };
  const pending = cal.posts.filter((p) => p.graphic?.image_prompt && !p.graphic.image).length;
  const bar = imagesAvailable
    ? `<div class="social-bar"><span>${pending} post${pending === 1 ? '' : 's'} with a visual brief and no image yet.</span>${pending ? `<button type="button" class="btn-secondary" id="gen-all">Generate all ${pending} images (≈ €${(pending * 0.058).toFixed(2)})</button>` : ''}</div>`
    : `<div class="social-bar"><span>Image generation is off: add GEMINI_API_KEY to the server to turn the visual briefs below into pictures. The typographic cards work without it.</span></div>`;
  return bar + `<div class="pillars">${(cal.pillars || []).map((pl) => `<div><b>${esc(pl.name)}</b>${esc(pl.theme)}</div>`).join('')}</div>
    ${weeks.map((w, i) => w.length ? `<div class="week"><h3>Week ${i + 1} · ${w.length} posts</h3>${w.map(post).join('')}</div>` : '').join('')}`;
}

async function generateFor(i) {
  const p = result.social.posts[i];
  const btn = document.querySelector(`[data-gen="${i}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  try {
    const data = await postJson('/api/images/generate', { prompt: p.graphic.image_prompt, brandKit: result.brandKit || brandKit || undefined, aspect: '1:1' });
    p.graphic.image = `data:${data.mime};base64,${data.data}`;
    p.graphic.view = 'photo';
    imageUsage.images += data.usage.images;
    imageUsage.costEur += data.usage.costEur;
    renderEconomics();
  } catch (err) {
    toast(`Image failed: ${err.message}`);
  }
}

$('#tab-panel').addEventListener('click', async (e) => {
  const gen = e.target.closest('[data-gen]');
  if (gen && result) { await generateFor(Number(gen.dataset.gen)); renderTab(); return; }
  const all = e.target.closest('#gen-all');
  if (all && result) {
    all.disabled = true;
    const targets = result.social.posts.map((p, i) => (p.graphic?.image_prompt && !p.graphic.image ? i : -1)).filter((i) => i >= 0);
    for (const i of targets) { await generateFor(i); all.textContent = `Generating… ${targets.indexOf(i) + 1}/${targets.length}`; }
    renderTab();
    return;
  }
  const view = e.target.closest('[data-view]');
  if (view && result) { result.social.posts[Number(view.dataset.i)].graphic.view = view.dataset.view; renderTab(); }
});

/** Draw an image (data URL) onto a 1080 canvas, composite the logo bottom-right, return the canvas. */
function loadImg(src) {
  return new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = src; });
}

async function compositePng(src, name) {
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1080;
  const ctx = c.getContext('2d');
  const im = await loadImg(src);
  // cover-fit
  const s = Math.max(1080 / im.width, 1080 / im.height);
  ctx.drawImage(im, (1080 - im.width * s) / 2, (1080 - im.height * s) / 2, im.width * s, im.height * s);
  const logo = (result?.brandKit || brandKit)?.assets?.logo;
  if (logo) {
    try {
      const lg = await loadImg(logo);
      const w = 220, h = w * (lg.height / lg.width);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(1080 - 96 - w - 24, 1080 - 96 - h - 24, w + 48, h + 48);
      ctx.drawImage(lg, 1080 - 96 - w, 1080 - 96 - h, w, h);
    } catch { /* logo unreadable; ship without */ }
  }
  c.toBlob((png) => download(name, 'image/png', png), 'image/png');
}

/** SVG string -> PNG download via canvas. Fonts fall back to system sans. */
function downloadPng(svg, name) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 1080; c.height = 1080;
    c.getContext('2d').drawImage(img, 0, 0, 1080, 1080);
    URL.revokeObjectURL(url);
    c.toBlob((png) => download(name, 'image/png', png), 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); download(name.replace(/\.png$/, '.svg'), 'image/svg+xml', svg); };
  img.src = url;
}

$('#tab-panel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-png]');
  if (!b || !result) return;
  const p = result.social.posts[Number(b.dataset.png)];
  const name = `${clientSlug()}-day${p.day}-${p.channel}.png`;
  if (p.graphic.view === 'photo' && p.graphic.image) compositePng(p.graphic.image, name);
  else downloadPng(p.graphic.svg, name);
});

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b || !result) return;
  activeTab = b.dataset.tab;
  renderResult();
});

$('#lang-toggle').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-lang]');
  if (!b || !result) return;
  activeLang = b.dataset.lang;
  renderResult();
});

$('#tab-panel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (b) copyText(b.dataset.copy, b.classList.contains('copy-btn') ? b : null);
});

// ---------------------------------------------------------------------------
// Economics footer
// ---------------------------------------------------------------------------

function renderEconomics() {
  const e = result.economics;
  const extraIn = briefUsage?.input || 0;
  const extraOut = briefUsage?.output || 0;
  const extraCost = briefUsage?.costEur || 0;

  $('#econ-tokens').innerHTML = `${fmtInt(e.totalTokens + extraIn + extraOut)} <small>(${fmtInt(e.inputTokens + extraIn)} in / ${fmtInt(e.outputTokens + extraOut)} out)</small>`;
  $('#econ-cost').textContent = fmtEur(e.costEur + extraCost + imageUsage.costEur);
  $('#econ-time').textContent = fmtMs(e.generationMs);
  $('#econ-searches').textContent = e.webSearches ? String(e.webSearches) : '0';
  $('#econ-sources').textContent = e.sourceChars ? `${fmtInt(e.sourceChars)} ch` : 'none';

  const passes = Object.entries(e.passes).map(([k, p]) => `<span>${esc(k)} <b>${fmtInt(p.input + p.output)}</b> · ${fmtEur(p.costEur)} · ${fmtMs(p.ms)}</span>`);
  if (briefUsage) passes.unshift(`<span>brief parse <b>${fmtInt(extraIn + extraOut)}</b> · ${fmtEur(extraCost)}</span>`);
  if (imageUsage.images) passes.push(`<span>images <b>${imageUsage.images}</b> · ${fmtEur(imageUsage.costEur)}</span>`);
  $('#econ-passes').innerHTML = passes.join('');
  $('#economics').hidden = false;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

function download(name, mime, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** One row per asset field: channel, type, language, field, text, char count. */
function flattenAssets(assets, language, tracking) {
  const rows = [];
  const utm = (channel, unit) => tracking?.rows.find((r) => r.channel === channel && r.unit === unit && r.language === language)?.url || '';
  (assets.meta || []).forEach((ad, i) => ['primary_text', 'headline', 'description'].forEach((f) => rows.push(['meta', `variant ${i + 1}`, language, f, ad[f], utm('meta', `v${i + 1}`)])));
  (assets.linkedin || []).forEach((ad, i) => ['intro_text', 'headline'].forEach((f) => rows.push(['linkedin', `variant ${i + 1}`, language, f, ad[f], utm('linkedin', `v${i + 1}`)])));
  (assets.google?.headlines || []).forEach((h, i) => rows.push(['google', `headline ${i + 1}`, language, 'headline', h, utm('google', 'rsa')]));
  (assets.google?.descriptions || []).forEach((d, i) => rows.push(['google', `description ${i + 1}`, language, 'description', d, utm('google', 'rsa')]));
  (assets.email?.emails || []).forEach((m, i) => ['subject', 'preview_text', 'body'].forEach((f) => rows.push(['email', `email ${i + 1}`, language, f, m[f], utm('email', String(i + 1))])));
  if (assets.email?.branch_note) rows.push(['email', 'branch', language, 'branch_note', assets.email.branch_note, '']);
  return rows.map((r) => [r[0], r[1], r[2], r[3], r[4], String(r[4] || '').length, r[5]]);
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

$('#export-json').addEventListener('click', () => {
  if (!result) return;
  download(`${clientSlug()}-campaign.json`, 'application/json', JSON.stringify({ ...result, briefParse: briefUsage || undefined }, null, 2));
});

$('#export-csv').addEventListener('click', () => {
  if (!result) return;
  const rows = [['channel', 'type', 'language', 'field', 'text', 'char_count', 'tracking_url']];
  rows.push(...flattenAssets(result.assets, 'en', result.tracking));
  if (result.localised) rows.push(...flattenAssets(result.localised, 'pt', result.tracking));
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
  download(`${clientSlug()}-assets.csv`, 'text/csv;charset=utf-8', '\ufeff' + csv);
});

function clientSlug() {
  return (result?.brief?.clientName || result?.brief?.productName || 'campaign').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

$('#export-social').addEventListener('click', () => {
  if (!result?.social?.posts) return;
  const rows = [['day', 'channel', 'pillar', 'text', 'hashtags', 'cta', 'char_count', 'graphic_template', 'graphic_headline']];
  for (const p of result.social.posts) {
    const tags = (p.hashtags || []).map((t) => '#' + String(t).replace(/^#/, '')).join(' ');
    const len = (p.channel === 'x' ? [p.text, tags].filter(Boolean).join(' ') : p.text || '').length;
    rows.push([p.day, p.channel, p.pillar, p.text, tags, p.cta || '', len, p.graphic?.template || '', p.graphic?.headline || '']);
  }
  download(`${clientSlug()}-social.csv`, 'text/csv;charset=utf-8', '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\n'));
});
