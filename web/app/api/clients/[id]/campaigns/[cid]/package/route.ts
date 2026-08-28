import { requireSession } from '@/server/auth';
import { getClient, getCampaign, currentOutputs } from '@/server/db';
import { listAssets, approvalState, composeAssets, composeSocial } from '@/server/assets';

export const runtime = 'nodejs';

/**
 * The campaign as it stands, composed from edited assets, gated on approval.
 *
 * This is what export reads. Unapproved assets refuse with the list, because
 * shipping unapproved copy is the thing the approval step exists to prevent;
 * `?force=1` overrides and says so in the payload.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  try {
    await requireSession();
  } catch (err: any) {
    return json({ error: err.message }, err.status || 401);
  }
  const url = new URL(req.url);
  const language = url.searchParams.get('language') || 'en';
  const force = url.searchParams.has('force');

  const [client, campaign, outputs, assets] = await Promise.all([
    getClient(id), getCampaign(id, cid), currentOutputs(id, cid), listAssets(id, cid),
  ]);
  if (!client || !campaign) return json({ error: 'Not found' }, 404);

  const approval = approvalState(assets, language);
  if (!approval.ready && !force) {
    return json({
      error: `${approval.unapproved.length} asset${approval.unapproved.length === 1 ? ' is' : 's are'} not approved`,
      unapproved: approval.unapproved, approval,
    }, 409);
  }

  return json({
    client: { name: client.name, domain: client.domain },
    brief: campaign.brief,
    context: outputs['brand-analyst']?.output ?? null,
    audience: outputs['customer-researcher']?.output ?? null,
    strategy: outputs.strategist?.output ?? null,
    assets: await composeAssets(id, cid, language, outputs.copywriter?.output),
    social: await composeSocial(id, cid, outputs['social-planner']?.output),
    activation: outputs['ops-architect']?.output ?? null,
    approval,
    forced: force && !approval.ready,
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'content-type': 'application/json' } });
