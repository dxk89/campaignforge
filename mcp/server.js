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

async function callTool(name, args = {}) {
  if (name === 'check_copy') {
    return renderCheck(checkCopy(String(args.text || ''), { channel: args.channel }));
  }
  if (name === 'scan_site') {
    const r = await scanSite(String(args.url || ''), { maxPages: args.maxPages });
    return JSON.stringify({ brandKit: r.brandKit, pages: r.sources.map((s) => s.name) }, null, 1);
  }
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
