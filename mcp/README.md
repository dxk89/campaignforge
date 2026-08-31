# Campaign Forge MCP server

Campaign Forge's copy checks, available inside Claude Desktop, Claude Code, or
any other MCP client. Ask it to check a line while you are writing, without
opening the app.

Two tools:

- **`check_copy`** — platform character limits, house style, the client's
  rules where they apply, and the AI-tell catalogue. Reports only; it never
  rewrites.
- **`scan_site`** — reads a company website and returns its brand kit:
  palette, fonts, logo, and which pages were read.

## Where your text goes

**`check_copy` makes no network calls.** It is pure functions over a string,
running on your machine. Nothing is sent anywhere and nothing is stored. The
test suite asserts this against the source, so it stays true.

**`scan_site` fetches the site you name**, and nothing else.

Both run locally. Neither talks to the Campaign Forge deployment, which is why
they work with no account, no API key and no internet connection in the case
of `check_copy`.

Worth being plain about one thing: the tools themselves send nothing, but you
are using them inside an AI client, and whatever you type into that client
goes to whoever runs it. If the copy is confidential, that is the part to
think about, not this server.

## Install

```bash
cd mcp
npm install
```

That installs one dependency, the MCP SDK. The checks themselves come from
`web/core/`, which needs nothing installed.

## Configure Claude Desktop

Add this to your `claude_desktop_config.json`, replacing the path with the
absolute path to this repository on your machine:

```json
{
  "mcpServers": {
    "campaign-forge": {
      "command": "node",
      "args": ["/absolute/path/to/campaignforge/mcp/server.js"]
    }
  }
}
```

The file lives at:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Restart Claude Desktop. The tools appear under the connectors icon.

For Claude Code, the same server works as a project-scoped MCP server; see
that tool's own documentation for where its config lives.

## Worked examples

### Checking a line

> Check this for LinkedIn: "Our robust, seamless platform serves as a
> testament to modern finance."

```
Needs a fix, 70 characters

- [violation] tier 1 AI vocabulary "robust". Vocabulary that marks text as machine-written.
- [violation] tier 1 AI vocabulary "seamless". Vocabulary that marks text as machine-written.
- [warning] tier 2 AI vocabulary "testament". Vocabulary that marks text as machine-written.
- [warning] says "serves as" where "is" would do. Write "is". It is shorter and it commits to something.
Fits: linkedin intro_text, linkedin headline, linkedin post

Checked without a client, so avoid terms, approved claims and brand spelling were not tested.
```

### Checking without a channel in mind

> Is "Close the month four days faster." short enough to use anywhere?

```
Clean, 33 characters

Too long for: meta description (3 over), google headline (3 over)
Fits: meta primary_text, meta headline, linkedin intro_text, linkedin headline, google description, email subject, email preview_text, linkedin post, x post, instagram post, facebook post, tiktok post, threads post, youtube post, pinterest post

Checked without a client, so avoid terms, approved claims and brand spelling were not tested.
```

### Reading a brand kit

> Scan intellinews.com and tell me the brand colours.

```json
{
 "brandKit": {
  "siteName": "Business news | data | Eastern Europe | Eurasia | Middle East | Africa",
  "palette": { "accents": ["#f4d010", "#9e1d0a", "#0063a2"], "dark": "#000000", "light": "#ffffff" },
  "fonts": ["Roboto", "Helvetica Neue", "Open Sans"],
  "logo": "https://cfemdpublic.intellinews.com/assets/v2/images/HeaderLogo.svg"
 },
 "pages": ["https://www.intellinews.com/"]
}
```

## What it does not do

It cannot reach your campaigns, your clients or your ledger. Those need a
session and live in the deployed app. This server exposes the parts that are
pure functions, which is deliberate: it is the half that is useful offline and
carries no access to anything.

The full rule catalogue, and what to do about each flag, is in
[`docs/COPY-CHECKS.md`](../docs/COPY-CHECKS.md).
