# lib/ has moved to web/core/

Vercel installs and traces from the project's Root Directory. With the Next app
in `web/` and the runtime in `lib/`, nothing above the root was reliably
included in the deployment, and the build failed. The runtime now lives at
`web/core/` so it sits inside the deployed root.

The shims in this directory re-export `web/core/*` so `legacy/` and the test
suites keep working unchanged. New code should require `web/core` directly;
these shims go when `legacy/` is deleted (task 20).
