import { guarded, bad } from '@/server/respond';
import { getCampaign, updateCampaign, addSource, addLedger } from '@/server/db';
import { putFile } from '@/server/storage';

const { extractFile } = require('@core/sources');
const orchestrator = require('@core/agents/orchestrator');

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Read a briefing document into the campaign's brief fields.
 *
 * Two rules that matter: a filled field is never overwritten, because the
 * person's own words beat the parse; and the document is kept as a source so
 * the research pass reads it in full, not just the five fields we lifted.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => {
    const ws = session.workspaceId;
    const campaign = await getCampaign(ws, id, cid);
    if (!campaign) throw bad('Campaign not found', 404);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw bad('No file received');

    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractFile({ originalname: file.name, buffer });

    const storageRef = await putFile(ws, `clients/${id}/sources/brief-${file.name}`, buffer, file.type);
    const source = await addSource(ws, id, {
      name: extracted.name, kind: 'brief', storageRef, text: extracted.text, chars: extracted.chars,
    });

    const result = await orchestrator.runAgent('brief-reader', { text: extracted.text });
    const fields = (result.output || {}) as Record<string, any>;

    const brief: any = { ...campaign.brief };
    const filled: string[] = [];
    for (const key of ['productName', 'productDescription', 'targetAudience', 'objective', 'tone'] as const) {
      if (fields[key] && !String(brief[key] || '').trim()) { brief[key] = fields[key]; filled.push(key); }
    }
    if (Array.isArray(fields.languages) && fields.languages.includes('pt') && !brief.languages?.includes('pt')) {
      brief.languages = ['en', 'pt'];
      filled.push('languages');
    }
    await updateCampaign(ws, id, cid, { brief });

    await addLedger(ws, {
      clientId: id, campaignId: cid, agent: 'brief-reader', model: result.usage.model || 'unknown',
      input: result.usage.input || 0, output: result.usage.output || 0,
      webSearches: 0, images: 0, costEur: result.usage.costEur || 0,
    });

    return {
      fields, notes: fields.notes || '', filled, usage: result.usage,
      source: { sourceId: source.sourceId, name: source.name, kind: source.kind, chars: source.chars },
      brief,
    };
  });
}
