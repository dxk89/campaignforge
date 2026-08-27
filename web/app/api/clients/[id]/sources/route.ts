import { guarded, bad } from '@/server/respond';
import { addSource, listSources } from '@/server/db';
import { putFile } from '@/server/storage';

const { extractFile, extractUrl, fromPaste } = require('@core/sources');

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async () => ({ sources: await listSources(id) }));
}

/** Files (multipart), a URL, or pasted text. All three end as source docs. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(async () => {
    const type = req.headers.get('content-type') || '';

    if (type.includes('multipart/form-data')) {
      const form = await req.formData();
      const files = form.getAll('files').filter((f): f is File => f instanceof File);
      if (!files.length) throw bad('No files received');
      const sources = [];
      const errors = [];
      for (const file of files) {
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          const extracted = await extractFile({ originalname: file.name, buffer });
          const storageRef = await putFile(`clients/${id}/sources/${file.name}`, buffer, file.type);
          sources.push(await addSource(id, { name: extracted.name, kind: 'file', storageRef, text: extracted.text, chars: extracted.chars }));
        } catch (err: any) {
          errors.push({ name: file.name, error: err.message });
        }
      }
      return { sources: sources.map(strip), errors };
    }

    const body = await req.json();
    if (body.url) {
      const s = await extractUrl(body.url);
      return { sources: [strip(await addSource(id, { name: s.name, kind: 'url', storageRef: null, text: s.text, chars: s.chars }))] };
    }
    if (body.text) {
      const s = fromPaste(body.label, body.text);
      return { sources: [strip(await addSource(id, { name: s.name, kind: 'paste', storageRef: null, text: s.text, chars: s.chars }))] };
    }
    throw bad('Send files, a url or text');
  });
}

const strip = (s: any) => ({ sourceId: s.sourceId, name: s.name, kind: s.kind, chars: s.chars, fetchedAt: s.fetchedAt });
