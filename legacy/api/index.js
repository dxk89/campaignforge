/**
 * Vercel entry point. Every /api/* request is rewritten here (see
 * vercel.json) and handled by the same Express app that server.js runs.
 * The static front end in /public is served by Vercel's CDN directly.
 */
module.exports = require('../../lib/app');
