/**
 * Client memory.
 *
 * Agents are shown exemplars (outputs a human approved), learnings (from
 * results) and corrections (from the Critic) for the client they are working
 * on. The collections these read are created in Phase 2 and Phase 3; until
 * then every query returns empty and packets are assembled identically, so
 * nothing downstream changes when the data starts arriving.
 */
const { read, memory: fallback } = require('./firestore');

/**
 * Approved outputs for this client, ranked by performance then recency.
 * Filtered by channel for the writers, by agent for everyone else.
 */
async function exemplars({ clientId, agent, channel, objective, limit = 6 }) {
  if (!clientId) return [];
  const where = [['kind', '==', 'approved']];
  if (channel) where.push(['channel', '==', channel]);
  else if (agent) where.push(['agent', '==', agent]);
  let rows = await read(clientId, 'exemplars', { where, order: 'approvedAt', limit: limit * 3 });
  if (!rows.length) {
    rows = fallback('exemplars', clientId).filter((e) => e.kind === 'approved' && (!channel || e.channel === channel) && (channel || !agent || e.agent === agent));
  }
  const rank = (e) => (e.performance?.value ?? -1);
  return rows
    .sort((a, b) => (objective && a.objective === objective ? -1 : 0) - (objective && b.objective === objective ? -1 : 0)
      || rank(b) - rank(a)
      || String(b.approvedAt || '').localeCompare(String(a.approvedAt || '')))
    .slice(0, limit);
}

/** Approved learnings from uploaded results. Newest first, capped. */
async function learnings({ clientId }) {
  if (!clientId) return [];
  const rows = await read(clientId, 'learnings', { where: [['status', '==', 'approved']], order: 'approvedAt', limit: 12 });
  if (rows.length) return rows;
  return fallback('learnings', clientId).filter((l) => l.status === 'approved').slice(0, 12);
}

/** Corrections the editor has given for this client, so they are not repeated. */
async function corrections({ clientId, agent }) {
  const where = [['status', '==', 'confirmed']];
  if (agent) where.push(['agent', '==', agent]);
  return read(clientId, 'corrections', { where, order: 'createdAt', limit: 10 });
}

/**
 * The claims a person has approved.
 *
 * Returns null when no registry exists, which is different from an empty
 * array and is load-bearing: null tells buildRules to fall back to the
 * research pass's proof points and treat claim flags as warnings. An empty
 * array would mean "nothing is approved" and every number in the copy would
 * become a violation.
 */
async function approvedClaims({ clientId }) {
  if (!clientId) return null;
  const now = new Date().toISOString();
  let rows = await read(clientId, 'claims', { where: [['status', '==', 'approved']], limit: 100 });
  if (!rows.length) rows = fallback('claims', clientId).filter((c) => c.status === 'approved');
  if (!rows.length) return null;
  return rows.filter((c) => !c.expiresAt || c.expiresAt > now);
}

module.exports = { exemplars, learnings, corrections, approvedClaims };
