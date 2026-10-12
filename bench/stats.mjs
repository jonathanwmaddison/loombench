// The tables: told against untold, the lift, and what decided the score. Pure functions over rows (every weaver's
// result in every match, flattened). Runs in the browser and in Node; imports nothing.

/** The four goals that are scored, in the order the tables show them. */
export const SCORED = ['grow', 'give', 'hold', 'borrow'];

/**
 * Flattens matches ([{ id, results }]) into rows: each agent's result, with the match id added as `match`. A solo
 * match's four placeholders decided nothing, so they are not rows.
 */
export function rowsOf(matches) {
  return matches.flatMap((m) => m.results.filter((r) => !r.placeholder).map((r) => ({ ...r, match: m.id })));
}

/** The mean of a list of numbers; NaN for an empty list. */
export function mean(xs) {
  return xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : NaN;
}

/** The count, reached count, rate and mean of a list of { value, reached } pairs; rate and mean are NaN when empty. */
function tally(pairs) {
  const n = pairs.length;
  const reached = pairs.filter((p) => p.reached).length;
  return { n, mean: mean(pairs.map((p) => p.value)), reached, rate: n ? reached / n : NaN };
}

/** Told and untold results for one goal, and the lift (told mean minus untold mean). */
export function group(rows, goal) {
  const pair = (r) => ({ value: r.scores[goal], reached: r.met[goal] });
  const told = tally(rows.filter((r) => r.goal === goal && r.score !== null).map(pair));
  const untold = tally(rows.filter((r) => r.goal === 'none').map(pair));
  return { told, untold, lift: told.mean - untold.mean };
}

/**
 * What decided the score for a goal, as shares of its spread: the goal (told it or not), the personality, the two
 * together, and everything else. Only personalities with both told and untold rows count; null if fewer than two,
 * or if no score varies at all.
 */
export function split(rows, goal) {
  const used = rows.filter((r) => r.goal === goal || r.goal === 'none');
  const people = [...new Set(used.map((r) => r.personality))].filter(
    (p) => used.some((r) => r.personality === p && r.goal === goal) && used.some((r) => r.personality === p && r.goal === 'none')
  );
  const P = people.length;
  if (P < 2) return null;
  // cells[i][t]: the scores of people[i]; t = 0 told nothing, t = 1 told the goal
  const cells = people.map((p) =>
    [0, 1].map((t) => used.filter((r) => r.personality === p && (r.goal === goal) === (t === 1)).map((r) => r.scores[goal]))
  );
  const m = cells.map((pair) => pair.map((xs) => mean(xs)));
  const counts = cells.flat().map((xs) => xs.length);
  const N = counts.reduce((sum, n) => sum + n, 0);
  const mu = mean(m.flat());
  const a = m.map((pair) => (pair[0] + pair[1]) / 2);
  const b = [0, 1].map((t) => mean(m.map((pair) => pair[t])));
  const nh = (2 * P) / counts.reduce((sum, n) => sum + 1 / n, 0);
  const ssGoal = nh * P * b.reduce((sum, bt) => sum + (bt - mu) ** 2, 0);
  const ssPers = nh * 2 * a.reduce((sum, ap) => sum + (ap - mu) ** 2, 0);
  let ssBoth = 0;
  let ssRest = 0;
  for (let i = 0; i < P; i++) {
    for (let t = 0; t < 2; t++) {
      ssBoth += (m[i][t] - a[i] - b[t] + mu) ** 2;
      for (const x of cells[i][t]) ssRest += (x - m[i][t]) ** 2;
    }
  }
  ssBoth *= nh;
  const total = ssGoal + ssPers + ssBoth + ssRest;
  if (total < 1e-9) return null;
  // the noise within cells is taken out of each effect, so a few rows cannot fake one
  const ms = N - 2 * P > 0 ? ssRest / (N - 2 * P) : 0;
  const goalShare = Math.max(0, ssGoal - ms) / total;
  const personality = Math.max(0, ssPers - (P - 1) * ms) / total;
  const both = Math.max(0, ssBoth - (P - 1) * ms) / total;
  return { goal: goalShare, personality, both, rest: 1 - goalShare - personality - both };
}

/** Everything the Results page shows: overall told against untold, each goal by personality, and each personality. */
export function table(rows) {
  const matches = [...new Set(rows.map((r) => r.match))];
  // An agent given an objective it could not pursue (one about share, with areas fixed) has no score, and is not counted.
  const withGoal = rows.filter((r) => r.goal !== 'none' && r.score !== null);
  const untold = rows.filter((r) => r.goal === 'none');
  const overall = {
    told: tally(withGoal.map((r) => ({ value: r.score, reached: r.reached }))),
    untold: tally(untold.flatMap((r) => SCORED.map((g) => ({ value: r.scores[g], reached: r.met[g] })))),
  };
  overall.lift = overall.told.mean - overall.untold.mean;
  const people = [...new Set(rows.map((r) => r.personality))];
  const goals = {};
  for (const g of SCORED) {
    const by = {};
    for (const p of people) by[p] = group(rows.filter((r) => r.personality === p), g);
    goals[g] = { ...group(rows, g), split: split(rows, g), by };
  }
  const personalities = {};
  for (const p of people) {
    const lifts = SCORED.map((g) => goals[g].by[p].lift).filter((x) => Number.isFinite(x));
    const own = withGoal.filter((r) => r.personality === p);
    personalities[p] = { lift: mean(lifts), told: own.length, reached: own.filter((r) => r.reached).length };
  }
  return { matches, weavers: rows.length, overall, goals, personalities };
}
