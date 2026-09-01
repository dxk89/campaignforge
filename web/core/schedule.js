/**
 * A planned month, turned into something a scheduler can accept.
 *
 * The social pass produces day numbers, one to twenty-eight, because a plan
 * is written before anyone decides when it starts. A scheduler needs a real
 * date and a real time, and it needs them in the shape its importer expects.
 * That conversion is the whole of this file, and it is deliberately separate
 * from the planning: the same calendar can be scheduled twice, from two start
 * dates, without regenerating anything.
 *
 * This is also the layer every other execution route would sit on. Pushing to
 * an API rather than a CSV changes where the rows go, not what a row is.
 */

/**
 * When each channel posts, in local time. B2B defaults: LinkedIn before the
 * working day starts, X over lunch, the visual channels in the evening when
 * people are on their phones rather than at a desk.
 *
 * These are a starting point, not a finding. Anyone with their own audience
 * data should override them.
 */
const DEFAULT_TIMES = {
  linkedin: '08:30',
  x: '12:00',
  threads: '12:00',
  facebook: '12:30',
  youtube: '16:00',
  instagram: '17:30',
  tiktok: '18:00',
  pinterest: '20:00',
};

const pad = (n) => String(n).padStart(2, '0');

/** A date-only string, parsed as local midnight rather than UTC. */
function parseDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Turn a calendar into dated rows.
 *
 * @param {object} social      the social-planner output
 * @param {object} opts
 * @param {string} opts.startDate    YYYY-MM-DD, the date day 1 falls on
 * @param {object} [opts.times]      channel -> 'HH:mm', overriding the defaults
 * @param {boolean} [opts.skipWeekends=true]  move Saturday and Sunday posts to
 *   the following Monday. On by default because a B2B post on a Saturday is
 *   spend without an audience; set false to keep the plan's days exactly.
 * @returns {Array<{ when: Date, day: number, channel: string, pillar: string,
 *   text: string, hashtags: string[], cta: string, link: string, moved: boolean }>}
 */
function scheduleRows(social, opts = {}) {
  const start = parseDay(opts.startDate);
  if (!start) throw new Error('A start date is required, as YYYY-MM-DD.');
  const times = { ...DEFAULT_TIMES, ...(opts.times || {}) };
  const skipWeekends = opts.skipWeekends !== false;

  const posts = [...(social?.posts || [])].sort((a, b) => (a.day || 0) - (b.day || 0));
  const taken = new Set();
  const rows = [];

  for (const p of posts) {
    const when = new Date(start);
    when.setDate(start.getDate() + (Math.max(1, p.day || 1) - 1));

    let moved = false;
    if (skipWeekends) {
      // 6 is Saturday, 0 is Sunday.
      while (when.getDay() === 6 || when.getDay() === 0) {
        when.setDate(when.getDate() + 1);
        moved = true;
      }
    }

    const [h, m] = String(times[p.channel] || '09:00').split(':').map(Number);
    when.setHours(h, m || 0, 0, 0);

    // Two posts on the same channel at the same minute would be rejected by
    // most importers, and read as a double post by anyone who saw them.
    // Fifteen minutes apart is enough to separate them and stays inside the
    // five-minute increments schedulers require.
    while (taken.has(when.getTime())) when.setMinutes(when.getMinutes() + 15);
    taken.add(when.getTime());

    rows.push({
      when,
      day: p.day,
      channel: p.channel,
      pillar: p.pillar || '',
      text: p.text || '',
      hashtags: (p.hashtags || []).map((t) => '#' + String(t).replace(/^#/, '')),
      cta: p.cta || '',
      link: p.link || opts.link || '',
      moved,
    });
  }

  return rows.sort((a, b) => a.when - b.when);
}

/** The message as it would be posted: text, then hashtags. */
function messageOf(row) {
  return [row.text, row.hashtags.join(' ')].filter(Boolean).join('\n\n');
}

const csvCell = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/**
 * Hootsuite's bulk composer format: three columns, no header row, and the
 * date first. Checked against their bulk upload documentation on
 * 2026-09-01. Two of their rules bite here: times must be at least ten
 * minutes ahead and on five-minute increments, which the fifteen-minute
 * stagger above respects, and the date format has to match the one set in the
 * account, which is MM/DD/YYYY by default.
 */
function hootsuiteCsv(rows) {
  return rows
    .map((r) => {
      const d = r.when;
      const date = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      return [date, messageOf(r), r.link].map(csvCell).join(',');
    })
    .join('\n');
}

/**
 * A readable schedule with a header, for anything that is not Hootsuite:
 * Buffer's importer, a spreadsheet, or a person deciding what to approve.
 * ISO dates because everything except Hootsuite prefers them.
 */
function scheduleCsv(rows) {
  const header = ['when', 'channel', 'day', 'pillar', 'message', 'link', 'characters', 'moved_off_weekend'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const d = r.when;
    const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const message = messageOf(r);
    lines.push([when, r.channel, r.day, r.pillar, message, r.link, message.length, r.moved ? 'yes' : ''].map(csvCell).join(','));
  }
  return lines.join('\n');
}

module.exports = { scheduleRows, hootsuiteCsv, scheduleCsv, messageOf, DEFAULT_TIMES };
