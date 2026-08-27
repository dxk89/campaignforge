/**
 * Client memory interface.
 *
 * Agents are shown exemplars (outputs a human approved), learnings (from
 * results) and corrections (from the Critic) for the client they are working
 * on. Until the client library exists (infrastructure plan, Phase 1) every
 * query returns empty, and packets are assembled the same way either side of
 * that change. Swap the implementation, not the callers.
 */

async function exemplars({ clientId, agent, channel, objective, limit = 6 }) {
  return [];
}

async function learnings({ clientId }) {
  return [];
}

async function corrections({ clientId, agent }) {
  return [];
}

async function approvedClaims({ clientId }) {
  return null; // null = no registry yet; agents fall back to research-pass proof points
}

module.exports = { exemplars, learnings, corrections, approvedClaims };
