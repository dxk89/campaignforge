/**
 * Where a finished campaign can go, and what stands in the way.
 *
 * Kept as data rather than prose in a page so the two cannot drift, and so a
 * test can insist that anything not available says precisely what blocks it.
 * "Coming soon" with no reason is the sort of thing that is still there two
 * years later; a named blocker either gets cleared or gets dropped.
 *
 * `status` is one of:
 *   ready    works today, no setup beyond what is already deployed
 *   blocked  the work is understood, something outside the code is in the way
 */
const INTEGRATIONS = [
  {
    name: 'Scheduler import',
    what: 'The planned month as dated rows for Hootsuite, Buffer, or a spreadsheet.',
    status: 'ready',
    detail: 'Set the start date on the Social tab. Weekend posts move to the Monday after.',
  },
  {
    name: 'Post composers',
    what: 'Open a post in LinkedIn, X, Threads, Facebook or Pinterest with the text already in it.',
    status: 'ready',
    detail: 'On each post in the Social tab. A person still presses post, which is the step worth keeping human.',
  },
  {
    name: 'HubSpot',
    what: 'The lifecycle and the email sequence pushed in as real HubSpot objects.',
    status: 'blocked',
    blocker: 'Needs Marketing Hub Professional.',
    detail:
      'A private app token reaches CRM objects on any plan, contacts and companies and deals, but a campaign has ' +
      'little to say to those. Marketing emails, workflows and campaigns are the objects this would write, and they ' +
      'are Professional and above. On a free portal there is nothing worth pushing.',
  },
  {
    name: 'LinkedIn posting',
    what: 'Publish the month to a company page on the schedule, rather than opening a composer per post.',
    status: 'blocked',
    blocker: 'Needs Community Management API access, which is a review.',
    detail:
      'The review takes weeks and can be refused, and nothing is demonstrable until it clears. The composer links ' +
      'above do the same job with a person in the loop, which is why this is worth waiting for rather than working around.',
  },
  {
    name: 'Meta and Google Ads',
    what: 'Push the ad sets and creatives to the platforms, then track their state.',
    status: 'blocked',
    blocker: 'Needs an OAuth app and review per platform.',
    detail:
      'The exported JSON already mirrors the field structure each platform expects and the validator already enforces ' +
      'their character limits, so the mapping is direct. What changes is state: a pushed ad has an ID, a review status ' +
      'and a spend, none of which exist here. ARCHITECTURE.md sets out what that would take.',
  },
];

module.exports = { INTEGRATIONS };
