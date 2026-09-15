/**
 * Sending a planned month to Nuelink.
 *
 * Built on core/schedule.js, which already turns day numbers into dated rows
 * for the CSV exports: pushing to an API changes where the rows go, not what
 * a row is. This module adds the three things an API needs that a CSV does
 * not: which collection each channel maps to, a PNG of the card, and a
 * record of what was sent so a second push does not post the month twice.
 *
 * One post failing does not stop the others. Every post gets a result row,
 * posted, skipped or failed, with the reason, and the person reads the table.
 *
 * The push record is created before the loop starts, with an empty results
 * array, and rewritten after every row resolves. A function timeout on
 * Hobby is 300 seconds and a campaign's push can run longer than that; if
 * the process dies mid-loop, the record on disk shows exactly how far it
 * got rather than nothing, and the next push does not re-send what the
 * dead run had already posted.
 */
import { bad } from './respond';
import { getClient, getCampaign, currentOutputs, addNuelinkPush, updateNuelinkPush, listNuelinkPushes, addLedger } from './db';
import { getFile } from './storage';
import { renderCardPng } from './cards';
import type { NuelinkPush, NuelinkResult } from './types';

const nuelink = require('@core/nuelink');
const { scheduleRows, messageOf } = require('@core/schedule');

export type PushOptions = {
  start: string;
  skipWeekends: boolean;
  publishMode: 'DRAFT' | 'SCHEDULE';
  channels?: string[];
  force?: boolean;
};

/**
 * The idempotence key for one row: day-channel, with `#<n>` appended for
 * the second and later post sharing that pair within a calendar. The
 * planner schema does not forbid two posts landing on the same day and
 * channel, and without this, the second would look like a repeat of the
 * first and be skipped forever. `counts` is a fresh map per results array
 * being counted (one push's worth), so the same calendar numbers its
 * duplicates the same way every time it is replayed, in the row order
 * every push shares (every push records every row, so the order is stable
 * calendar to calendar).
 */
export function sentKey(counts: Map<string, number>, day: number, channel: string): string {
  const pair = `${day}-${channel}`;
  const n = (counts.get(pair) || 0) + 1;
  counts.set(pair, n);
  return n === 1 ? pair : `${pair}#${n}`;
}

/** Day-and-channel pairs that some earlier push posted. */
export async function alreadySent(ws: string, clientId: string, campaignId: string): Promise<Set<string>> {
  const pushes = await listNuelinkPushes(ws, clientId, campaignId);
  const sent = new Set<string>();
  for (const p of pushes) {
    const counts = new Map<string, number>();
    for (const r of p.results) {
      const key = sentKey(counts, r.day, r.channel);
      if (r.status === 'posted') sent.add(key);
    }
  }
  return sent;
}

export async function pushCampaign(ws: string, clientId: string, campaignId: string, opts: PushOptions): Promise<NuelinkPush> {
  if (!nuelink.available()) throw bad('Nuelink is not configured: set NUELINK_API_KEY on the server', 503);
  if (!['DRAFT', 'SCHEDULE'].includes(opts.publishMode)) throw bad('publishMode must be DRAFT or SCHEDULE');

  const [client, campaign, outputs] = await Promise.all([getClient(ws, clientId), getCampaign(ws, clientId, campaignId), currentOutputs(ws, clientId, campaignId)]);
  if (!client) throw bad('Client not found', 404);
  if (!campaign) throw bad('Campaign not found', 404);
  const social: any = outputs['social-planner']?.output;
  if (!social?.posts?.length) throw bad('There is no social calendar to send yet', 409);

  const mapping = client.nuelink;
  if (!mapping?.brandId || !Object.values(mapping.collections || {}).some(Boolean)) {
    throw bad('Choose a Nuelink brand and a collection per channel on the client page first', 409);
  }

  let rows: any[];
  try {
    rows = scheduleRows(social, { startDate: opts.start, skipWeekends: opts.skipWeekends, link: campaign.brief?.landingUrl || '' });
  } catch (err: any) {
    throw bad(err.message); // only a missing or unparseable start date
  }

  // A row is paired back to its post by position (`row.index`, the post's
  // place in the day-sorted list scheduleRows iterates), not by day+channel:
  // the schema does not promise that pair is unique, and keying a Map by it
  // would let a duplicate post overwrite another in postOf/variantOf, so a
  // row could go out with one post's caption and the other's card.
  const sortedPosts = [...social.posts].sort((a: any, b: any) => (a.day || 0) - (b.day || 0));
  const postOf = new Map<number, any>();
  const variantOf = new Map<number, number>();
  let g = 0;
  sortedPosts.forEach((p: any, idx: number) => {
    postOf.set(idx, p);
    // The card's colour scheme rotates by its position among the posts with
    // a graphic, in day order, exactly as the planner's postProcess
    // numbered them.
    if (p.graphic && p.graphic.template) variantOf.set(idx, g++);
  });

  let logo: string | null = null;
  if (client.brandKit?.logoRef) {
    const f = await getFile(ws, client.brandKit.logoRef);
    if (f) logo = `data:${f.mime};base64,${f.buffer.toString('base64')}`;
  }

  const sent = opts.force ? new Set<string>() : await alreadySent(ws, clientId, campaignId);
  const wanted = opts.channels?.length ? new Set(opts.channels) : null;
  const results: NuelinkResult[] = [];
  const counts = new Map<string, number>();

  let push = await addNuelinkPush(ws, clientId, campaignId, {
    startDate: opts.start, publishMode: opts.publishMode, skipWeekends: opts.skipWeekends, results,
  });

  for (const row of rows) {
    const key = sentKey(counts, row.day, row.channel);
    const scheduledAt = opts.publishMode === 'SCHEDULE' ? nuelink.formatScheduledAt(row.when) : null;
    const result: NuelinkResult = { day: row.day, channel: row.channel, scheduledAt, status: 'skipped', nuelinkPostId: null, mediaId: null, error: null };
    results.push(result);

    await (async () => {
      if (wanted && !wanted.has(row.channel)) { result.error = 'channel not selected'; return; }
      if (sent.has(key)) { result.error = 'already sent in an earlier push'; return; }
      const collectionId = (mapping.collections as any)[row.channel];
      if (!collectionId) { result.error = `no Nuelink collection mapped for ${row.channel}`; return; }

      const post = postOf.get(row.index);
      const body: any = { caption: messageOf(row), publishMode: opts.publishMode };
      if (scheduledAt) body.scheduledAt = scheduledAt;
      if (row.link) body.link = row.link;

      if (post?.graphic?.template) {
        let png: Buffer;
        try {
          png = renderCardPng(post.graphic, client.brandKit, variantOf.get(row.index) || 0, logo);
        } catch (err: any) {
          result.status = 'failed'; result.error = `card could not be rendered: ${err.message}`; return;
        }
        const up = await nuelink.uploadMedia(mapping.brandId, { buffer: png, mime: 'image/png', filename: `day${row.day}-${row.channel}.png` });
        if (up.error) { result.status = 'failed'; result.error = `upload: ${up.error}`; return; }
        result.mediaId = up.data.id;
        body.media = [{ id: up.data.id }];
        if (post.graphic.headline) body.alt = post.graphic.headline;
      }

      const created = await nuelink.createPost(mapping.brandId, collectionId, body);
      if (created.error) { result.status = 'failed'; result.error = created.error; return; }
      result.status = 'posted';
      result.nuelinkPostId = String(created.data.id);
    })();

    push = (await updateNuelinkPush(ws, clientId, campaignId, push.pushId, { results })) ?? push;
  }

  await addLedger(ws, { clientId, campaignId, agent: 'nuelink', model: 'nuelink', input: 0, output: 0, webSearches: 0, images: 0, costEur: 0 });
  return push;
}
