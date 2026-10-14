/**
 * GROUP COMPOSITION. A group made of one type of agent (five seats with the same persona and objective), and the same
 * group with some of its seats given to a second type. Every run of a set is made from the same match numbers, so the
 * seed, the palette, the starting designs and the order on the bench are the same in each; only the types change, and
 * the seats of the second type are nested (`oddSeats` in core.mjs): the seat that holds it when one does still holds
 * it when two do. A match number is therefore a pair, or a row, across the runs of a set.
 *
 * What is measured: the final share of an agent of each type, what agents of each type did, how unequal the final
 * shares are, and how much of the loom ends held jointly by two agents (an agent's share is what it holds alone); then, between two runs of a set, the paired change for the seats whose type changed and for the
 * seats whose type did not, each with a Student-t 95% interval over match numbers.
 *
 * Pure functions over run indexes; runs in Node and in the browser.
 */
import { typeOf } from './core.mjs';
import { interval } from './compare.mjs';
import { mean } from './stats.mjs';

/** What is measured of the agents of a type in a match: { key, name, of(result) }. */
export const TYPE_MEASURES = Object.freeze([
  { key: 'share', name: 'Final share (%)', of: r => r.ground },
  { key: 'claims', name: 'Claims', of: r => r.did.took },
  { key: 'concessions', name: 'Concessions', of: r => r.did.gave },
  { key: 'proposals', name: 'Joint-ownership proposals', of: r => r.did.offered },
  { key: 'refusals', name: 'Refusals', of: r => r.did.refused },
  { key: 'adoptions', name: 'Design adoptions', of: r => r.did.borrowed },
  { key: 'eliminated', name: 'Left with no share (%)', of: r => (r.ground === 0 ? 100 : 0) },
]);

/** The type each seat of a match holds, as `typeOf` words it: an array by seat. */
export const seatTypes = m => m.seats.map(typeOf);

/** The standard deviation of a match's final shares, in percentage points: 0 when every agent ends with the same share. */
export function dispersion(m) {
  const shares = m.results.map(r => r.ground), mu = mean(shares);
  return Math.sqrt(mean(shares.map(x => (x - mu) ** 2)));
}

/**
 * The part of the loom that ends held jointly by two agents, in percent (`heldOf` in core.mjs, kept in the record).
 * For a record kept before that was, what is left when each agent's own share is taken away, which is the same
 * unless warp was left bare.
 */
export const joint = m => (Number.isFinite(m.joint) ? m.joint : Math.max(0, 100 - m.results.reduce((s, r) => s + r.ground, 0)));

/** How a match's loom ends divided, in percent: the agents of each of `types` together, and what two agents hold jointly. */
export function division(m, types) {
  const kinds = seatTypes(m);
  return { ...Object.fromEntries(types.map(t => [t, m.results.filter(r => kinds[r.seat] === t).reduce((s, r) => s + r.ground, 0)])), joint: joint(m) };
}

/**
 * The sets of runs to read together. `runs` are run indexes. A set is a model, the other switches, and two types: every
 * run of that model whose seats hold only those two types, by how many seats hold the second (`count`, 0 to 5). The
 * A set is also of one group size (`size`, five unless its runs were made with fewer agents) and one claim threshold
 * (`threshold`, null at the loom's own). The
 * second type is the one that is added: the type with fewer seats in the set's largest run of both types (where that
 * run is split evenly, the type that is not the one with the larger run to itself; failing that, the later in
 * alphabetical order). Only runs with every other switch alike are put together, and a set
 * needs a run with both types in it.
 * Returns [{ key, model, types: [first, second], levels: [{ count, run }] }], levels by count.
 */
export function compositions(runs) {
  const rest = r => { const c = r.conditions ?? {}; return JSON.stringify([c.agents ?? 'group', c.neighbours ?? null, c.area ?? 'free', c.designs ?? 'assigned', Boolean(c.peers), c.read ?? null, c.effort ?? null, c.size ?? 5, c.threshold ?? null, c.know ?? null]); };
  // What types a run is made of: the same in every match, or it is no run of a composition.
  const made = new Map();
  for (const r of runs) {
    if (!r.matches?.length || r.matches.some(m => !Array.isArray(m.seats))) continue;
    const kinds = r.matches.map(m => [...new Set(seatTypes(m))].sort());
    if (kinds.every(k => k.length <= 2 && k.join('|') === kinds[0].join('|'))) made.set(r, kinds[0]);
  }
  const sets = new Map();
  for (const [r, kinds] of made) {
    if (kinds.length !== 2) continue;
    const key = `${r.model} ${rest(r)} ${kinds.join(' | ')}`;
    if (!sets.has(key)) sets.set(key, { key, model: r.model, rest: rest(r), size: r.conditions?.size ?? 5, threshold: r.conditions?.threshold ?? null, ...(r.conditions?.know ? { know: r.conditions.know } : {}), types: kinds, levels: [] });
  }
  for (const set of sets.values()) {
    // Which type is the one added: the minority of the largest run that has both (then of the most unequal one).
    const seatsOfType = (r, t) => seatTypes(r.matches[0]).filter(x => x === t).length;
    const lead = [...made].filter(([r, kinds]) => kinds.length === 2 && r.model === set.model && rest(r) === set.rest && kinds.join(' | ') === set.types.join(' | ')).map(([r]) => r)
      .sort((a, b) => b.matches.length - a.matches.length || Math.abs(set.size / 2 - seatsOfType(b, set.types[0])) - Math.abs(set.size / 2 - seatsOfType(a, set.types[0])) || a.run.localeCompare(b.run))[0];
    // Where that run is split evenly (a group of two), the group's type is the one that has a run to itself with more matches.
    const alone = t => Math.max(0, ...[...made].filter(([r, kinds]) => kinds.length === 1 && kinds[0] === t && r.model === set.model && rest(r) === set.rest).map(([r]) => r.matches.length));
    const [p, q] = set.types.map(t => seatsOfType(lead, t));
    if (p < q || (p === q && alone(set.types[1]) > alone(set.types[0]))) set.types = [set.types[1], set.types[0]];
    for (const [r, kinds] of made) {
      if (r.model !== set.model || rest(r) !== set.rest || kinds.some(k => !set.types.includes(k))) continue;
      const counts = r.matches.map(m => seatTypes(m).filter(t => t === set.types[1]).length);
      // A run is one composition: the same count in every match.
      if (counts.every(c => c === counts[0])) set.levels.push({ count: counts[0], run: r });
    }
    // Two runs made alike: the one with more matches stands for the composition.
    set.levels.sort((a, b) => a.count - b.count || b.run.matches.length - a.run.matches.length || a.run.run.localeCompare(b.run.run));
    set.levels = set.levels.filter((l, i, all) => !i || all[i - 1].count !== l.count);
  }
  // `other`: every other switch of the set's runs but the claim threshold, so that two sets can be told to differ in that alone.
  return [...sets.values()].map(({ rest: all, ...set }) => ({ ...set, other: JSON.stringify(JSON.parse(all).slice(0, -1)) })).sort((a, b) => b.levels.length - a.levels.length || a.key.localeCompare(b.key));
}

/**
 * One composition in numbers: for each type present, each of `TYPE_MEASURES` as the mean over an agent of that type
 * and over matches, with its interval over matches; the dispersion of final shares; the largest final share; the part
 * held jointly; and `division`, the mean over matches of how the loom ends divided between the types and joint holding.
 * `matches` are a run's match summaries, `types` the set's two types.
 */
export function levelOf(matches, types) {
  const out = { matches: matches.length, types: {}, dispersion: interval(matches.map(dispersion)), largest: interval(matches.map(m => Math.max(...m.results.map(r => r.ground)))),
    joint: interval(matches.map(joint)), division: Object.fromEntries([...types, 'joint'].map(k => [k, mean(matches.map(m => division(m, types)[k]))])) };
  for (const type of types) {
    const per = matches.map(m => m.results.filter(r => typeOf(m.seats[r.seat]) === type)).filter(rs => rs.length);
    if (!per.length) continue;
    out.types[type] = { agents: per.reduce((n, rs) => n + rs.length, 0), ...Object.fromEntries(TYPE_MEASURES.map(x => [x.key, interval(per.map(rs => mean(rs.map(x.of))))])) };
  }
  return out;
}

/**
 * Two compositions of a set, paired by match number: `from` and `to` are runs' match summaries. For the seats whose
 * type changed between the two, and for the seats whose type did not (by the type they kept), each of `TYPE_MEASURES`
 * as the two means and the paired difference (to minus from) with its interval over the match numbers both have;
 * and the same for the dispersion of final shares and for the part of the loom held jointly.
 * Returns { matches, changed: { seats, from, to, rows }, kept: { [type]: { seats, rows } }, dispersion, joint }.
 */
export function shift(from, to) {
  const a = new Map(from.map(m => [m.match, m])), pairs = to.filter(m => a.has(m.match)).map(m => [a.get(m.match), m]).sort((x, y) => x[0].match - y[0].match);
  const rowsOf = pick => TYPE_MEASURES.map(x => {
    const both = pairs.map(([p, q]) => { const seats = pick(p, q); return seats.length ? [mean(seats.map(s => x.of(p.results.find(r => r.seat === s)))), mean(seats.map(s => x.of(q.results.find(r => r.seat === s))))] : null; }).filter(Boolean);
    return { key: x.key, name: x.name, from: mean(both.map(b => b[0])), to: mean(both.map(b => b[1])), difference: interval(both.map(b => b[1] - b[0])) };
  });
  const seatsWhere = test => (p, q) => seatTypes(p).map((t, s) => (test(t, seatTypes(q)[s]) ? s : -1)).filter(s => s >= 0);
  const first = pairs[0], changedSeats = first ? seatsWhere((t, u) => t !== u)(...first) : [];
  const out = {
    matches: pairs.length,
    changed: first && changedSeats.length ? { seats: changedSeats.length, from: seatTypes(first[0])[changedSeats[0]], to: seatTypes(first[1])[changedSeats[0]], rows: rowsOf(seatsWhere((t, u) => t !== u)) } : null,
    kept: {},
    dispersion: { from: mean(pairs.map(([p]) => dispersion(p))), to: mean(pairs.map(([, q]) => dispersion(q))), difference: interval(pairs.map(([p, q]) => dispersion(q) - dispersion(p))) },
    joint: { from: mean(pairs.map(([p]) => joint(p))), to: mean(pairs.map(([, q]) => joint(q))), difference: interval(pairs.map(([p, q]) => joint(q) - joint(p))) },
  };
  for (const type of first ? [...new Set(seatTypes(first[0]).filter((t, s) => seatTypes(first[1])[s] === t))] : []) {
    const pick = seatsWhere((t, u) => t === type && u === type);
    out.kept[type] = { seats: pick(...first).length, rows: rowsOf(pick) };
  }
  return out;
}

/** What `between` compares: { key, name }. `focal` is the seat whose type was changed; `others`, the mean of the four that were not. */
export const BETWEEN = Object.freeze([
  { key: 'focal.before', name: 'Final share of the focal seat, group of one type (%)' },
  { key: 'focal.after', name: 'Final share of the focal seat, after the change (%)' },
  { key: 'focal.change', name: 'Change in the focal seat\'s final share (pp)' },
  { key: 'others.change', name: 'Change in the other four seats\' mean final share (pp)' },
  { key: 'focal.claims', name: 'Claims by the focal seat, after the change' },
  { key: 'others.refusals', name: 'Refusals per other seat, after the change' },
  { key: 'base.claims', name: 'Claims per agent, group of one type' },
  { key: 'base.joint', name: 'Held jointly, group of one type (%)' },
]);

/**
 * Two models on the same step: `a` and `b` are each { none, one }, the match summaries of a group of one type and of
 * the same match numbers with one seat changed. Over the match numbers all four runs have, each of `BETWEEN` as the
 * first model's mean and the second's (with their intervals over match numbers) and the paired difference, second
 * minus first. Returns { matches, rows: [{ key, name, first, second, difference }] }.
 */
export function between(a, b) {
  const by = runs => new Map(runs.map(m => [m.match, m])), A0 = by(a.none), A1 = by(a.one), B0 = by(b.none), B1 = by(b.one);
  const numbers = [...A1.keys()].filter(n => A0.has(n) && B0.has(n) && B1.has(n)).sort((x, y) => x - y);
  const of = (m0, m1) => {
    const t0 = seatTypes(m0), t1 = seatTypes(m1), seats = [...t0.keys()], focal = seats.filter(s => t0[s] !== t1[s]), others = seats.filter(s => t0[s] === t1[s]);
    const avg = (m, which, f) => mean(which.map(s => f(m.results.find(r => r.seat === s))));
    const out = { 'focal.before': avg(m0, focal, r => r.ground), 'focal.after': avg(m1, focal, r => r.ground), 'others.before': avg(m0, others, r => r.ground), 'others.after': avg(m1, others, r => r.ground),
      'focal.claims': avg(m1, focal, r => r.did.took), 'others.refusals': avg(m1, others, r => r.did.refused), 'base.claims': avg(m0, seats, r => r.did.took), 'base.joint': joint(m0) };
    return { ...out, 'focal.change': out['focal.after'] - out['focal.before'], 'others.change': out['others.after'] - out['others.before'] };
  };
  const pairs = numbers.map(n => [of(A0.get(n), A1.get(n)), of(B0.get(n), B1.get(n))]);
  return { matches: numbers.length, rows: BETWEEN.map(({ key, name }) => ({ key, name, first: interval(pairs.map(p => p[0][key])), second: interval(pairs.map(p => p[1][key])), difference: interval(pairs.map(p => p[1][key] - p[0][key])) })) };
}
