/**
 * Compliance checks. Code, not model. Run as a tool mid-agent and as a gate
 * on submit. Flags, never silent fixes.
 *
 * Rules:
 *   avoid       the client's avoid terms (from research / voice rules)
 *   competitor  competitor names from context, unless the agent is allowed them
 *   superlative a global list of words that make B2B copy sound like a brochure
 *   placeholder leaked scaffolding: [brackets], lorem, TBD, {curly}
 *   brand       brand name present but with wrong casing
 *   claim       a number, %, currency or comparative not covered by an approved
 *               claim (only when an approved-claims list is supplied)
 *   pt-br       Brazilian forms in text marked as pt-PT
 */

const SUPERLATIVES = ['revolutionary', 'game-changing', 'game changing', 'cutting-edge', 'cutting edge', 'seamless', 'seamlessly', 'unlock', 'empower', 'empowering', 'ai-powered', 'world-class', 'best-in-class', 'next-generation', 'synergy', 'leverage', 'disrupt', 'supercharge', 'effortless', 'robust', 'holistic'];
// Brazilian forms. Matched with a unicode-aware word boundary (see wordRe);
// JavaScript's \b stops at accented letters, so "Você" would slip through.
const PT_BR_WORDS = ['você', 'vocês', 'gerenciar', 'gerenciamento', 'gerencia', 'usuário', 'usuários', 'usuária', 'cadastro', 'cadastrar', 'celular', 'ônibus', 'a gente', 'legal', 'bacana'];
const PT_BR_PATTERNS = [/est(á|ão|amos|ou|ava) (fazendo|usando|tendo|indo|vendo|trabalhando|criando)/i, /\btime\b(?! (de|do|da|zone|line))/i];

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (term) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(term)}(?=$|[^\\p{L}\\p{N}])`, 'iu');

/**
 * Flatten any output (assets, social calendar, landing page, plain list)
 * into [{ path, text }] so one scanner handles every agent.
 */
function texts(output, path = '') {
  const out = [];
  const walk = (v, p) => {
    if (typeof v === 'string') { if (v.trim()) out.push({ path: p, text: v }); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${p}[${i}]`)); return; }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (['svg', 'image', 'image_prompt', 'url', 'utm_content', 'source', 'sources', 'template', 'view'].includes(k)) continue;
        walk(x, p ? `${p}.${k}` : k);
      }
    }
  };
  walk(output, path);
  return out;
}

/**
 * @param {object} output       any agent output
 * @param {object} rules        { avoid: [], competitors: [], brandName, allowCompetitors, approvedClaims: [] | null, language: 'en'|'pt' }
 * @returns {Array<{path, rule, detail, severity}>}
 */
function checkCompliance(output, rules = {}) {
  const flags = [];
  const avoid = (rules.avoid || []).filter(Boolean);
  const competitors = rules.allowCompetitors ? [] : (rules.competitors || []).filter((c) => c && !/status quo|spreadsheet|manual/i.test(c));
  const brand = rules.brandName;
  const claims = Array.isArray(rules.approvedClaims) ? rules.approvedClaims.map((c) => String(c.text || c).toLowerCase()) : null;

  for (const { path, text } of texts(output)) {
    for (const t of avoid) if (wordRe(t).test(text)) flags.push({ path, rule: 'avoid', detail: `uses avoid term "${t}"`, severity: 'violation' });
    for (const c of competitors) if (wordRe(c).test(text)) flags.push({ path, rule: 'competitor', detail: `names competitor "${c}"`, severity: 'violation' });
    for (const w of SUPERLATIVES) if (wordRe(w).test(text)) flags.push({ path, rule: 'superlative', detail: `"${w}"`, severity: 'warning' });
    if (/\[[^\]]{1,40}\]|\{[a-z_ ]{1,30}\}|\blorem\b|\bTBD\b|\bTODO\b|\bxx+\b/i.test(text)) flags.push({ path, rule: 'placeholder', detail: 'looks like leftover scaffolding', severity: 'violation' });
    if (brand && !/hashtags\[\d+\]$/.test(path)) { // hashtags are conventionally lower-case
      const m = text.match(new RegExp(`\\b${escapeRe(brand)}\\b`, 'i'));
      if (m && m[0] !== brand) flags.push({ path, rule: 'brand', detail: `"${m[0]}" should be "${brand}"`, severity: 'violation' });
    }
    if (claims) {
      const claimy = text.match(/\b\d[\d,.]*\s?(%|percent|x\b|days?|hours?|weeks?|months?|banks?|customers?|users?)|\b(faster|cheaper|slower|more than|less than|fewer|twice|double|triple)\b|[€$£]\s?\d/gi) || [];
      for (const hit of claimy) {
        const sentence = (text.split(/(?<=[.!?])\s+/).find((s) => s.includes(hit)) || text).toLowerCase();
        const covered = claims.some((c) => c.split(/\s+/).filter((w) => w.length > 3).filter((w) => sentence.includes(w)).length >= 3);
        if (!covered) flags.push({ path, rule: 'claim', detail: `"${hit.trim()}" is not covered by an approved claim`, severity: 'violation' });
      }
    }
    if (rules.language === 'pt') {
      for (const w of PT_BR_WORDS) if (wordRe(w).test(text)) flags.push({ path, rule: 'pt-br', detail: `Brazilian form "${w}"`, severity: 'violation' });
      for (const re of PT_BR_PATTERNS) { const m = text.match(re); if (m) flags.push({ path, rule: 'pt-br', detail: `Brazilian form "${m[0]}"`, severity: 'violation' }); }
    }
  }
  // de-duplicate identical flags
  const seen = new Set();
  return flags.filter((f) => { const k = f.path + f.rule + f.detail; if (seen.has(k)) return false; seen.add(k); return true; });
}

module.exports = { checkCompliance, texts, SUPERLATIVES };
