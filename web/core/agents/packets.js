/**
 * Packets: what an agent is shown when it starts.
 *
 * Assembled in code, never by another model, so what each agent sees is
 * deterministic and inspectable. A packet carries the user turn (the
 * prompt text) plus the structured context tools and validators need:
 * brief, company context, audience, brand kit, compliance rules, memory.
 */

const research = require('../prompts/research');
const audience = require('../prompts/audience');
const memory = require('../memory');

/** Company context plus audience research plus client memory, as one block. */
function contextBlock(context, aud, mem = {}) {
  const ctx = context || research.emptyContext();
  const parts = [research.contextForPrompt(ctx), audience.audienceForPrompt(aud)];
  if (mem.learnings?.length) parts.push(`WHAT HAS WORKED FOR THIS CLIENT (approved learnings from results)\n${mem.learnings.map((l) => `- ${l.statement}`).join('\n')}`);
  if (mem.corrections?.length) parts.push(`CORRECTIONS THE EDITOR HAS GIVEN BEFORE (do not repeat these mistakes)\n${mem.corrections.map((c) => `- ${c.note}`).join('\n')}`);
  if (mem.exemplars?.length) parts.push(`EXAMPLES THIS CLIENT APPROVED (match this standard and voice)\n${mem.exemplars.map((e, i) => `${i + 1}. ${e.text}`).join('\n')}`);
  return parts.filter(Boolean).join('\n\n');
}

/**
 * Compliance rules for the writers, from context and (when it exists) the
 * approved-claims registry. Without a registry, anything stated in the
 * research context or the brief counts as approved, and claim flags are
 * warnings; with one, only registered claims count and flags are violations.
 */
function buildRules(brief, context, approvedClaims) {
  const ctx = context || {};
  const fallback = [
    ...(ctx.proof_points || []).map((p) => p.claim),
    ...(ctx.product_facts || []),
    ...(ctx.campaign_facts || []),
    brief.productDescription || '',
  ].filter(Boolean);
  return {
    avoid: ctx.voice?.avoid_terms || [],
    competitors: ctx.competitors || [],
    brandName: brief.clientName || brief.productName,
    approvedClaims: approvedClaims || fallback,
    claimSeverity: approvedClaims ? 'violation' : 'warning',
  };
}

async function loadMemory({ clientId, agent, channel, objective }) {
  const [exemplars, learnings, corrections, approvedClaims] = await Promise.all([
    memory.exemplars({ clientId, agent, channel, objective }),
    memory.learnings({ clientId }),
    memory.corrections({ clientId, agent }),
    memory.approvedClaims({ clientId }),
  ]);
  return { exemplars, learnings, corrections, approvedClaims };
}

module.exports = { contextBlock, buildRules, loadMemory };
