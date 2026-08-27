/**
 * Long-running entry point: local development and Render.
 * The app itself lives in lib/app.js so Vercel can serve it as a function.
 */
require('dotenv').config();

const app = require('../lib/app');
const { MOCK } = require('../lib/claude');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Campaign Forge listening on http://localhost:${PORT}${MOCK ? ' (mock mode)' : ''}`);
});
