import { guarded, bad } from '@/server/respond';
import { getClient, getCampaign, currentOutputs, updateClient } from '@/server/db';
import { putFile } from '@/server/storage';
import { parseCsv, suggestMapping, matchRows, computeVerdicts } from '@/server/results';
import { saveResults, listResults } from '@/server/resultsStore';
import { attachPerformance } from '@/server/exemplars';

const { trackingPlan } = require('@core/utm');

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => listResults(session.workspaceId, id, cid));
}

/**
 * Upload results. Without a mapping, returns the columns and a suggestion so a
 * person can confirm which column is which; the mapping is then remembered per
 * source, because nobody should map the same export twice.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  return guarded(async (session) => {
    const ws = session.workspaceId;
    const form = await req.formData();
    const file = form.get('file');
    const source = String(form.get('source') || 'manual');
    const mappingRaw = form.get('mapping');
    if (!(file instanceof File)) throw bad('No file received');

    const text = await file.text();
    const { columns, rows } = parseCsv(text);
    if (!rows.length) throw bad('That file has no data rows');

    const client = await getClient(ws, id);
    const remembered = (client?.settings as any)?.resultMappings?.[source];
    const mapping = mappingRaw ? JSON.parse(String(mappingRaw)) : remembered;

    if (!mapping) {
      return { needsMapping: true, columns, sample: rows.slice(0, 3), suggested: suggestMapping(columns) };
    }

    const [campaign, outputs] = await Promise.all([getCampaign(ws, id, cid), currentOutputs(ws, id, cid)]);
    const assets = outputs.copywriter?.output;
    const tracking = assets ? trackingPlan({ ...campaign!.brief, clientName: client!.name }, assets, outputs.localiser?.output ?? null, campaign!.brief.landingUrl) : null;

    const { rows: matched, unmatched } = matchRows(rows, mapping, tracking, assets);
    const verdicts = computeVerdicts((outputs['ops-architect']?.output as any)?.experiments || [], matched);

    const fileRef = await putFile(ws, `clients/${id}/campaigns/${cid}/results/${Date.now()}-${file.name}`, Buffer.from(text), 'text/csv');
    const doc = await saveResults(ws, id, cid, { source, fileRef, mapping, rows: matched, unmatched, verdicts });

    // Results tell the exemplar bank which approved copy actually worked.
    await attachPerformance(ws, id, matched);

    // Remember the mapping for this source.
    await updateClient(ws, id, { settings: { ...(client!.settings as any), resultMappings: { ...((client!.settings as any).resultMappings || {}), [source]: mapping } } });

    return { resultId: doc.resultId, matched: matched.length, unmatched, verdicts, summary: doc.summary };
  });
}
