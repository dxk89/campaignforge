# Data handling

What this tool stores, where it goes, and how to get it back or delete it. Written to be shown to a client.

## What is stored

Per client: the name and website; a brand kit (palette, fonts, logo, artwork) derived from the site or uploaded; voice rules; the text of sources you add (site pages, uploaded files, URLs, pasted text); campaigns, their briefs, and every version of every agent's output with its trace; generated images; a ledger entry for every model call.

Nothing is stored about anyone else. There is no visitor tracking in the tool, no third-party analytics, and no advertising pixels.

## Where it is stored

Google Firestore for documents, in the project configured for this deployment. Files (images, uploads, evidence) are held in Cloudflare R2, an object storage service, in a bucket configured for this deployment. Each account, the owner's and any demo account, has its own workspace, and every document and file is written and read under that workspace's namespace, so one account's material is never returned to another's.

Access is by username and password, not a third-party account. The owner's credentials are set once when the tool is deployed. Demo accounts are created by the owner from within the tool; each one's password is generated, shown once, and stored as a scrypt hash, not in plain text, so it cannot be read back even from the database.

The server is the only thing that reads or writes Firestore, using credentials that bypass Firestore's own security rules; those rules are set to deny everything so that nothing outside the server can reach the database directly. The workspace boundary between accounts is therefore enforced by the server's code, not by the database. That is a deliberate design choice for a single small deployment, not an oversight, but it is worth stating plainly rather than implying a database-level guarantee that is not there.

## What leaves the system

Generating a campaign sends the brief, the distilled company context and the relevant source text to Anthropic's API, and, when image generation is used, sends the visual brief and any reference artwork to Google's Gemini API. Web research sends search queries to those providers' search tools. API keys are held server-side and never reach the browser.

No client data is sent anywhere else. There are no other integrations in this version.

## Retention

Data is kept until you delete the client. Deleting a client removes its documents and its stored files. There is no separate backup that survives deletion.

## Export

One button per client produces a zip containing every stored document as JSON and every stored file. It is complete: what the export contains is what the system holds.

## Access

The owner, signed in with credentials set on the deployment, plus any demo accounts the owner has created for people trying the tool. Each account only ever sees its own workspace; no client logins, no shared accounts. If a client wants their material, it is exported and sent to them.

## Questions this raises for a client, answered plainly

*Is our material used to train models?* Anthropic's API terms govern that; they offer terms under which API content is not used for training. Check the terms in force for the account this deployment uses before answering a client in writing.

*Can you delete everything?* Yes, per client, and the export lets you verify what existed first.

*Who else can see it?* Only the owner and anyone the owner has given a demo account to, and a demo account is confined to its own workspace by the server's code. The Firestore rules in the repository (`firestore.rules`) are set to deny all direct access; they exist to stop a browser reaching the database directly, not to enforce the boundary between accounts, since the server itself talks to Firestore with credentials that bypass those rules. The boundary between one account's data and another's is enforced in the application code that runs on the server.
