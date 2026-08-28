/**
 * Palette and font extraction.
 *
 * These are pure functions over CSS text, so they need no server and no
 * network. The cases are the ones that were wrong in production against a
 * real site rather than invented shapes: a framework bundle whose own palette
 * outnumbers the brand's, and an icon font declared as a font family.
 */
const assert = require('assert');
const { extractPalette, extractFonts } = require('../web/core/scraper.js');

(async () => {
  // A hand-written stylesheet: the brand's colours are the only colours.
  const plain = '.btn{background:#0F5C6B}.accent{color:#E4570F}body{color:#14181F;background:#fff}';
  const simple = extractPalette(plain);
  assert.equal(simple.accents[0], '#0f5c6b', 'a plain stylesheet ranks its own colours first');
  assert.equal(simple.uncertain, false, 'nothing boilerplate about a hand-written palette');

  // A framework bundle. Bootstrap's link blue is declared far more often than
  // the brand's yellow, and Material's swatches are declared once each in a
  // block - the exact shape that made bne IntelliNews report Bootstrap's
  // alert colours as its brand.
  const material = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
    '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b',
    '#ffc107', '#ff9800', '#ff5722', '#795548', '#9e9e9e', '#607d8b'];
  const dump = material
    .map((c, i) => `.md-${i}{color:${c}}.md-${i}-bg{background:${c}}.md-${i}-br{border-color:${c}}`)
    .join('');
  // The greys any real bundle is padded with. They are not accents, but they
  // count towards the bundle being large enough for a plateau to mean
  // something.
  const filler = Array.from({ length: 30 }, (_, i) => {
    const v = (i * 8 + 10).toString(16).padStart(2, '0');
    return `.f${i}{color:#${v}${v}${v}}`;
  }).join('');
  const bundle =
    '.a{color:#337ab7}'.repeat(20) +          // Bootstrap link blue, everywhere
    '.alert-danger{color:#a94442}'.repeat(9) + // and its alert colours
    dump + filler +
    '.masthead{background:#f4d010}.byline{color:#9e1d0a}'; // the actual brand

  const kit = extractPalette(bundle);
  assert.equal(kit.accents[0], '#f4d010', 'the brand colour outranks the framework it is buried in');
  assert.ok(kit.accents.includes('#9e1d0a'), 'and so does the second brand colour');
  assert.ok(
    kit.accents.indexOf('#337ab7') === -1 || kit.accents.indexOf('#337ab7') > 1,
    'Bootstrap blue is ranked last, not first, despite being the most frequent'
  );
  assert.equal(kit.uncertain, false, 'a real brand colour was found, so this is not a guess');

  // Nothing but framework. Saying so beats reporting Bootstrap as a brand.
  const only = '.a{color:#337ab7}'.repeat(20) + '.b{color:#a94442}'.repeat(9);
  assert.equal(extractPalette(only).uncertain, true, 'an all-boilerplate palette is declared uncertain');

  // rgb() in every shape. Traced SVGs emit percentages, which used to be
  // skipped entirely by a pattern that only allowed commas and digits.
  const rgb = extractPalette('.a{color:rgb(158,29,10)}.b{color:rgb(0% ,0%, 0%)}.c{color:rgb(244 208 16)}');
  assert.ok(rgb.accents.includes('#9e1d0a'), 'comma rgb is read');
  assert.ok(rgb.accents.includes('#f4d010'), 'space-separated rgb is read');
  assert.equal(rgb.dark, '#000000', 'percentage rgb is read');

  // Icon sets are declared as font families but are not typefaces.
  const fonts = extractFonts(
    'body{font-family:"Open Sans",sans-serif}.i{font-family:FontAwesome}.j{font-family:"Material Icons"}'
  );
  assert.deepEqual(fonts, ['Open Sans'], 'icon fonts are not reported as brand typefaces');

  console.log('scraper tests: ok');
})().catch((e) => { console.error('scraper tests FAILED', e); process.exit(1); });
