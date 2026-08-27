# Phase 3: Authority (outline; detail after Phase 2)

Goal: the loop closes. Every insight shows its source; results come back in; learnings feed the next generation; the landing page exists; images are reviewed.

Tasks (to be specified at Phase 2 exit):
1. Provenance: every proof point, phrase, observation carries `{ sourceId|url, fetchedAt }`; UI shows it on hover; source freshness badge; `POST clients/:id/rescan` diffs new scan against stored sources and flags changed voice terms.
2. Landing Page Writer agent: `{ hero:{headline,sub,cta}, proof:[], objections:[{objection,answer}], form:{fields:[{name,type,required,maps_to_mql}]}, seo:{title,description} }`; form fields must cover every MQL criterion (validate); tracking wired via utm_plan.
3. Results ingestion: `POST campaigns/:cid/results` multipart CSV + `{ source }`; mapping UI stored per source under client settings; match rows to assets by `utm_content` then exact text; experiment verdicts computed in code against decision rules; Measurement tab shows actuals beside targets.
4. Analyst agent → proposed learnings; approve in library; `memory.learnings` live; packets gain "What has worked".
5. Exemplars: on asset approve, write `users/{uid}/clients/{clientId}/exemplars/{id}` with tags; `memory.exemplars` query by agent+channel+objective, recency then performance; packets gain examples.
6. Image review grid page; reject with note → Art Director regenerate with note; approved images to Storage `approved/`.
7. Calendar: client settings events + campaign start date → social-planner packet; posts carry real dates; CSV export includes dates.
