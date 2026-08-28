/**
 * Run the data-layer suite against the Firestore emulator.
 *
 * The npm script used to inline the environment into the exec'd command
 * (`FIRESTORE_EMULATOR_HOST=... node test/db.test.js`). That is POSIX shell
 * syntax, and `emulators:exec` hands the string to the platform shell, so on
 * Windows cmd.exe answered with "'FIRESTORE_EMULATOR_HOST' is not recognized"
 * and the suite never ran. Setting the variables here and letting
 * emulators:exec inherit the environment keeps one command working
 * everywhere. Same reasoning as test/helpers/next-server.js: reach the JS
 * entry point with this process's node rather than going through a shell.
 *
 * Needs Java on PATH; the emulator is a JAR. Run: npm run test:emulator
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
const FIREBASE_BIN = path.join(web, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');

const env = {
  ...process.env,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  GCLOUD_PROJECT: 'demo-cf',
};

// emulators:exec takes the script as one string and runs it through a shell,
// so the paths are quoted here rather than passed as separate argv entries.
const inner = `"${process.execPath}" "${path.join(root, 'test', 'db.test.js')}"`;

const child = spawn(
  process.execPath,
  [FIREBASE_BIN, 'emulators:exec', '--only', 'firestore', '--project', 'demo-cf', inner],
  { cwd: web, env, stdio: 'inherit' },
);

child.on('exit', (code) => process.exit(code === null ? 1 : code));
