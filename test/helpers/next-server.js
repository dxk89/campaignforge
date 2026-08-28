/**
 * Start the built Next app for a route-level test.
 *
 * Spawns the Next CLI through this process's own node binary rather than
 * `npx`. On Windows `npx` is `npx.cmd`, and spawn() without a shell cannot
 * execute a .cmd, so `spawn('npx', ...)` fails with ENOENT and every
 * server-backed suite dies before its first assertion. Going straight to the
 * CLI's JS entry point keeps the child a plain node process on every platform,
 * which also means kill() reaches the server itself rather than an intervening
 * shell that would leave the port bound.
 *
 * Requires a production build. `next start` refuses to run without one, so the
 * missing-build case is checked here rather than surfacing as a pile of
 * connection-refused errors thirty seconds later.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const web = path.join(root, 'web');
const NEXT_BIN = path.join(web, 'node_modules', 'next', 'dist', 'bin', 'next');

/**
 * @param {number|string} port
 * @param {object} env  the child's environment, already built by the caller
 * @returns {import('child_process').ChildProcess}
 */
function startNext(port, env) {
  if (!fs.existsSync(path.join(web, '.next'))) {
    throw new Error(
      'web/.next is missing. This suite runs against a production build.\n' +
        'Run `MOCK_CLAUDE=1 npm run web:build` first, then `npm test`.',
    );
  }
  if (!fs.existsSync(NEXT_BIN)) {
    throw new Error('web/node_modules is missing. Run `cd web && npm install` first.');
  }
  return spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(port)], {
    cwd: web,
    env,
    stdio: 'ignore',
  });
}

module.exports = { startNext };
