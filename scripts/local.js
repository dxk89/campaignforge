// Start the app for the owner: no sign-in, real keys from web/.env.
process.env.MOCK_AUTH = '1';
require('child_process').spawn('npm', ['run', 'dev'], { cwd: require('path').join(__dirname, '..', 'web'), stdio: 'inherit', shell: true });
