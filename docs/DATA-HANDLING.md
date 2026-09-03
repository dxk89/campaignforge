# Data handling

What this tool stores, where it goes, and how to get it back or delete it. Written to be shown to a client.

## What is stored

Per client: the name and website; a brand kit (palette, fonts, logo, artwork) derived from the site or uploaded; voice rules; the text of sources you add (site pages, uploaded files, URLs, pasted text); campaigns, their briefs, and every version of every agent's output with its trace; generated images; a ledger entry for every model call.

Nothing is stored about anyone else. There is no visitor tracking in the tool, no third-party analytics, and no advertising pixels.

## Where it is stored

Google Firestore for documents, in the project configured for this deployment. Files (images, uploads, evidence) are held in Cloudflare R2, an object storage service, in a bucket configured for this deployment. Everything is written and read under a single workspace namespace. Per-visitor workspaces were removed when sign-in was simplified to two passwords; the namespacing remains in the code, so separating them again is a configuration change rather than a rewrite.

Access is by password, not a third-party account. There are two: the owner's, and one shared with anyone invited to try the tool. Both are set on the deployment and neither is stored in the database. Only the owner's password can change what applies to everyone, which is the monthly spend ceiling and the stored prompts.

The server is the only thing that reads or writes Firestore, using credentials that bypass Firestore's own security rules; those rules are set to deny everything so that nothing outside the server can reach the database directly. The workspace boundary between accounts is therefore enforced by the server's code, not by the database. That is a deliberate design choice for a single small deployment, not an oversight, but it is worth stating plainly rather than implying a database-level guarantee that is not there.

## What leaves the system

Generating a campaign sends the brief, the distilled company context and the relevant source text to Anthropic's API, and, when image generation is used, sends the visual brief and any reference artwork to Google's Gemini API. Web research sends search queries to those providers' search tools. API keys are held server-side and never reach the browser.

No client data is sent anywhere else. There are no other integrations in this version.

## Retention

Data is kept until you delete the client. Deleting a client removes its documents and its stored files. There is no separate backup that survives deletion.

## Export

One button per client produces a zip containing every stored document as JSON and every stored file. It is complete: what the export contains is what the system holds.

## Access

The owner, and anyone the owner has given the access password to. They share one workspace, so a reviewer can see the campaigns already in the tool. There are no client logins. If a client wants their material, it is exported and sent to them.

## Questions this raises for a client, answered plainly

*Is our material used to train models?* Two providers see your material, and each is governed separately. Anthropic's API terms govern the brief, company context and source text sent for campaign generation; they offer terms under which API content is not used for training. Google's Gemini API terms govern the visual brief and reference artwork sent when image generation is used, and those terms are not the same terms; check them separately. Check the terms in force for the accounts this deployment uses before answering a client in writing.

*Can you delete everything?* Yes, per client, and the export lets you verify what existed first.

*Who else can see it?* The owner, and anyone the owner has given the access password to. They share one workspace, so assume anything put in is visible to everyone holding that password. The Firestore rules in the repository (`firestore.rules`) are set to deny all direct access; they exist to stop a browser reaching the database directly, and not as an access boundary, since the server talks to Firestore with credentials that bypass them.
