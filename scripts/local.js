// Start the app for the owner: no sign-in, real keys from web/.env.
process.env.MOCK_AUTH = '1';
const child = require('child_process').spawn('npm', ['run', 'dev'], { cwd: require('path').join(__dirname, '..', 'web'), stdio: 'inherit', shell: true });
child.on('error', (err) => { console.error(err.message); process.exit(1); });
child.on('exit', (code) => process.exit(code ?? 1));
process.on('SIGINT', () => child.kill('SIGINT'));
