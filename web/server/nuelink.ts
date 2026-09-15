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
 */
import { bad } from './respond';
import { getClient, getCampaign, currentOutputs, addNuelinkPush, listNuelinkPushes, addLedger } from './db';
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

/** Day-and-channel pairs that some earlier push posted. */
export async function alreadySent(ws: string, clientId: string, campaignId: string): Promise<Set<string>> {
  const pushes = await listNuelinkPushes(ws, clientId, campaignId);
  const sent = new Set<string>();
  for (const p of pushes) for (const r of p.results) if (r.status === 'posted') sent.add(`${r.day}-${r.channel}`);
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

  // The card's colour scheme rotates by its position among the posts with a
  // graphic, in day order, exactly as the planner's postProcess numbered them.
  const variantOf = new Map<string, number>();
  let g = 0;
  for (const p of [...social.posts].sort((a: any, b: any) => a.day - b.day)) {
    if (p.graphic && p.graphic.template) variantOf.set(`${p.day}-${p.channel}`, g++);
  }
  const postOf = new Map<string, any>(social.posts.map((p: any) => [`${p.day}-${p.channel}`, p]));

  let logo: string | null = null;
  if (client.brandKit?.logoRef) {
    const f = await getFile(ws, client.brandKit.logoRef);
    if (f) logo = `data:${f.mime};base64,${f.buffer.toString('base64')}`;
  }

  const sent = opts.force ? new Set<string>() : await alreadySent(ws, clientId, campaignId);
  const wanted = opts.channels?.length ? new Set(opts.channels) : null;
  const results: NuelinkResult[] = [];

  for (const row of rows) {
    const key = `${row.day}-${row.channel}`;
    const scheduledAt = opts.publishMode === 'SCHEDULE' ? nuelink.formatScheduledAt(row.when) : null;
    const result: NuelinkResult = { day: row.day, channel: row.channel, scheduledAt, status: 'skipped', nuelinkPostId: null, mediaId: null, error: null };
    results.push(result);

    if (wanted && !wanted.has(row.channel)) { result.error = 'channel not selected'; continue; }
    if (sent.has(key)) { result.error = 'already sent in an earlier push'; continue; }
    const collectionId = (mapping.collections as any)[row.channel];
    if (!collectionId) { result.error = `no Nuelink collection mapped for ${row.channel}`; continue; }

    const post = postOf.get(key);
    const body: any = { caption: messageOf(row), publishMode: opts.publishMode };
    if (scheduledAt) body.scheduledAt = scheduledAt;
    if (row.link) body.link = row.link;

    if (post?.graphic?.template) {
      let png: Buffer;
      try {
        png = renderCardPng(post.graphic, client.brandKit, variantOf.get(key) || 0, logo);
      } catch (err: any) {
        result.status = 'failed'; result.error = `card could not be rendered: ${err.message}`; continue;
      }
      const up = await nuelink.uploadMedia(mapping.brandId, { buffer: png, mime: 'image/png', filename: `day${row.day}-${row.channel}.png` });
      if (up.error) { result.status = 'failed'; result.error = `upload: ${up.error}`; continue; }
      result.mediaId = up.data.id;
      body.media = [{ id: up.data.id }];
      if (post.graphic.headline) body.alt = post.graphic.headline;
    }

    const created = await nuelink.createPost(mapping.brandId, collectionId, body);
    if (created.error) { result.status = 'failed'; result.error = created.error; continue; }
    result.status = 'posted';
    result.nuelinkPostId = String(created.data.id);
  }

  const push = await addNuelinkPush(ws, clientId, campaignId, {
    startDate: opts.start, publishMode: opts.publishMode, skipWeekends: opts.skipWeekends, results,
  });
  await addLedger(ws, { clientId, campaignId, agent: 'nuelink', model: 'nuelink', input: 0, output: 0, webSearches: 0, images: 0, costEur: 0 });
  return push;
}
