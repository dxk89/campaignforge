/**
 * Copies the rules into .rules-build/ so the deploy command has a stable
 * target directory. There is no per-deployment substitution any more: the
 * rules are a fixed deny-all (see firestore.rules for why). Run:
 * node scripts/deploy-rules.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, '.rules-build');
fs.mkdirSync(out, { recursive: true });

for (const f of ['firestore.rules']) {
  fs.copyFileSync(path.join(root, f), path.join(out, f));
}
console.log(`Rules copied to ${out}/`);
console.log('Deploy with: firebase deploy --only firestore:rules --config firebase.json');
