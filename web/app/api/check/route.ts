import { guarded, bad } from '@/server/respond';
import { rulesFor } from '@/server/inputs';
import { getClient } from '@/server/db';

const { checkCopy } = require('@core/check');

export const runtime = 'nodejs';

/**
 * Check arbitrary copy.
 *
 * Nothing is stored. This is the one route that reads a body and writes
 * nothing, on purpose: ad-hoc copy is not a campaign asset, and not keeping
 * it is what makes the data question simple to answer.
 *
 * A client is optional, and there are two ways to supply one. With a campaign
 * as well, rulesFor gives the full set: approved claims, the research
 * context, the client's voice. With only a client, that context does not
 * exist, so the rules are what a client knows by itself. Which of the three
 * ran is reported in ranWithoutClientRules rather than left to be guessed.
 */
export async function POST(req: Request) {
  return guarded(async (session) => {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) throw bad('Nothing to check. Send { text }.');

    let rules = null;
    if (body.clientId && body.campaignId) {
      rules = await rulesFor(session.workspaceId, body.clientId, body.campaignId);
    } else if (body.clientId) {
      const client = await getClient(session.workspaceId, body.clientId);
      if (!client) throw bad('Client not found', 404);
      rules = {
        avoid: client.voice?.avoidTerms || [],
        competitors: [],
        brandName: client.name,
        approvedClaims: null,
        houseTerms: [client.name, ...(client.voice?.preferredTerms || [])],
      };
    }

    return checkCopy(text, { channel: body.channel, rules });
  });
}
