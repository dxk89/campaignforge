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
  research: 'Researching your company material',
  strategy: 'Choosing the angle',
  assets: 'Writing every channel',
  localise: 'Adapting for Portugal',
};

const MAX_TOTAL_SOURCE_CHARS = 60000;

let sources = [];
let result = null;
let briefUsage = null;
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
    productName: form.elements.productName.value.trim(),
    productDescription: form.elements.productDescription.value.trim(),
    targetAudience: form.elements.targetAudience.value.trim(),
    objective: form.elements.objective.value,
    tone: form.elements.tone.value,
    languages,
    webResearch: $('#web-research').checked,
    companyUrl: form.elements.companyUrl.value.trim() || undefined,
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
  const { sources: srcs, webResearch, companyUrl, ...briefFields } = brief;
  const passes = {};
  const started = Date.now();
  let current = null;

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

    const s = await run('strategy', { brief: briefFields, context });
    const a = await run('assets', { brief: briefFields, strategy: s.strategy, context });
    const issues = [...(a.issues || [])];

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
      strategy: s.strategy,
      assets: a.assets,
      localised,
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
  $('#econ-cost').textContent = fmtEur(e.costEur + extraCost);
  $('#econ-time').textContent = fmtMs(e.generationMs);
  $('#econ-searches').textContent = e.webSearches ? String(e.webSearches) : '0';
  $('#econ-sources').textContent = e.sourceChars ? `${fmtInt(e.sourceChars)} ch` : 'none';

  const passes = Object.entries(e.passes).map(([k, p]) => `<span>${esc(k)} <b>${fmtInt(p.input + p.output)}</b> · ${fmtEur(p.costEur)} · ${fmtMs(p.ms)}</span>`);
  if (briefUsage) passes.unshift(`<span>brief parse <b>${fmtInt(extraIn + extraOut)}</b> · ${fmtEur(extraCost)}</span>`);
  $('#econ-passes').innerHTML = passes.join('');
  $('#economics').hidden = false;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

function download(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** One row per asset field: channel, type, language, field, text, char count. */
function flattenAssets(assets, language) {
  const rows = [];
  (assets.meta || []).forEach((ad, i) => ['primary_text', 'headline', 'description'].forEach((f) => rows.push(['meta', `variant ${i + 1}`, language, f, ad[f]])));
  (assets.linkedin || []).forEach((ad, i) => ['intro_text', 'headline'].forEach((f) => rows.push(['linkedin', `variant ${i + 1}`, language, f, ad[f]])));
  (assets.google?.headlines || []).forEach((h, i) => rows.push(['google', `headline ${i + 1}`, language, 'headline', h]));
  (assets.google?.descriptions || []).forEach((d, i) => rows.push(['google', `description ${i + 1}`, language, 'description', d]));
  (assets.email?.emails || []).forEach((m, i) => ['subject', 'preview_text', 'body'].forEach((f) => rows.push(['email', `email ${i + 1}`, language, f, m[f]])));
  if (assets.email?.branch_note) rows.push(['email', 'branch', language, 'branch_note', assets.email.branch_note]);
  return rows.map((r) => [...r, String(r[4] || '').length]);
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

$('#export-json').addEventListener('click', () => {
  if (!result) return;
  const name = (result.strategy?.lead_angle || 'campaign').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  download(`campaign-forge-${name}.json`, 'application/json', JSON.stringify({ ...result, briefParse: briefUsage || undefined }, null, 2));
});

$('#export-csv').addEventListener('click', () => {
  if (!result) return;
  const rows = [['channel', 'type', 'language', 'field', 'text', 'char_count']];
  rows.push(...flattenAssets(result.assets, 'en'));
  if (result.localised) rows.push(...flattenAssets(result.localised, 'pt'));
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
  download('campaign-forge-assets.csv', 'text/csv;charset=utf-8', '\ufeff' + csv);
});
