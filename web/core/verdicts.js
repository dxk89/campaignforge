/**
 * Experiment verdicts, computed in code.
 *
 * The Analyst writes what results mean; it never decides whether a difference
 * is real. That is arithmetic, and arithmetic belongs here: a two-proportion
 * test, a confidence interval, and an explicit "insufficient" when the sample
 * cannot decide. A model asked to judge significance will call a 40-click
 * difference a result, which is the single most damaging thing an analyst can
 * do to a client's next three campaigns.
 */

/** Normal CDF, for the two-proportion z-test. */
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/**
 * Two-proportion test. Returns the difference, its 95% interval and a p-value.
 * @param {{conversions:number, trials:number}} a
 * @param {{conversions:number, trials:number}} b
 */
function twoProportion(a, b) {
  if (!a.trials || !b.trials) return null;
  const p1 = a.conversions / a.trials;
  const p2 = b.conversions / b.trials;
  const pooled = (a.conversions + b.conversions) / (a.trials + b.trials);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.trials + 1 / b.trials));
  const z = se === 0 ? 0 : (p1 - p2) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const seDiff = Math.sqrt((p1 * (1 - p1)) / a.trials + (p2 * (1 - p2)) / b.trials);
  const diff = p1 - p2;
  return {
    rateA: p1, rateB: p2, diff,
    relative: p2 === 0 ? null : diff / p2,
    interval: [diff - 1.96 * seDiff, diff + 1.96 * seDiff],
    pValue, z,
  };
}

/** Minimum sample per variant to detect a relative lift at a baseline rate. */
function minSample(baseline, relativeLift, power = 0.8) {
  if (!baseline || !relativeLift) return null;
  const p1 = baseline;
  const p2 = baseline * (1 + relativeLift);
  const zAlpha = 1.96;
  const zBeta = power >= 0.9 ? 1.282 : 0.842;
  const pBar = (p1 + p2) / 2;
  const numerator = (zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2;
  return Math.ceil(numerator / (p2 - p1) ** 2);
}

/** Pull "after 500 clicks" and "by 20%" out of a decision rule written in prose. */
function parseDecisionRule(text) {
  const s = String(text || '');
  const sample = s.match(/(\d[\d,]*)\s*(clicks|impressions|entrants|visits|sessions)/i);
  const lift = s.match(/(\d+(?:\.\d+)?)\s*%/);
  return {
    minSample: sample ? Number(sample[1].replace(/,/g, '')) : null,
    threshold: lift ? Number(lift[1]) / 100 : 0.2,
  };
}

/**
 * Judge one experiment against its rows.
 * @param {object} experiment from activation.experiments
 * @param {Array} variants [{ label, trials, conversions }]
 */
function verdictFor(experiment, variants) {
  const rule = parseDecisionRule(experiment.decision_rule);
  const usable = (variants || []).filter((v) => v.trials > 0);
  if (usable.length < 2) {
    return { verdict: 'insufficient', reason: 'Fewer than two variants have data.', ...rule, variants: usable };
  }

  const sorted = [...usable].sort((a, b) => b.conversions / b.trials - a.conversions / a.trials);
  const [winner, loser] = sorted;
  const stats = twoProportion(
    { conversions: winner.conversions, trials: winner.trials },
    { conversions: loser.conversions, trials: loser.trials },
  );

  const needed = rule.minSample || minSample(loser.conversions / loser.trials || 0.02, rule.threshold);
  const underSampled = usable.some((v) => v.trials < (needed || 0));

  let verdict, reason;
  if (underSampled) {
    verdict = 'insufficient';
    reason = `Needs about ${needed?.toLocaleString('en-GB')} per variant to decide a ${Math.round(rule.threshold * 100)}% difference; the smallest has ${Math.min(...usable.map((v) => v.trials)).toLocaleString('en-GB')}.`;
  } else if (stats.pValue < 0.05 && Math.abs(stats.relative ?? 0) >= rule.threshold) {
    verdict = 'met';
    reason = `${winner.label} beat ${loser.label} by ${Math.round((stats.relative || 0) * 100)}% (p = ${stats.pValue.toFixed(3)}).`;
  } else if (stats.interval[0] <= 0 && stats.interval[1] >= 0) {
    verdict = 'not_met';
    reason = `The 95% interval on the difference crosses zero, so no winner. p = ${stats.pValue.toFixed(3)}.`;
  } else {
    verdict = 'not_met';
    reason = `A real difference, but smaller than the ${Math.round(rule.threshold * 100)}% the decision rule asked for.`;
  }

  return {
    verdict, reason, ...rule, needed,
    winner: winner.label, loser: loser.label,
    stats, variants: usable,
  };
}

module.exports = { verdictFor, twoProportion, minSample, parseDecisionRule, normalCdf };
