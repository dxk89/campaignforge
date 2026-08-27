/**
 * Writes the allowed email into the rules templates and deploys them.
 * The rules files in git carry a placeholder so the address is never
 * committed. Run: node scripts/deploy-rules.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const email = process.env.ALLOWED_EMAIL;
if (!email) { console.error('ALLOWED_EMAIL is not set'); process.exit(1); }

const root = path.join(__dirname, '..');
const out = path.join(root, '.rules-build');
fs.mkdirSync(out, { recursive: true });

for (const f of ['firestore.rules', 'storage.rules']) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  fs.writeFileSync(path.join(out, f), src.replace(/__ALLOWED_EMAIL__/g, email.toLowerCase()));
}
console.log(`Rules built for ${email} in .rules-build/`);
console.log('Deploy with: firebase deploy --only firestore:rules,storage --config firebase.json');
