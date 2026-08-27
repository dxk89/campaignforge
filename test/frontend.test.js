/** Front-end test: mock server + fixture site + jsdom. Run: node test/frontend.test.js */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const server = spawn('node', ['legacy/server.js'], { cwd: root, env: { ...process.env, MOCK_CLAUDE: '1', PORT: '3111' }, stdio: 'ignore' });
const site = spawn('python3', ['-m', 'http.server', '8099'], { cwd: path.join(__dirname, 'fixture-site'), stdio: 'ignore' });
const stop = () => { server.kill(); site.kill(); };
process.on('exit', stop);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await wait(1500);
  const html = fs.readFileSync(path.join(root, 'legacy/public/index.html'), 'utf8').replace(/<link[^>]+googleapis[^>]*>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost:3111/', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = (u, o) => fetch(new URL(u, 'http://localhost:3111/').href, o);
  w.FormData = FormData; w.Blob = Blob; w.File = File;
  w.crypto = { randomUUID: () => require('crypto').randomUUID() };
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  w.navigator.clipboard = { writeText: async () => {} };
  w.HTMLAnchorElement.prototype.click = function () { console.log('download:', this.download); };
  const errors = [];
  w.addEventListener('error', (e) => errors.push(e.message));
  w.eval(fs.readFileSync(path.join(root, 'legacy/public/app.js'), 'utf8'));
  const d = w.document;

  d.querySelector('#site-input').value = 'http://localhost:8099'; d.querySelector('#site-scan').click(); await wait(800);
  console.log('brand kit shown:', !d.querySelector('#brand-kit').hidden, '| client:', d.querySelector('#brief-form').elements.clientName.value);
  const f = d.querySelector('#brief-form');
  f.elements.productName.value = 'Ledgerline'; f.elements.productDescription.value = 'Reconciliation'; f.elements.targetAudience.value = 'Finance leads';
  f.querySelector('input[value="pt"]').checked = true; d.querySelector('#web-research').checked = true;
  f.dispatchEvent(new w.Event('submit', { cancelable: true }));
  await wait(10000);
  const chain = [...d.querySelectorAll('#chain li')].map((l) => l.dataset.state).join(',');
  console.log('chain:', chain);
  console.log('footer:', d.querySelector('#econ-tokens').textContent, d.querySelector('#econ-cost').textContent);
  for (const tab of ['research', 'audience', 'strategy', 'meta', 'linkedin', 'google', 'email', 'social', 'lifecycle', 'handoff', 'measurement']) {
    d.querySelector(`#tabs [data-tab="${tab}"]`).click();
    console.log(tab.padEnd(12), 'ok |', d.querySelector('#tab-panel').children.length, 'blocks');
  }
  d.querySelector('#tabs [data-tab="social"]').click(); await wait(200);
  d.querySelector('[data-gen]').click(); await wait(900);
  console.log('image generated:', d.querySelectorAll('.gfx img').length === 1);
  d.querySelector('#tabs [data-tab="email"]').click(); d.querySelector('#lang-toggle [data-lang="pt"]').click();
  console.log('PT:', d.querySelector('#tab-panel .line-text').textContent.slice(0, 40));
  d.querySelector('#export-csv').click(); d.querySelector('#export-json').click(); d.querySelector('#export-social').click();
  console.log('JS errors:', errors);
  const ok = chain === 'done,done,done,done,done,done,done' && errors.length === 0;
  console.log(ok ? 'frontend tests: ok' : 'frontend tests FAILED');
  stop();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('frontend tests FAILED', e); stop(); process.exit(1); });
