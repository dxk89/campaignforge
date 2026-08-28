/**
 * Campaign exports. Pure functions so they can be unit-tested without driving
 * a download; `download` is the only browser-dependent part.
 */

export const clientSlug = (name: string) =>
  String(name || 'campaign').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (rows: unknown[][]) => '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\n');

/** One row per asset field: channel, type, language, field, text, char_count, tracking_url. */
export function flattenAssets(assets: any, language: string, tracking?: any): unknown[][] {
  if (!assets) return [];
  const utm = (channel: string, unit: string) =>
    tracking?.rows?.find((r: any) => r.channel === channel && r.unit === unit && r.language === language)?.url || '';
  const rows: unknown[][] = [];
  const push = (channel: string, type: string, field: string, text: string, url: string) =>
    rows.push([channel, type, language, field, text, String(text || '').length, url]);

  (assets.meta || []).forEach((ad: any, i: number) =>
    ['primary_text', 'headline', 'description'].forEach((f) => push('meta', `variant ${i + 1}`, f, ad[f], utm('meta', `v${i + 1}`))));
  (assets.linkedin || []).forEach((ad: any, i: number) =>
    ['intro_text', 'headline'].forEach((f) => push('linkedin', `variant ${i + 1}`, f, ad[f], utm('linkedin', `v${i + 1}`))));
  (assets.google?.headlines || []).forEach((h: string, i: number) => push('google', `headline ${i + 1}`, 'headline', h, utm('google', 'rsa')));
  (assets.google?.descriptions || []).forEach((d: string, i: number) => push('google', `description ${i + 1}`, 'description', d, utm('google', 'rsa')));
  (assets.email?.emails || []).forEach((m: any, i: number) =>
    ['subject', 'preview_text', 'body'].forEach((f) => push('email', `email ${i + 1}`, f, m[f], utm('email', String(i + 1)))));
  if (assets.email?.branch_note) push('email', 'branch', 'branch_note', assets.email.branch_note, '');
  return rows;
}

export function socialRows(social: any): unknown[][] {
  const rows: unknown[][] = [['day', 'date', 'channel', 'pillar', 'text', 'hashtags', 'cta', 'char_count', 'graphic_template', 'graphic_headline']];
  for (const p of social?.posts || []) {
    const tags = (p.hashtags || []).map((t: string) => '#' + String(t).replace(/^#/, '')).join(' ');
    const len = (p.channel === 'x' ? [p.text, tags].filter(Boolean).join(' ') : p.text || '').length;
    rows.push([p.day, p.date || '', p.channel, p.pillar, p.text, tags, p.cta || '', len, p.graphic?.template || '', p.graphic?.headline || '']);
  }
  return rows;
}

export function download(name: string, mime: string, content: BlobPart) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
