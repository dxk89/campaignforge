import { guarded, bad } from '@/server/respond';
import { addImage, listImages, addLedger, getClient, currentOutputs } from '@/server/db';
import { putFile, getFile } from '@/server/storage';

const images = require('@core/images');
const { imageCostEur } = require('@core/pricing');

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => ({ images: await listImages(session.workspaceId, id, cid) }));
}

/**
 * Generate one image for one post. On demand only, never automatically: at
 * roughly six cents each, the person running the campaign chooses which posts
 * earn a picture. The file goes to Storage; the doc records the prompt so the
 * provenance of every image is answerable.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => {
    const ws = session.workspaceId;
    const { day, channel } = await req.json();
    if (typeof day !== 'number' || !channel) throw bad('day and channel are required');

    const client = await getClient(ws, id);
    if (!client) throw bad('Client not found', 404);
    const outputs = await currentOutputs(ws, id, cid);
    const social: any = outputs['social-planner']?.output;
    const post = (social?.posts || []).find((p: any) => p.day === day && p.channel === channel);
    if (!post) throw bad('No such post in the calendar', 404);
    if (!post.graphic?.image_prompt) throw bad('That post has no visual brief');
    if (!images.available()) throw bad('Image generation is not configured (GEMINI_API_KEY)', 503);

    // Reference artwork travels as data URLs, read back from Storage.
    const artwork: string[] = [];
    for (const ref of (client.brandKit.artworkRefs || []).slice(0, 6)) {
      const f = await getFile(ref);
      if (f) artwork.push(`data:${f.mime};base64,${f.buffer.toString('base64')}`);
    }

    const result = await images.generateImage({
      prompt: post.graphic.image_prompt,
      brandKit: { ...client.brandKit, assets: { artwork } },
      aspect: '1:1',
    });

    const buffer = Buffer.from(result.data, 'base64');
    const ext = (result.mime.split('/')[1] || 'png').replace('+xml', '');
    const storageRef = await putFile(ws, `clients/${id}/campaigns/${cid}/images/day${day}-${channel}.${ext}`, buffer, result.mime);

    const doc = await addImage(ws, id, cid, {
      postRef: { day, channel }, prompt: post.graphic.image_prompt,
      storageRef, mime: result.mime, status: 'candidate', note: null,
    });

    await addLedger(ws, {
      clientId: id, campaignId: cid, agent: 'image', model: 'gemini-image',
      input: 0, output: 0, webSearches: 0, images: 1,
      costEur: result.usage.costEur ?? Number(imageCostEur(1).toFixed(4)),
    });

    return { image: doc, dataUrl: `data:${result.mime};base64,${result.data}`, usage: result.usage };
  });
}
