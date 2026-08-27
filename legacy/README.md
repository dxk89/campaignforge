# Legacy Express app

The prototype front end and its Express server. Superseded by `web/` (Next.js) in Phase 1.

It still runs (`npm run legacy`, or with `MOCK_CLAUDE=1`) and shares the same `lib/` agent runtime, so it is a useful second check that a change to `lib/` did not break anything. It is kept for one release and then deleted; nothing new should be added here.

The front-end test suite still drives it, which is deliberate: it exercises `lib/` through a completely different client than the Next app does.
