/**
 * Results ingestion: a CSV from an ad platform or a hand-made sheet, matched to
 * the campaign's assets and judged in code.
 *
 * Matching order: utm_content, then exact text, then normalised text. Anything
 * unmatched is kept and listed. Nothing is silently dropped, because a row the
 * tool quietly ignored is a number the client will ask about later.
 */
const { verdictFor } = require('@core/verdicts');
const { trackingPlan } = require('@core/utm');

export type Mapping = Record<string, string>;

/** Minimal CSV parse: quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const clean = String(text).replace(/^\ufeff/, '').replace(/\r\n/g, '\n');
  const cells: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') { if (clean[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); cells.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); cells.push(row); }
  const columns = (cells.shift() || []).map((c) => c.trim());
  const rows = cells
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? '').trim()])));
  return { columns, rows };
}

/** Guess which column is which, so the mapping UI starts from something sensible. */
export function suggestMapping(columns: string[]): Mapping {
  const find = (...pats: RegExp[]) => columns.find((c) => pats.some((p) => p.test(c))) || '';
  return {
    variant: find(/utm_content/i, /ad name/i, /^ad$/i, /creative/i, /variant/i, /campaign name/i),
    impressions: find(/impress/i, /^impr/i),
    clicks: find(/^clicks?$/i, /link clicks/i, /^click/i),
    conversions: find(/conversion/i, /result/i, /lead/i, /signup/i, /purchase/i),
    spend: find(/spend/i, /cost/i, /amount/i),
  };
}

const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Match result rows to assets. Returns rows with matchedAssetId, plus the
 * unmatched labels so they can be shown rather than lost.
 */
export function matchRows(rows: Record<string, string>[], mapping: Mapping, tracking: any, assets: any) {
  const byUtm = new Map<string, string>();
  for (const r of tracking?.rows || []) byUtm.set(String(r.utm_content).toLowerCase(), `${r.channel}.${r.unit}.${r.language}`);

  const byText = new Map<string, string>();
  const add = (text: string, id: string) => { const k = norm(text); if (k && !byText.has(k)) byText.set(k, id); };
  (assets?.meta || []).forEach((a: any, i: number) => { add(a.headline, `meta.v${i + 1}.en`); add(a.primary_text, `meta.v${i + 1}.en`); });
  (assets?.linkedin || []).forEach((a: any, i: number) => { add(a.headline, `linkedin.v${i + 1}.en`); add(a.intro_text, `linkedin.v${i + 1}.en`); });
  (assets?.email?.emails || []).forEach((m: any, i: number) => add(m.subject, `email.${i + 1}.en`));

  const num = (v: string) => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
  const out = [] as any[];
  const unmatched: string[] = [];

  for (const r of rows) {
    const label = r[mapping.variant] || '';
    const key = norm(label);
    const matched = byUtm.get(String(label).toLowerCase()) || byText.get(key) || null;
    if (!matched && label) unmatched.push(label);
    out.push({
      label, matchedAssetId: matched,
      impressions: num(r[mapping.impressions]),
      clicks: num(r[mapping.clicks]),
      conversions: num(r[mapping.conversions]),
      spend: num(r[mapping.spend]),
    });
  }
  return { rows: out, unmatched: [...new Set(unmatched)] };
}

/**
 * Judge every experiment in the activation plan against the matched rows.
 * Variants are found by the channel and the numbers in "variant 1 vs variant 3".
 */
export function computeVerdicts(experiments: any[], matched: any[]) {
  return (experiments || []).map((experiment) => {
    const channel = String(experiment.channel || '').toLowerCase();
    const wanted = String(experiment.variants || '').match(/\d+/g) || [];
    const inChannel = matched.filter((r) => (r.matchedAssetId || '').startsWith(channel + '.'));

    let variants = inChannel;
    if (wanted.length >= 2) {
      const picked = wanted.map((n) => inChannel.find((r) => (r.matchedAssetId || '').includes(`v${n}.`) || (r.matchedAssetId || '').includes(`.${n}.`))).filter(Boolean);
      if (picked.length >= 2) variants = picked as any[];
    }

    const shaped = variants.map((r) => ({
      label: r.label || r.matchedAssetId,
      trials: r.clicks || r.impressions || 0,
      conversions: r.conversions || 0,
    }));
    return { experiment, channel, ...verdictFor(experiment, shaped) };
  });
}

export { trackingPlan };
