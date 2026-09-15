#!/usr/bin/env node
/**
 * Campaign Forge's checks, as MCP tools.
 *
 * This imports web/core directly rather than calling the deployed API. It
 * therefore needs no session, no network and no running app, which is the
 * point: the checks are pure functions and should be usable on a train.
 *
 * check_copy makes no network calls at all. scan_site fetches the site it is
 * given. Neither stores anything.
 *
 * TOOLS and callTool are exported so the tests can assert the schemas against
 * the functions they call, without starting a server. A schema that drifts
 * from its function fails only inside someone else's client, where nobody can
 * debug it.
 */
const { checkCopy } = require('../web/core/check');
const { scanSite } = require('../web/core/scraper');

const CF_URL = () => (process.env.CF_URL || 'http://localhost:3000').replace(/\/$/, '');

/** One call to the running app. A dead app is a sentence, not a stack trace. */
async function app(method, path, body) {
  let res;
  try {
    res = await fetch(CF_URL() + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    return { error: `Campaign Forge is not running at ${CF_URL()}. Start it with \`npm run local\` in the repository, then try again.` };
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) return { error: `${CF_URL()} wants a sign-in. These tools work against the local instance (npm run local), not the hosted one.` };
  if (!res.ok) return { error: data.error || `HTTP ${res.status}` };
  return data;
}

const money = (n) => `EUR ${Number(n || 0).toFixed(2)}`;

const TOOLS = [
  {
    name: 'check_copy',
    description:
      'Check marketing copy against platform character limits, house style and the AI-tell catalogue. ' +
      'Reports only; it never rewrites. Makes no network calls.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The copy to check.' },
        channel: {
          type: 'string',
          description:
            'Report only this channel, for example linkedin, google, x. Omit to see every channel it fits.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'scan_site',
    description:
      'Read a company website and return its brand kit: palette, fonts, logo, and which pages were read. ' +
      'Fetches the site you name.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The site to read.' },
        maxPages: { type: 'number', description: 'How many pages to read. Default 4.' },
      },
      required: ['url'],
    },
  },
  // ---- the running app -------------------------------------------------------
  // These call Campaign Forge over HTTP at CF_URL (default localhost:3000),
  // which is the instance `npm run local` starts. They send no cookie, so
  // they work against a MOCK_AUTH=1 instance and not the hosted one.
  {
    name: 'list_clients',
    description: 'List the clients in the running Campaign Forge, with their ids. Needs the app started with `npm run local`.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_client',
    description: 'Create a client, from a website URL (scans it for brand kit and sources) or from a name alone.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'The client website. Runs the site scan.' }, name: { type: 'string', description: 'A name, when there is no site to scan.' } }, required: [] },
  },
  {
    name: 'list_campaigns',
    description: 'List a client\'s campaigns with ids, status and brief summary.',
    inputSchema: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
  },
  {
    name: 'create_campaign',
    description: 'Create a campaign from a brief. Brief fields: productName, productDescription, targetAudience, objective (trial_signups, demo_requests, purchases, leads, awareness), tone, languages (["en"] or ["en","pt"]), landingUrl, webResearch (boolean), startDate.',
    inputSchema: { type: 'object', properties: { clientId: { type: 'string' }, brief: { type: 'object' } }, required: ['clientId', 'brief'] },
  },
  {
    name: 'run_agent',
    description: 'Run one agent pass on a campaign and wait for it. Order: brand-analyst, customer-researcher, strategist, copywriter, social-planner, ops-architect, localiser, landing-writer, analyst. A pass takes one to four minutes and costs money on a live key. Returns the summary, the flags and the cost.',
    inputSchema: { type: 'object', properties: { clientId: { type: 'string' }, campaignId: { type: 'string' }, agent: { type: 'string' } }, required: ['clientId', 'campaignId', 'agent'] },
  },
  {
    name: 'get_output',
    description: 'The current output of one agent on a campaign, as JSON text.',
    inputSchema: { type: 'object', properties: { clientId: { type: 'string' }, campaignId: { type: 'string' }, agent: { type: 'string' } }, required: ['clientId', 'campaignId', 'agent'] },
  },
  {
    name: 'nuelink_setup',
    description: 'Without brandId: list the Nuelink brands, and for a client its current mapping. With brandId and collections ({ linkedin, x, instagram } collection ids): save the mapping on the client.',
    inputSchema: { type: 'object', properties: { clientId: { type: 'string' }, brandId: { type: 'number' }, collections: { type: 'object' } }, required: ['clientId'] },
  },
  {
    name: 'push_to_nuelink',
    description: 'Send a campaign\'s social calendar to Nuelink. start is the date day 1 falls on (YYYY-MM-DD). publishMode is DRAFT or SCHEDULE. Returns a row per post.',
    inputSchema: { type: 'object', properties: { clientId: { type: 'string' }, campaignId: { type: 'string' }, start: { type: 'string' }, publishMode: { type: 'string', enum: ['DRAFT', 'SCHEDULE'] }, channels: { type: 'array', items: { type: 'string' } }, force: { type: 'boolean' } }, required: ['clientId', 'campaignId', 'start', 'publishMode'] },
  },
  {
    name: 'cost',
    description: 'What a campaign has cost so far, from the ledger, in EUR.',
    inputSchema: { type: 'object', properties: { campaignId: { type: 'string' } }, required: ['campaignId'] },
  },
];

const VERDICT = { clean: 'Clean', warnings: 'Worth a look', violations: 'Needs a fix' };

/** Plain text, because an MCP result is read by a person or quoted by a model. */
function renderCheck(r) {
  const lines = [`${VERDICT[r.verdict]}, ${r.chars} characters`];
  if (r.flags.length) {
    lines.push('');
    for (const f of r.flags) lines.push(`- [${f.severity}] ${f.detail}. ${f.why}`);
  }
  if (r.over.length) {
    lines.push('');
    lines.push('Too long for: ' + r.over.map((o) => `${o.channel} ${o.field} (${o.by} over)`).join(', '));
  }
  if (r.fits.length) {
    lines.push('Fits: ' + r.fits.map((f) => `${f.channel} ${f.field}`).join(', '));
  }
  if (r.ranWithoutClientRules) {
    lines.push('');
    lines.push('Checked without a client, so avoid terms, approved claims and brand spelling were not tested.');
  }
  return lines.join('\n');
}

async function appTool(name, a) {
  let r;
  switch (name) {
    case 'list_clients':
      r = await app('GET', '/api/clients');
      if (r.error) return r.error;
      if (!r.clients.length) return 'No clients yet. Use create_client with a website URL.';
      return r.clients.map((c) => `${c.name} (id: ${c.clientId})${c.domain ? ' ' + c.domain : ''}`).join('\n');
    case 'create_client':
      r = await app('POST', '/api/clients', a.url ? { url: a.url } : { name: a.name });
      if (r.error) return r.error;
      { const c = r.client || r; return `Created ${c.name} (id: ${c.clientId}). ${r.sources ? r.sources.length + ' sources from the site.' : ''}`.trim(); }
    case 'list_campaigns':
      r = await app('GET', `/api/clients/${a.clientId}/campaigns`);
      if (r.error) return r.error;
      if (!r.campaigns.length) return 'No campaigns yet. Use create_campaign with a brief.';
      return r.campaigns.map((c) => `${c.brief?.productName || '(untitled)'} (id: ${c.campaignId}) ${c.status}, ${Object.keys(c.current || {}).length} passes done`).join('\n');
    case 'create_campaign':
      r = await app('POST', `/api/clients/${a.clientId}/campaigns`, { brief: a.brief });
      if (r.error) return r.error;
      return `Created campaign (id: ${r.campaignId}). Run brand-analyst first.`;
    case 'run_agent':
      r = await app('POST', `/api/clients/${a.clientId}/campaigns/${a.campaignId}/run/${a.agent}`, { review: false });
      if (r.error) return r.error;
      if (r.skipped) return `${a.agent} skipped: ${r.reason}`;
      return [`${a.agent} ${r.complete ? 'finished' : 'did not finish'} in ${Math.round((r.usage?.ms || 0) / 1000)}s, ${money(r.usage?.costEur)}.`,
        r.problems?.length ? `Flags:\n- ${r.problems.join('\n- ')}` : 'No flags.',
        r.warning ? `Ceiling: ${r.warning}` : ''].filter(Boolean).join('\n');
    case 'get_output':
      r = await app('GET', `/api/clients/${a.clientId}/campaigns/${a.campaignId}`);
      if (r.error) return r.error;
      if (!r.outputs?.[a.agent]) return `${a.agent} has no output yet on this campaign.`;
      return JSON.stringify(r.outputs[a.agent], null, 1);
    case 'nuelink_setup':
      if (a.brandId) {
        r = await app('PATCH', `/api/clients/${a.clientId}`, { nuelink: { brandId: a.brandId, collections: a.collections || {} } });
        return r.error || `Saved: brand ${a.brandId}, collections ${JSON.stringify(a.collections || {})}.`;
      }
      { const [nl, cl] = await Promise.all([app('GET', '/api/nuelink'), app('GET', `/api/clients/${a.clientId}`)]);
        if (nl.error) return nl.error;
        if (!nl.configured) return 'Nuelink is not configured: set NUELINK_API_KEY in web/.env.';
        const lines = ['Brands: ' + (nl.brands || []).map((b) => `${b.title} (id ${b.id})`).join(', ')];
        const m = cl.client?.nuelink;
        lines.push(m?.brandId ? `This client: brand ${m.brandId}, collections ${JSON.stringify(m.collections)}` : 'This client has no mapping yet.');
        if (m?.brandId) { const d = await app('GET', `/api/nuelink?brand=${m.brandId}`); if (d.collections) lines.push('Collections: ' + d.collections.map((c) => `${c.title} (id ${c.id}: ${c.channels.map((ch) => ch.type).join('+')})`).join(', ')); }
        return lines.join('\n'); }
    case 'push_to_nuelink':
      r = await app('POST', `/api/clients/${a.clientId}/campaigns/${a.campaignId}/schedule/nuelink`, { start: a.start, publishMode: a.publishMode, channels: a.channels, force: a.force });
      if (r.error) return r.error;
      { const rs = r.push.results; const n = (s) => rs.filter((x) => x.status === s).length;
        return [`${n('posted')} posted, ${n('skipped')} skipped, ${n('failed')} failed.`, ...rs.filter((x) => x.status !== 'posted').map((x) => `- day ${x.day} ${x.channel}: ${x.status}${x.error ? ', ' + x.error : ''}`)].join('\n'); }
    case 'cost':
      r = await app('GET', '/api/ledger');
      if (r.error) return r.error;
      { const rows = r.entries.filter((e) => e.campaignId === a.campaignId); const total = rows.reduce((s, e) => s + (e.costEur || 0), 0);
        return `${money(total)} across ${rows.length} calls.` + (rows.length ? '\n' + rows.map((e) => `- ${e.agent}: ${money(e.costEur)}`).join('\n') : ''); }
    default:
      return null;
  }
}

async function callTool(name, args = {}) {
  if (name === 'check_copy') {
    return renderCheck(checkCopy(String(args.text || ''), { channel: args.channel }));
  }
  if (name === 'scan_site') {
    const r = await scanSite(String(args.url || ''), { maxPages: args.maxPages });
    return JSON.stringify({ brandKit: r.brandKit, pages: r.sources.map((s) => s.name) }, null, 1);
  }
  const viaApp = await appTool(name, args);
  if (viaApp !== null) return viaApp;
  throw new Error(`unknown tool "${name}"`);
}

module.exports = { TOOLS, callTool };

// Started directly: speak MCP over stdio. The SDK is required lazily so the
// tests, and anything else importing this file, do not need it installed.
if (require.main === module) {
  (async () => {
    const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
    const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
    const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

    const server = new Server(
      { name: 'campaign-forge', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      try {
        const text = await callTool(req.params.name, req.params.arguments || {});
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        // Returned as an error result rather than thrown: a client should see
        // what went wrong in the conversation, not a dropped connection.
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    });
    await server.connect(new StdioServerTransport());
  })();
}
