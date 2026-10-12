/**
 * ONE SWITCH APART. Two runs can be compared when they were made from the same match designs (the same seats, the same
 * assignments, the same seeds) and differ in one switch. Then each match design is a pair, and the difference between
 * the pair is what the switch did in that design, plus whatever differs between two executions of the same thing.
 *
 * Pure functions over run indexes; imports only the tables' helpers, so it runs in Node and in the browser.
 */
import { SCORED, mean } from './stats.mjs';

/** The switches a run can differ in, in the order pages list them. */
export const SWITCH_KEYS = Object.freeze(['model', 'persona', 'objective', 'agents', 'area', 'designs', 'peers']);

/** A run's switches with every missing one at its default (`conditions` of an index kept before a switch existed is null). */
export function switchesOf(run) {
  const c = run.conditions ?? {}, mixed = v => (v === 'mixed' ? `mixed: ${c.mix}` : v);
  return {
    // A mixed group (two types among the five seats) is a setting of its own, named by the group.
    model: c.model ?? run.model ?? null, persona: mixed(c.persona) ?? 'dealt', objective: mixed(c.objective) ?? (run.design === 'uniform' ? 'uniform' : 'dealt'),
    // A solo run is named with how its four other seats were scripted, so each way is its own setting.
    agents: c.agents === 'solo' ? `solo-${c.neighbours ?? 'accept'}` : c.size ? `group of ${c.size}` : 'group', area: c.threshold ? `free, claim threshold ${c.threshold}%` : c.area ?? 'free', designs: c.designs ?? (run.rules === 1 ? 'chosen' : 'assigned'), peers: c.peers ?? run.mode === 'peers',
  };
}

/** The switches in which two runs differ: a list of keys of `SWITCH_KEYS`, empty when they were made alike. */
export function differsIn(a, b) {
  const x = switchesOf(a), y = switchesOf(b);
  return SWITCH_KEYS.filter(k => x[k] !== y[k]);
}

/** Whether a run was made with every switch but the model at its default. */
export function isBaseline(run) {
  const c = switchesOf(run);
  return c.persona === 'dealt' && c.objective === 'dealt' && c.agents === 'group' && c.area === 'free' && c.designs === 'assigned' && !c.peers;
}

/** An index's matches by match design: its number to the records made from it (one, or five when each agent decided alone). */
export function byDesign(matches) {
  const out = new Map();
  for (const m of matches) if (typeof m.match === 'number') out.set(m.match, [...(out.get(m.match) ?? []), m]);
  return out;
}

/** What is measured of a match design, each { key, name, unit }; `score.<objective>` and `share.<objective>` are added for each objective. */
export const MEASURES = Object.freeze([
  { key: 'attainment', name: 'Attainment rate', unit: '%' },
  ...SCORED.map(g => ({ key: `score.${g}`, name: `Objective score, ${g}`, unit: '' })),
  // The same rule applied to the agents given no objective: what the rule gives when nobody is pursuing it.
  ...SCORED.map(g => ({ key: `baseline.${g}`, name: `Baseline score, ${g}`, unit: '' })),
  ...['none', ...SCORED].map(g => ({ key: `share.${g}`, name: `Final share, objective ${g}`, unit: 'pp' })),
  { key: 'claims', name: 'Claims per agent', unit: '' }, { key: 'concessions', name: 'Concessions per agent', unit: '' },
  { key: 'refusals', name: 'Refusals per agent', unit: '' }, { key: 'adoptions', name: 'Design adoptions per agent', unit: '' },
  { key: 'dispersion', name: 'Dispersion of final shares', unit: 'pp' },
].map(m => Object.freeze(m)));

/**
 * The measures that say nothing when either run had areas fixed: share cannot change there, so nothing is claimed,
 * conceded or refused, the scores about share do not exist, and the attainment rate is over another set of objectives.
 */
export const AREA_MEASURES = Object.freeze(['attainment', 'score.grow', 'score.give', 'score.hold', 'baseline.grow', 'baseline.give', 'baseline.hold', 'share.none', 'share.grow', 'share.give', 'share.hold',
  'share.borrow', 'claims', 'concessions', 'refusals', 'dispersion']);

const DID = { claims: 'took', concessions: 'gave', refusals: 'refused', adoptions: 'borrowed' };

/**
 * The measures of one match design in one run, from its records: over the agents that decided (a solo loom's
 * placeholders are left out). A measure with nothing to measure is absent: no score for an objective nobody was given,
 * and no dispersion unless five agents decided at one loom.
 */
export function measuresOf(records) {
  const live = records.flatMap(m => m.results.filter(r => !r.placeholder)), out = {};
  // An agent has a score when it was given an objective it could pursue (`recordOf`).
  const told = live.filter(r => r.score !== null);
  if (told.length) out.attainment = 100 * mean(told.map(r => (r.reached ? 1 : 0)));
  for (const g of SCORED) {
    const mine = told.filter(r => r.goal === g);
    if (mine.length) out[`score.${g}`] = mean(mine.map(r => r.score));
  }
  const untold = live.filter(r => r.goal === 'none');
  if (untold.length) for (const g of SCORED) out[`baseline.${g}`] = mean(untold.map(r => r.scores[g]));
  for (const g of ['none', ...SCORED]) {
    const mine = live.filter(r => r.goal === g);
    if (mine.length) out[`share.${g}`] = mean(mine.map(r => r.ground));
  }
  if (live.length) for (const [key, did] of Object.entries(DID)) out[key] = mean(live.map(r => r.did[did]));
  if (records.length === 1 && live.length === 5) {
    const shares = live.map(r => r.ground), m = mean(shares);
    out.dispersion = Math.sqrt(mean(shares.map(x => (x - m) ** 2)));
  }
  return out;
}

// Student's t at 97.5% by degrees of freedom; beyond the table, a close approximation.
const T95 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093,
  2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];

/** The mean of `xs` with its 95% interval (Student's t over the values): { mean, lo, hi, k }; no interval for fewer than two. */
export function interval(xs) {
  const k = xs.length, m = mean(xs);
  if (k < 2) return { mean: m, lo: NaN, hi: NaN, k };
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (k - 1)), half = (T95[k - 1] ?? 1.96 + 2.5 / (k - 1)) * sd / Math.sqrt(k);
  return { mean: m, lo: m - half, hi: m + half, k };
}

/**
 * A run against the run it is compared with, paired by match design. `base` and `other` are lists of match summaries
 * (an index's `matches`). Returns the match designs in both, and for each measure defined in both for at least two
 * designs: the two means over those designs, and the paired difference (other minus base) with its interval. With
 * `fixed` (either run had areas fixed) the measures of `AREA_MEASURES` are left out.
 */
export function compare(base, other, { fixed = false } = {}) {
  const a = byDesign(base), b = byDesign(other), designs = [...a.keys()].filter(n => b.has(n)).sort((x, y) => x - y);
  const A = new Map(designs.map(n => [n, measuresOf(a.get(n))])), B = new Map(designs.map(n => [n, measuresOf(b.get(n))]));
  const rows = [];
  for (const measure of MEASURES) {
    if (fixed && AREA_MEASURES.includes(measure.key)) continue;
    const both = designs.filter(n => Number.isFinite(A.get(n)[measure.key]) && Number.isFinite(B.get(n)[measure.key]));
    if (both.length < 2) continue;
    const x = both.map(n => A.get(n)[measure.key]), y = both.map(n => B.get(n)[measure.key]);
    rows.push({ ...measure, base: mean(x), other: mean(y), difference: interval(y.map((v, i) => v - x[i])) });
  }
  return { designs, rows };
}
