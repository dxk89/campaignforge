import { guarded, bad } from '@/server/respond';
import { currentOutputs, addLedger, getCampaign } from '@/server/db';
import { listAssets, composeAssets } from '@/server/assets';
import { rulesFor } from '@/server/inputs';

const orchestrator = require('@core/agents/orchestrator');

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * The editor reads the whole approved set at once, looking for what per-asset
 * review cannot see: drift across the campaign, and approved claims that no
 * asset used. Advisory; it never blocks.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async () => {
    const [campaign, outputs, assets] = await Promise.all([getCampaign(id, cid), currentOutputs(id, cid), listAssets(id, cid)]);
    const approved = assets.filter((a) => a.status === 'approved');
    if (!approved.length) throw bad('Nothing is approved yet, so there is nothing to audit', 409);

    const composed = await composeAssets(id, cid, 'en', outputs.copywriter?.output);
    const rules = await rulesFor(id, cid);
    const review = await orchestrator.review('audit', composed, {
      brief: { ...campaign!.brief }, context: outputs['brand-analyst']?.output, audience: outputs['customer-researcher']?.output, rules,
    });
    if (review?.usage) {
      await addLedger({
        clientId: id, campaignId: cid, agent: 'critic', model: review.usage.model || 'unknown',
        input: review.usage.input || 0, output: review.usage.output || 0, webSearches: 0, images: 0, costEur: review.usage.costEur || 0,
      });
    }

    // Approved claims that no approved asset uses. Code can see this; the
    // editor's job is the judgement, not the set arithmetic.
    const text = approved.map((a) => a.text.toLowerCase()).join(' ');
    const unused = (rules.approvedClaims || [])
      .map((c: any) => (typeof c === 'string' ? c : c.text))
      .filter((c: string) => {
        const words = String(c).toLowerCase().split(/\s+/).filter((w) => w.length > 4);
        return words.length && words.filter((w) => text.includes(w)).length < Math.min(2, words.length);
      });

    return { review, unusedClaims: unused, audited: approved.length };
  });
}
