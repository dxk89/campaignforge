export const fmtInt = (n: number) => Number(n || 0).toLocaleString('en-GB');
export const fmtEur = (n: number) => '€' + Number(n || 0).toFixed(4);
export const fmtMs = (ms: number) => (ms / 1000).toFixed(1) + 's';
export const wordCount = (s: string) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

/** Mirrors lib/limits.js. Kept here so counters render without a round trip. */
export const LIMITS = {
  meta: { primary_text: { max: 125, hard: false }, headline: { max: 40, hard: true }, description: { max: 30, hard: true } },
  linkedin: { intro_text: { max: 150, hard: false }, headline: { max: 70, hard: true } },
  google: { headline: { max: 30, hard: true }, description: { max: 90, hard: true } },
  email: { subject: { max: 60, hard: true }, preview_text: { max: 90, hard: false } },
  social: { linkedin: 3000, x: 280, instagram: 2200 } as Record<string, number>,
};
