const { MODELS } = require('../../pricing');
const prompt = require('../../prompts/social');
const research = require('../../prompts/research');
const audiencePrompt = require('../../prompts/audience');
const { buildRules } = require('../packets');
const { validateSocial, SOCIAL_CHANNELS, socialChannelsFor } = require('../../limits');
const { checkCompliance } = require('../tools/compliance');
const { renderGraphic } = require('../../graphics');
const { check_social_limits, check_compliance, render_card, ask_critic } = require('../tools');

module.exports = {
  name: 'social-planner',
  fixture: 'social',
  model: MODELS.sonnet,
  // A function of the brief, so the cadence, the post count and the limits
  // describe the channels this campaign actually chose. The orchestrator
  // resolves it with the run's inputs, as it does for brand-analyst.
  role: ({ brief }) => prompt.systemPrompt({ channels: brief?.socialChannels }).replace('Return ONLY a JSON object, no prose, no markdown, no code fences:', 'When every post is within its limit and clean, call the submit tool with this shape:') +
    '\n\nBefore submitting, call check_social_limits on your posts and check_compliance on the calendar, and fix everything they report, then submit. render_card and ask_critic (kind "social") are available if you are unsure of a graphic or of the point-of-view posts; neither is required. A turn here is an API round trip of about ninety seconds and the pass is stopped short of five minutes, so there is room for roughly three: draft, fix, submit.',
  criticKind: 'social',
  
  tools: [check_social_limits, check_compliance, render_card, ask_critic],
  budget: { maxTurns: 10, maxOutputTokens: 12000 },
  schema: {
    type: 'object',
    properties: {
      pillars: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, theme: { type: 'string' } } } },
      posts: {
        type: 'array', minItems: 32, maxItems: 32,
        items: {
          type: 'object',
          properties: {
            day: { type: 'integer', minimum: 1, maximum: 28 }, channel: { type: 'string', enum: Object.keys(SOCIAL_CHANNELS) }, pillar: { type: 'string' },
            text: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } }, cta: { type: 'string' },
            graphic: { type: ['object', 'null'], properties: { template: { type: 'string' }, kicker: { type: 'string' }, headline: { type: 'string' }, body: {}, footer: { type: 'string' }, image_prompt: { type: 'string' } } },
          },
          required: ['day', 'channel', 'pillar', 'text', 'hashtags', 'cta', 'graphic'],
        },
      },
    },
    required: ['pillars', 'posts'],
  },
  packet: ({ brief, strategy, assets, context, audience, brandKit, memory }) => ({
    user: prompt.userPrompt(brief, strategy, assets, research.contextForPrompt(context || research.emptyContext()), audiencePrompt.audienceForPrompt(audience)),
    brief, context, brandKit: brandKit || { siteName: brief.clientName || brief.productName, palette: null, fonts: [] },
    rules: buildRules(brief, context, memory?.approvedClaims),
  }),
  validate: (o, packet) => {
    const p = validateSocial(o, 'en').filter((i) => i.severity === 'violation').map((i) => `${i.field}: ${i.length}/${i.limit}${i.note ? ' (' + i.note + ')' : ''}`);
    // Channels the campaign did not ask for. The schema allows every supported
    // channel so the model gets a clear list, and the brief is enforced here.
    const chosen = socialChannelsFor(packet.brief?.socialChannels);
    const stray = [...new Set((o.posts || []).map((x) => x.channel).filter((c) => !chosen.includes(c)))];
    if (stray.length) p.push(`posts on channels this campaign is not running: ${stray.join(', ')}. Use only ${chosen.join(', ')}`);

    // Channels whose post is carried by the image need one.
    for (const c of chosen) {
      if (SOCIAL_CHANNELS[c].wantsGraphic !== 'always') continue;
      const missing = (o.posts || []).filter((x) => x.channel === c && !x.graphic);
      if (missing.length) p.push(`${missing.length} ${SOCIAL_CHANNELS[c].label} post(s) have no graphic; every ${SOCIAL_CHANNELS[c].label} post needs one`);
    }
    for (const f of checkCompliance(o, { ...packet.rules, language: 'en' })) if (f.severity === 'violation' && f.rule !== 'claim') p.push(`${f.path}: ${f.detail}`);
    return p;
  },
  // Draw the cards after the gate: rendering is code, the agent only chose the slots.
  postProcess: (o, packet) => {
    let g = 0;
    o.posts = (o.posts || []).slice().sort((a, b) => a.day - b.day).map((post) => {
      if (post.graphic && post.graphic.template) post.graphic.svg = renderGraphic(post.graphic, packet.brandKit, g++);
      return post;
    });
    return o;
  },
};
