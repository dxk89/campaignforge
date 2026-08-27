import { guarded, bad } from '@/server/respond';
import { createCampaign, listCampaigns } from '@/server/db';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async () => ({ campaigns: await listCampaigns(id) }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async () => {
    const body = await req.json().catch(() => ({}));
    if (!body.brief) throw bad('brief is required');
    const campaign = await createCampaign(id, body.brief);
    return { campaignId: campaign.campaignId, campaign };
  });
}
