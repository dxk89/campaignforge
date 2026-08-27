# Data handling

What this tool stores, where it goes, and how to get it back or delete it. Written to be shown to a client.

## What is stored

Per client: the name and website; a brand kit (palette, fonts, logo, artwork) derived from the site or uploaded; voice rules; the text of sources you add (site pages, uploaded files, URLs, pasted text); campaigns, their briefs, and every version of every agent's output with its trace; generated images; a ledger entry for every model call.

Nothing is stored about anyone else. There is no visitor tracking in the tool, no third-party analytics, and no advertising pixels.

## Where it is stored

Google Firebase (Firestore for documents, Cloud Storage for files), in the project configured for this deployment, under a single user namespace. Access requires signing in with one allowlisted Google account; the security rules reject every other account, including any other signed-in Google user.

## What leaves the system

Generating a campaign sends the brief, the distilled company context and the relevant source text to Anthropic's API, and, when image generation is used, sends the visual brief and any reference artwork to Google's Gemini API. Web research sends search queries to those providers' search tools. API keys are held server-side and never reach the browser.

No client data is sent anywhere else. There are no other integrations in this version.

## Retention

Data is kept until you delete the client. Deleting a client removes its documents and its stored files. There is no separate backup that survives deletion.

## Export

One button per client produces a zip containing every stored document as JSON and every stored file. It is complete: what the export contains is what the system holds.

## Access

One operator. No sharing, no team accounts, no client logins. If a client wants their material, it is exported and sent to them.

## Questions this raises for a client, answered plainly

*Is our material used to train models?* Anthropic's and Google's API terms govern that; both offer terms under which API content is not used for training. Check the terms in force for the account this deployment uses before answering a client in writing.

*Can you delete everything?* Yes, per client, and the export lets you verify what existed first.

*Who else can see it?* One account. The security rules are in `firestore.rules` and `storage.rules` in the repository and can be read by anyone who asks.
