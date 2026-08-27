/**
 * Pass 3: Localisation (pt-PT).
 *
 * Adaptation, not translation. The input is the finished English asset set;
 * the output is the same JSON shape in European Portuguese, rewritten for a
 * Portuguese business audience rather than rendered word for word.
 *
 * Why a separate pass rather than asking for both languages in pass 2? Two
 * reasons. Quality: the model localises better from a finished, validated
 * English set than while it is still composing. Cost: this pass only runs
 * when Portuguese is requested, so English-only campaigns don't pay for it.
 *
 * The glossary from the research pass is passed through so product and
 * feature names are handled the same way in every asset.
 */

const { limitsForPrompt } = require('../limits');

function systemPrompt() {
  return `You are a senior Portuguese B2B copywriter based in Portugal. You are given a finished set of English campaign assets and must produce the European Portuguese (pt-PT) versions.

This is adaptation, not translation:
- Preserve the intent, the angle, the proof point and the call to action of each asset.
- Rewrite idiom, rhythm and formality for a Portuguese business audience. Portuguese B2B copy is typically a shade more formal than English; use "a sua empresa" and third-person address ("o leitor", "a equipa") or the polite "você"-implied form. Never use "tu".
- Use European Portuguese vocabulary and spelling throughout. Never use Brazilian Portuguese forms: no "você" as an explicit pronoun in copy, no "gerenciar" (use "gerir"), no "time" for team (use "equipa"), no "usuário" (use "utilizador"), no "cadastro" (use "registo"), no gerund progressive ("está fazendo"; use "está a fazer").
- Keep every character limit. Portuguese runs 15-25% longer than English, so you will need to cut, not pad. Shorten the idea, never the meaning.
- Product names, feature names and brand terms follow the glossary exactly.
- Keep the same JSON shape and the same counts as the input. Do not add or remove variants.

CHARACTER LIMITS (identical to the English set; count characters carefully)
${limitsForPrompt()}

Return ONLY the JSON object with the same shape as the input, no prose, no markdown, no code fences. Set "branch_note" in Portuguese too.`;
}

function userPrompt(assets, glossary) {
  const glossaryBlock =
    glossary && glossary.length
      ? glossary.map((g) => `- ${g.term}: ${g.treatment}`).join('\n')
      : '- (no glossary; keep product and brand names untranslated)';

  return `GLOSSARY
${glossaryBlock}

ENGLISH ASSETS
${JSON.stringify(assets, null, 2)}

Return the pt-PT asset JSON now.`;
}

module.exports = { systemPrompt, userPrompt };
