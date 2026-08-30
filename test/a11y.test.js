/**
 * Colour contrast, as a rule rather than an inspection.
 *
 * A browser sweep of the workbench found every error message, violation flag
 * and the cost figure below WCAG AA: --ember at #e4570f is 3.42:1 on the
 * panel, where 4.5:1 is required. That is the text most worth reading in the
 * product, and it had been wrong since the palette was written, because
 * nothing checked it and it looks fine to anyone who does not need the
 * contrast.
 *
 * This reads the tokens out of globals.css and checks each text colour against
 * every surface it is actually used on. It needs no browser and no server, so
 * it runs with the rest of the suite rather than in a periodic audit that
 * nobody runs.
 *
 * Non-text use of a colour is deliberately not checked here: borders, fills
 * and the brand mark need 3:1 under WCAG 1.4.11, which --ember already meets.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Text colour -> the backgrounds it lands on. Adding a pairing here is how a
// new combination gets covered.
const PAIRS = [
  ['--ink', ['--bg', '--panel', '--panel-2']],
  ['--muted', ['--bg', '--panel', '--panel-2']],
  ['--teal', ['--bg', '--panel']],
  ['--teal-ink', ['--panel', '--teal-soft']],
  ['--ember-text', ['--panel', '--panel-2', '--ember-soft']],
  ['--amber', ['--amber-soft']],
];
const AA = 4.5;

(async () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'web', 'app', 'globals.css'), 'utf8');
  const tokens = {};
  for (const [, name, value] of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,8})\s*;/gi)) {
    if (!(name in tokens)) tokens[name] = value.toLowerCase();
  }

  const rgb = (hex) => {
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const luminance = (hex) => {
    const [r, g, b] = rgb(hex).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  let checked = 0;
  for (const [fg, backgrounds] of PAIRS) {
    assert.ok(tokens[fg], `${fg} is not defined in globals.css`);
    for (const bgName of backgrounds) {
      assert.ok(tokens[bgName], `${bgName} is not defined in globals.css`);
      const ratio = contrast(tokens[fg], tokens[bgName]);
      assert.ok(
        ratio >= AA,
        `${fg} (${tokens[fg]}) on ${bgName} (${tokens[bgName]}) is ${ratio.toFixed(2)}:1, ` +
          `below the ${AA}:1 WCAG AA needs for body text`
      );
      checked++;
    }
  }

  // The distinction the palette rests on: --ember stays for fills, so it must
  // not quietly become a text colour again.
  assert.ok(
    !/color:\s*var\(--ember\)/.test(css),
    'use --ember-text for text; --ember is for borders and fills, and fails AA as text'
  );

  console.log(`a11y tests: ok (${checked} colour pairs)`);
})().catch((e) => { console.error('a11y tests FAILED', e); process.exit(1); });
