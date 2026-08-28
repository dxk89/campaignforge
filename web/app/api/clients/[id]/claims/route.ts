import { guarded, bad } from '@/server/respond';
import { listClaims, proposeClaim } from '@/server/db';
import { putFile } from '@/server/storage';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async () => ({ claims: await listClaims(id) }));
}

/** Add a claim by hand, optionally with an evidence file. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async () => {
    const type = req.headers.get('content-type') || '';
    let text: string, source: string, evidenceRef: string | null = null;
    if (type.includes('multipart/form-data')) {
      const form = await req.formData();
      text = String(form.get('text') || '');
      source = String(form.get('source') || 'added by hand');
      const file = form.get('evidence');
      if (file instanceof File) evidenceRef = await putFile(`clients/${id}/evidence/${file.name}`, Buffer.from(await file.arrayBuffer()), file.type);
    } else {
      const body = await req.json();
      text = String(body.text || '');
      source = String(body.source || 'added by hand');
    }
    if (!text.trim()) throw bad('text is required');
    const claim = await proposeClaim(id, { text, source });
    if (!claim) throw bad('That claim is already on file', 409);
    if (evidenceRef) {
      const { updateClaim } = await import('@/server/db');
      return { claim: await updateClaim(id, claim.claimId, { evidenceRef }) };
    }
    return { claim };
  });
}
