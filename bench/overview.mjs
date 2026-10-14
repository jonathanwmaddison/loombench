/**
 * THE OVERVIEW'S NUMBERS. Everything the landing page draws, read from the run records by the functions the other
 * pages use (`stats.mjs`, `compare.mjs`, `mix.mjs`, `peers.mjs`), so a figure there and the same figure on the Results,
 * Controls, Composition or Peer influence page cannot differ. The server answers it at `api/overview.json` and
 * `tools/site.mjs` writes it as a file.
 *
 * `overviewOf(load)` takes `load(path)`, which answers the JSON at a path relative to the site (`api/runs.json`,
 * `runs/<run>/index.json`, `runs/<run>/matches/<id>.json`, `runs/<run>/peers.json`). A part whose runs are not kept is
 * null, and the page leaves that part out.
 *
 * Shares are percent of the loom (0 to 100). An estimate is { mean, lo, hi }: a mean with its Student-t 95% interval
 * over match numbers (`lo` and `hi` are null where there is none). Pure but for `load`; runs in Node and the browser.
 */
import { NAMES, HUES, PERSONALITIES, SCORED, personality, goal, sentenceOf, replay } from './core.mjs';
import { rowsOf, table, mean } from './stats.mjs';
import { compare, interval, measuresOf } from './compare.mjs';
import { compositions, levelOf, shift, between, seatTypes } from './mix.mjs';
import { towardOf } from './peers.mjs';

/** The claim threshold the rules give a group of `n` agents, in percent (engine/loom.mjs, `setup`). */
export const ruleThreshold = n => 100 * Math.min(0.9, Math.max(0.46, 1 / n + 0.2));

/** The decision systems, in the order the pages list them: { key, test, name, about }. */
export const SYSTEMS = Object.freeze([
  { key: 'jev', test: /^jev/, name: 'Jev', about: 'jev-1.13.0, a classifier that returns a probability for each option' },
  { key: 'gptd', test: /^openai-decisions:/, name: 'GPT (Decisions)', about: 'gpt-6-luna through OpenAI\'s Decisions API' },
  { key: 'gptc', test: /^openai:/, name: 'GPT (chat)', about: 'gpt-6-luna as a chat model stating a chance for each option' },
  { key: 'local', test: /^ollama:/, name: 'medgemma:4b', about: 'a 4-billion-parameter chat model on the same machine' },
  { key: 'chance', test: /^chance$/, name: 'Uniform random', about: 'no model: every action sampled uniformly' },
].map(s => Object.freeze(s)));

const num = x => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const est = d => ({ mean: num(d.mean), lo: num(d.lo), hi: num(d.hi) });
const systemOf = model => SYSTEMS.find(s => s.test.test(String(model))) ?? null;
const ACTS = { carry: 'maintain', push: 'claim', yield: 'concede', offer: 'propose' };
const labelOf = type => { const [p, o] = type.split('>'); return p === 'no persona' ? (o ? goal(o).name : 'No objective') : personality(p).name + (o ? `, ${goal(o).name}` : ''); };
const row = (rows, key) => rows.find(r => r.key === key);

/**
 * A match replayed, round by round. `rounds[r]` is the loom as woven in round r + 1, left to right: segments
 * { seats, wide }, where `seats` is the one agent that holds it, the two that hold it jointly, or nobody (bare warp),
 * and the `wide` of a round sum to 100. `shares[r][seat]` is what each agent holds alone, and `acts[r][seat]` what it
 * chose that round ('maintain', 'claim', 'concede', 'propose'; null when it was not asked). With `focal` (a seat), the
 * timeline also names it and carries one of its action queries (`decisionOf`).
 */
async function timelineOf(load, run, id, focal = null) {
  const record = await load(`runs/${run}/matches/${id}.json`), rug = await replay(record);
  const passes = rug.history.filter(e => e.kind === 'passage'), turns = rug.record.filter(e => e.kind === 'turn');
  const timeline = {
    run, id: record.id, seed: record.match, href: `match?run=${encodeURIComponent(run)}&id=${encodeURIComponent(record.id)}`,
    picture: `runs/${run}/thumbs/${record.id}-flat.png`, order: record.bench,
    seats: record.results.map(r => ({ seat: r.seat, name: r.name, hue: HUES[r.seat], persona: personality(r.personality).name, personaKey: r.personality,
      objective: goal(r.goal).name, objectiveKey: r.goal, share: r.ground, score: r.score, attained: r.reached, claims: r.did.took, concessions: r.did.gave, refusals: r.did.refused })),
    rounds: passes.map(e => e.bench.map(g => ({ seats: g.pair ? [...g.pair] : g.who >= 0 ? [g.who] : [], wide: g.wide }))),
    shares: passes.map(e => e.shares.map(s => num(100 * s))),
    acts: passes.map(e => record.seats.map((_, seat) => { const t = turns.find(x => x.pass === e.pass && x.who === seat); return t ? ACTS[t.move.options.find(o => o.key === t.move.chose)?.kind] ?? null : null; })),
  };
  return focal === null ? timeline : { ...timeline, focal, decision: decisionOf(rug, timeline, focal) };
}

/**
 * One action query of a replayed match, as the model answered it: the first round in which `seat` claimed share. Each
 * option is { act, to, p, sampled }: `to` names the neighbour it concerns, `p` is the probability the model gave it
 * (0 to 100), and one option was sampled. Null when that agent never claimed.
 */
function decisionOf(rug, timeline, seat) {
  const turn = rug.record.find(e => e.kind === 'turn' && e.who === seat && e.move.options.find(o => o.key === e.move.chose)?.kind === 'push');
  if (!turn) return null;
  const bench = timeline.rounds[Math.max(0, turn.pass - 1)], at = bench.findIndex(g => g.seats.length === 1 && g.seats[0] === seat);
  // The neighbour on a side: the nearest agent there that is not this one.
  const beside = step => { for (let i = at + step; at >= 0 && i >= 0 && i < bench.length; i += step) { const other = bench[i].seats.find(s => s !== seat); if (other !== undefined) return NAMES[other]; } return null; };
  return { round: turn.pass + 1, seat, name: NAMES[seat],
    options: turn.move.options.map(o => ({ act: ACTS[o.kind] ?? o.kind, to: /L$/.test(o.key) ? beside(-1) : /R$/.test(o.key) ? beside(1) : null, p: num(100 * o.p), sampled: o.key === turn.move.chose })) };
}

/** The benchmark as run by default: attainment, each objective against its baseline, and final share by persona and objective. */
function benchmarkOf(index) {
  const rows = rowsOf(index.matches), t = table(rows), tally = x => ({ attained: x.reached, n: x.n, rate: num(100 * x.rate) });
  const share = (p, g) => { const xs = rows.filter(r => r.personality === p && r.goal === g).map(r => r.ground); return { mean: num(mean(xs)), n: xs.length }; };
  return {
    run: index.run, matches: t.matches.length, agents: rows.length, withObjective: tally(t.overall.told), baseline: tally(t.overall.untold),
    objectives: SCORED.map(g => ({ key: g, name: goal(g).name, line: goal(g).line, baseline: num(t.goals[g].untold.mean), score: num(t.goals[g].told.mean),
      effect: num(t.goals[g].lift), attained: t.goals[g].told.reached, n: t.goals[g].told.n,
      split: t.goals[g].split ? { objective: num(100 * t.goals[g].split.goal), persona: num(100 * t.goals[g].split.personality), both: num(100 * t.goals[g].split.both), residual: num(100 * t.goals[g].split.rest) } : null })),
    personas: PERSONALITIES.filter(p => t.personalities[p.key]).map(p => ({ key: p.key, name: p.name, sentence: p.text ? sentenceOf(0, p.key, 'personality') : null,
      none: share(p.key, 'none'), grow: share(p.key, 'grow'), give: share(p.key, 'give') })),
  };
}

/** The match of the benchmark the page opens with: the one in which an agent told to minimise its share ended with the most. */
function openingOf(index) {
  const found = index.matches.flatMap(m => m.results.filter(r => r.goal === 'give').map(r => ({ m, r }))).sort((a, b) => b.r.ground - a.r.ground || a.m.match - b.m.match)[0];
  return found ? { id: found.m.id, seat: found.r.seat } : null;
}

/** A composition set with its step from none of the second type to one: each seed before and after, and the paired changes. */
function stepOf(set) {
  const [group, added] = set.types, none = set.levels.find(l => l.count === 0)?.run, one = set.levels.find(l => l.count === 1)?.run;
  if (!none || !one) return null;
  const before = new Map(none.matches.map(m => [m.match, m])), result = (m, s) => m.results.find(r => r.seat === s);
  const pairs = one.matches.filter(q => before.has(q.match)).map(q => {
    const p = before.get(q.match), types = seatTypes(q), seats = [...types.keys()], focal = seats.filter(s => types[s] === added), others = seats.filter(s => types[s] !== added);
    const share = (m, which) => num(mean(which.map(s => result(m, s).ground)));
    return { seed: q.match, seat: focal[0], focal: [share(p, focal), share(q, focal)], others: [share(p, others), share(q, others)],
      met: focal.map(s => result(q, s).met[seatOf(q, s).goal]).find(x => x !== undefined) ?? null };
  }).sort((a, b) => a.seed - b.seed);
  const s = shift(none.matches, one.matches), level = levelOf(one.matches, set.types), base = levelOf(none.matches, set.types);
  const focal = row(s.changed.rows, 'share'), others = row(s.kept[group].rows, 'share'), system = systemOf(set.model);
  return {
    system: system?.key ?? null, systemName: system?.name ?? set.model, group: labelOf(group), added: labelOf(added), contrast: `${labelOf(group)} → ${labelOf(added)}`, size: set.size, threshold: set.threshold ?? num(ruleThreshold(set.size)),
    runs: [none.run, one.run], seeds: pairs.length, pairs,
    focal: { from: num(focal.from), to: num(focal.to), change: est(focal.difference) }, others: { from: num(others.from), to: num(others.to), change: est(others.difference) },
    claims: { focal: num(level.types[added].claims.mean), others: num(level.types[group].claims.mean), before: num(base.types[group].claims.mean) },
    refusals: { focal: num(level.types[added].refusals.mean), others: num(level.types[group].refusals.mean) },
    joint: { from: num(s.joint.from), to: num(s.joint.to), change: est(s.joint.difference) },
  };
}
const seatOf = (m, s) => m.seats[s];

/** A composition set by how many agents hold the second type: for each k, the mean final share of an agent of each type and what the group did. */
function sweepOf(set, seed) {
  const [group, added] = set.types, system = systemOf(set.model);
  return {
    system: system?.key ?? null, systemName: system?.name ?? set.model, group: labelOf(group), added: labelOf(added),
    levels: set.levels.map(l => {
      const level = levelOf(l.run.matches, set.types), m = l.run.matches.find(x => x.match === seed) ?? l.run.matches[0], types = seatTypes(m);
      return {
        k: l.count, run: l.run.run, matches: l.run.matches.length,
        second: level.types[added] ? num(level.types[added].share.mean) : null, first: level.types[group] ? num(level.types[group].share.mean) : null,
        claimsSecond: level.types[added] ? num(level.types[added].claims.mean) : null, claimsFirst: level.types[group] ? num(level.types[group].claims.mean) : null,
        joint: num(level.joint.mean), dispersion: num(level.dispersion.mean), largest: num(level.largest.mean),
        // One seed pictured at this k: its final allocation left to right as seated, and the kept picture of it.
        pictured: { seed: m.match, picture: `runs/${l.run.run}/thumbs/${m.id}-flat.png`, href: `match?run=${encodeURIComponent(l.run.run)}&id=${encodeURIComponent(m.id)}`,
          seats: (m.bench ?? m.results.map(r => r.seat)).map(s => ({ seat: s, name: NAMES[s], hue: HUES[s], second: types[s] === added, share: m.results.find(r => r.seat === s).ground })) },
      };
    }),
  };
}

/** The seed a set is pictured by: of those run at every k, the one whose changed agent ended closest to the mean at k = 1 (as the briefs choose). */
function pictureSeed(set, step) {
  const everywhere = step.pairs.filter(p => set.levels.every(l => l.run.matches.some(m => m.match === p.seed)));
  return [...everywhere].sort((x, y) => Math.abs(x.focal[1] - step.focal.to) - Math.abs(y.focal[1] - step.focal.to) || x.seed - y.seed)[0]?.seed ?? null;
}

/** The claim threshold: each contrast run at the rules' threshold and at the raised one, seed by seed, and the gap between two contrasts at each. */
function thresholdOf(sets, find) {
  const raisedSets = sets.filter(s => s.threshold && systemOf(s.model)?.key === 'jev'), T = Math.max(0, ...raisedSets.map(s => s.threshold));
  if (!T) return null;
  const contrasts = raisedSets.filter(s => s.threshold === T).map(s => {
    const raised = stepOf(s), base = find('jev', s.types[0], s.types[1], s.size, null), rules = base ? stepOf(base) : null;
    if (!raised || !rules) return null;
    const at = new Map(rules.pairs.map(p => [p.seed, p.focal[1]])), seeds = raised.pairs.filter(p => at.has(p.seed));
    return {
      contrast: raised.contrast, added: raised.added, group: raised.group, runs: { rules: rules.runs[1], raised: raised.runs[1] }, size: s.size, start: num(100 / s.size), ruleThreshold: num(ruleThreshold(s.size)), raisedThreshold: T,
      seeds: seeds.map(p => ({ seed: p.seed, rules: at.get(p.seed), raised: p.focal[1] })),
      rules: { mean: rules.focal.to, change: rules.focal.change, others: rules.others.change, atThreshold: rules.pairs.filter(p => p.focal[1] >= ruleThreshold(s.size) - 1).length },
      raised: { mean: raised.focal.to, change: raised.focal.change, others: raised.others.change, atThreshold: raised.pairs.filter(p => p.focal[1] >= T - 1).length },
      difference: est(interval(seeds.map(p => p.focal[1] - at.get(p.seed)))), refusalsOthers: raised.refusals.others,
    };
  }).filter(Boolean).sort((a, b) => b.size - a.size || a.contrast.localeCompare(b.contrast));
  // Two dispositions set against each other at each threshold, paired by seed: the second minus the first.
  const five = contrasts.filter(c => c.size === 5), [a, b] = ['Blunt', 'Rude'].map(name => five.find(c => c.added === name));
  const gap = a && b ? (() => {
    const of = new Map(a.seeds.map(p => [p.seed, p])), both = b.seeds.filter(p => of.has(p.seed));
    return { first: a.added, second: b.added, rules: est(interval(both.map(p => p.rules - of.get(p.seed).rules))), raised: est(interval(both.map(p => p.raised - of.get(p.seed).raised))) };
  })() : null;
  return { rules: num(ruleThreshold(5)), raised: T, contrasts, gap };
}

/** One contrast under each decision system on the same seeds, and each system against the first, paired by seed (`between`). */
function systemsOf(steps, sets, find, group, added) {
  const mine = SYSTEMS.map(s => ({ s, set: find(s.key, group, added, 5, null) })).filter(x => x.set && stepOf(x.set));
  if (mine.length < 2) return null;
  const runsOf = set => ({ none: set.levels.find(l => l.count === 0).run.matches, one: set.levels.find(l => l.count === 1).run.matches });
  const MEASURES = [['focal.change', 'focal'], ['others.change', 'others'], ['focal.claims', 'claims'], ['others.refusals', 'refusals'], ['base.claims', 'baseClaims'], ['base.joint', 'baseJoint']];
  const first = mine[0], rows = [], versus = [];
  for (const [i, x] of mine.entries()) {
    const b = between(runsOf(first.set), runsOf(x.set)), side = i === 0 ? 'first' : 'second';
    rows.push({ system: x.s.key, name: x.s.name, about: x.s.about, ...Object.fromEntries(MEASURES.map(([key, as]) => [as, est(row(b.rows, key)[side])])) });
    if (i > 0) versus.push({ system: x.s.key, name: `${x.s.name} − ${first.s.name}`, seeds: b.matches, ...Object.fromEntries(MEASURES.map(([key, as]) => [as, est(row(b.rows, key).difference)])) });
  }
  return { contrast: stepOf(first.set).contrast, seeds: versus[0]?.seeds ?? stepOf(first.set).seeds, rows, versus };
}

/** Attainment under each switch for each decision system, on the match designs every condition was run on, with the paired difference from that system's default. */
function switchesOf(indexes) {
  const CONDITIONS = [['default', 'Default', ''], ['again', 'Default, a second execution', '-again'], ['personaOff', 'Personas off', '-persona-off'],
    ['solo', 'Solo, neighbours accept', '-solo'], ['soloRefuse', 'Solo, neighbours refuse', '-solo-refuse']];
  const BASES = { jev: ['main', { again: 'replicate', personaOff: 'persona-off', solo: 'solo', soloRefuse: 'solo-refuse', objectiveOff: 'objective-off' }],
    gptd: ['luna-decisions', {}], gptc: ['luna-chat', {}], local: ['medgemma', {}],
    chance: ['chance', { solo: 'chance-solo', again: null, personaOff: null, soloRefuse: null, objectiveOff: null }] };
  const designs = 11, upTo = index => index.matches.filter(m => m.match <= designs);
  const systems = SYSTEMS.map(s => {
    const [base, named] = BASES[s.key], plain = indexes.get(base);
    if (!plain) return null;
    const cells = CONDITIONS.map(([key, name, suffix]) => {
      const run = key === 'default' ? base : key in named ? named[key] : `${base}${suffix}`, index = run ? indexes.get(run) : null;
      if (!index) return null;
      const told = upTo(index).flatMap(m => m.results.filter(r => !r.placeholder && r.score !== null)), attained = told.filter(r => r.reached).length;
      const paired = key === 'default' ? null : row(compare(upTo(plain), upTo(index)).rows, 'attainment');
      const scores = Object.fromEntries(SCORED.map(g => {
        const gs = told.filter(r => r.goal === g);
        return [g, gs.length ? { score: num(mean(gs.map(r => r.score))), attained: gs.filter(r => r.reached).length, n: gs.length } : null];
      }));
      return { key, name, run, attained, n: told.length, rate: num(100 * attained / told.length), difference: paired ? est(paired.difference) : null, scores };
    }).filter(Boolean);
    const offRun = 'objectiveOff' in named ? named.objectiveOff : `${base}-objective-off`, offIdx = offRun ? indexes.get(offRun) : null;
    const offMeas = offIdx ? measuresOf(upTo(offIdx)) : s.key === 'chance' ? measuresOf(upTo(plain)) : null;
    const objectiveOff = offMeas ? { run: offIdx ? offRun : base, claims: num(offMeas.claims), concessions: num(offMeas.concessions), refusals: num(offMeas.refusals), adoptions: num(offMeas.adoptions) } : null;
    return { system: s.key, name: s.name, about: s.about, cells, objectiveOff };
  }).filter(Boolean);
  return systems.length ? { designs, conditions: CONDITIONS.map(([key, name]) => ({ key, name })), systems } : null;
}

/**
 * Peer communication, from every decision of the two runs made with it: the randomised contrast (message delivered
 * against the query repeated) over discordant decisions, clustered by match design as the Report does, how the
 * influence was distributed, and the receivers by persona, clustered by receiving agent.
 */
function peersOf(runs) {
  const all = runs.flatMap((rows, i) => rows.map(r => ({ ...r, run: i }))), discordant = all.filter(r => r.peerTop !== r.aloneTop);
  if (!discordant.length) return null;
  const groups = (rows, key) => { const g = new Map(); for (const r of rows) g.set(key(r), [...(g.get(key(r)) ?? []), r]); return [...g.values()]; };
  const clustered = (rows, f, key) => est(interval(groups(rows, key).map(g => mean(g.map(f)))));
  const adopted = r => (r.afterTop === r.peerTop ? 100 : 0), reactant = r => (towardOf(r) < -5 ? 100 : 0), design = r => r.n, receiver = r => `${r.n}.${r.seat}`;
  const arm = heard => { const rows = discordant.filter(r => r.heard === heard); return { n: rows.length, influence: clustered(rows, towardOf, design), adoption: clustered(rows, adopted, design), reactance: clustered(rows, reactant, design) }; };
  const treatment = arm(true), control = arm(false), treated = discordant.filter(r => r.heard), byDesign = heard => new Map(groups(discordant.filter(r => r.heard === heard), design).map(g => [g[0].n, mean(g.map(towardOf))]));
  const T = byDesign(true), C = byDesign(false);
  // The influence of each decision, counted in bins of 10 points from −100 to +100: what the two arms looked like, decision by decision.
  const bins = heard => { const out = Array(20).fill(0); for (const r of discordant.filter(x => x.heard === heard)) out[Math.min(19, Math.max(0, Math.floor((towardOf(r) + 100) / 10)))]++; return out; };
  // One decision to show: a treated, discordant one whose shift is closest to the mean, among those with few options.
  const typical = [...treated].filter(r => r.options.length <= 5).sort((x, y) => Math.abs(towardOf(x) - treatment.influence.mean) - Math.abs(towardOf(y) - treatment.influence.mean))[0] ?? treated[0];
  const words = o => `${{ carry: 'Maintain position', push: 'Claim share', yield: 'Concede share', offer: 'Propose joint ownership' }[o.kind] ?? o.kind}${o.to >= 0 ? `${o.kind === 'push' ? ' from' : o.kind === 'yield' ? ' to' : ' with'} ${NAMES[o.to]}` : ''}`;
  return {
    decisions: all.length, discordant: discordant.length, designs: T.size, treatment, control,
    effect: est(interval([...T.keys()].filter(k => C.has(k)).map(k => T.get(k) - C.get(k)))),
    histogram: { from: -100, step: 10, treatment: bins(true), control: bins(false) },
    receivers: PERSONALITIES.map(p => { const rows = treated.filter(r => r.judge.personality === p.key); return rows.length ? { key: p.key, name: p.name, n: rows.length, influence: clustered(rows, towardOf, receiver), reactance: num(mean(rows.map(reactant))), adoption: num(mean(rows.map(adopted))) } : null; }).filter(Boolean),
    example: typical ? { receiver: NAMES[typical.seat], sender: NAMES[typical.peer], receiverPersona: personality(typical.judge.personality).name, influence: num(towardOf(typical)),
      options: typical.options.map((o, i) => ({ words: words(o), prior: num(100 * typical.alone[i]), posterior: num(100 * typical.after[i]), advocated: i === typical.peerTop })) } : null,
  };
}

/**
 * Common knowledge of other agents' dispositions, objectives, or both (`--know persona|objective|both`), paired by
 * match design against the private-information baselines (`main` and `persona-off`) and across adversarial group compositions.
 */
async function knowledgeOf(indexes, find, load) {
  const designs = 11, upTo = index => index.matches.filter(m => m.match <= designs);
  const CELLS = [
    ['private', 'Private (default)', 'main', 'main', true, 'none'],
    ['persona', 'Know dispositions', 'know-persona', 'main', true, 'persona'],
    ['objective', 'Know objectives', 'know-objective', 'main', true, 'objective'],
    ['both', 'Know both', 'know-both', 'main', true, 'both'],
    ['personaOff', 'Personas off · private', 'persona-off', 'persona-off', false, 'none'],
    ['personaOffObjective', 'Personas off · know objectives', 'persona-off-know-objective', 'persona-off', false, 'objective'],
  ];
  const withPcts = obj => {
    const total = Object.values(obj).reduce((a, b) => a + b, 0) || 1;
    return { ...obj, total, givePct: num(100 * obj.give / total), holdPct: num(100 * obj.hold / total), growPct: num(100 * obj.grow / total) };
  };
  const cells = [];
  for (const [key, name, run, baseRun, personaDealt, know] of CELLS) {
    const idx = indexes.get(run), baseIdx = indexes.get(baseRun);
    if (!idx || !baseIdx) continue;
    const ms = upTo(idx), baseMs = upTo(baseIdx), meas = measuresOf(ms), cmp = run === baseRun ? null : compare(baseMs, ms);
    const told = ms.flatMap(m => m.results.filter(r => !r.placeholder && r.score !== null)), attained = told.filter(r => r.reached).length;
    const scores = Object.fromEntries(SCORED.map(g => {
      const gs = told.filter(r => r.goal === g);
      return [g, gs.length ? { score: num(mean(gs.map(r => r.score))), attained: gs.filter(r => r.reached).length, n: gs.length } : null];
    }));
    const shares = Object.fromEntries(['grow', 'give', 'hold', 'borrow', 'none'].map(g => [g, num(meas[`share.${g}`])]));
    const maxShare = num(mean(ms.map(m => Math.max(...m.results.map(r => r.ground)))));
    const minShare = num(mean(ms.map(m => Math.min(...m.results.map(r => r.ground)))));
    const diff = cmp ? Object.fromEntries(['attainment', 'claims', 'concessions', 'refusals', 'dispersion', 'score.hold', 'score.grow', 'score.give']
      .map(k => [k.replace('score.', ''), row(cmp.rows, k) ? est(row(cmp.rows, k).difference) : null])) : null;
    // Directional targeting of executed claims and top-choice pushes, yields, and refusals from the match records.
    const claimsTo = { grow: 0, give: 0, hold: 0, borrow: 0, none: 0 };
    const pushTop = { grow: 0, give: 0, hold: 0, borrow: 0, none: 0 };
    const yieldTop = { grow: 0, give: 0, hold: 0, borrow: 0, none: 0 };
    const refuseTop = { grow: 0, give: 0, hold: 0, borrow: 0, none: 0 };
    await Promise.all(ms.map(async m => {
      try {
        const rec = await load(`runs/${run}/matches/${m.id}.json`), asks = [];
        const rug = await replay(rec, { onAsk: put => asks.push(put) });
        for (const e of rug.record) {
          if (e.kind === 'talk' && e.what === 'press' && rec.seats[e.to]) claimsTo[rec.seats[e.to].goal]++;
        }
        for (const put of asks) {
          const a = rec.tape[put.id];
          if (!a) continue;
          for (const [k, q] of Object.entries(put.asked)) {
            if (!a[k]?.choice || !q.options) continue;
            const opt = q.options[Number(a[k].choice.slice(1)) - 1];
            if (q.what === 'move') {
              if (opt?.kind === 'push' && opt.to >= 0) pushTop[rec.seats[opt.to].goal]++;
              else if (opt?.kind === 'yield' && opt.to >= 0) yieldTop[rec.seats[opt.to].goal]++;
            } else if (q.what === 'press' && q.about >= 0 && opt?.key === 'refuse') {
              refuseTop[rec.seats[q.about].goal]++;
            }
          }
        }
      } catch { /* skip unreadable record */ }
    }));
    cells.push({
      key, name, run, know, matches: ms.length, personaDealt, attained, n: told.length, rate: num(100 * attained / told.length),
      scores, shares, claims: num(meas.claims), concessions: num(meas.concessions), refusals: num(meas.refusals),
      adoptions: num(meas.adoptions), dispersion: num(meas.dispersion), maxShare, minShare, diff,
      targeting: {
        claims: withPcts(claimsTo),
        pushTop: withPcts(pushTop),
        yieldTop: withPcts(yieldTop),
        refuseTop: withPcts(refuseTop),
      },
    });
  }
  if (cells.length < 4) return null;
  const byKey = k => cells.find(c => c.key === k) ?? null;
  const diffs = {
    personaVsPrivate: byKey('persona')?.diff ?? null,
    objectiveVsPrivate: byKey('objective')?.diff ?? null,
    bothVsPrivate: byKey('both')?.diff ?? null,
    personaOffObjectiveVsPrivate: byKey('personaOffObjective')?.diff ?? null,
  };
  const personas = PERSONALITIES.filter(p => p.key !== 'plain').map(p => {
    const rowObj = {};
    for (const key of ['private', 'persona', 'objective', 'both']) {
      const c = byKey(key), idx = c ? indexes.get(c.run) : null;
      if (!idx) continue;
      const rs = upTo(idx).flatMap(m => m.results).filter(r => r.personality === p.key);
      rowObj[key] = rs.length ? num(mean(rs.map(r => r.ground))) : null;
    }
    return { key: p.key, name: p.name, ...rowObj };
  }).sort((a, b) => (b.private ?? 0) - (a.private ?? 0));
  const advPair = (key, label, group, added, threshold, knowKey) => {
    const privSet = find('jev', group, added, 5, threshold, null), knowSet = find('jev', group, added, 5, threshold, knowKey);
    const priv = privSet ? stepOf(privSet) : null, known = knowSet ? stepOf(knowSet) : null;
    if (!priv || !known) return null;
    const privAt = new Map(priv.pairs.map(p => [p.seed, p.focal[1]]));
    const common = known.pairs.filter(p => privAt.has(p.seed));
    const knownVsPrivate = est(interval(common.map(p => p.focal[1] - privAt.get(p.seed))));
    return {
      key, label, threshold: threshold ?? 46, know: knowKey,
      private: { ...priv, run: priv.runs[1] },
      known: { ...known, run: known.runs[1] },
      knownVsPrivate,
    };
  };
  const adversarial = [
    advPair('calmBlunt46', '4 calm + 1 blunt (46% rule cap)', 'Calm', 'Blunt', null, 'persona'),
    advPair('calmBlunt90', '4 calm + 1 blunt (90% threshold)', 'Calm', 'Blunt', 90, 'persona'),
    advPair('holdGrow', '4 Hold + 1 Grow (personas off)', 'Hold', 'Grow', null, 'objective'),
  ].filter(Boolean);
  return { designs, cells, diffs, personas, adversarial };
}

/** Everything the landing page draws (see the head of this file). */
export async function overviewOf(load) {
  const listed = (await load('api/runs.json')).filter(r => r.run !== 'play'), indexes = new Map();
  await Promise.all(listed.map(async r => { try { indexes.set(r.run, await load(`runs/${r.run}/index.json`)); } catch { /* a run that cannot be read is left out */ } }));
  const sets = compositions([...indexes.values()].sort((a, b) => a.run.localeCompare(b.run)));
  const typed = (t, name) => labelOf(t) === name;
  const find = (system, group, added, size = 5, threshold = null, know = null) => sets.find(s => systemOf(s.model)?.key === system && s.size === size && (s.threshold ?? null) === threshold && (s.know ?? null) === know
    && (typed(s.types[0], group) || s.types[0] === group) && (typed(s.types[1], added) || s.types[1] === added)) ?? null;
  const tryTimeline = async (run, id, focal = null) => { try { return await timelineOf(load, run, id, focal); } catch { return null; } };

  const main = indexes.get('main') ?? null, opening = main ? openingOf(main) : null, blunt = find('jev', 'Calm', 'Blunt'), bluntStep = blunt ? stepOf(blunt) : null;
  const seed = bluntStep ? pictureSeed(blunt, bluntStep) : null, idOf = (run, n) => indexes.get(run)?.matches.find(m => m.match === n)?.id ?? null;
  const replayOf = async (run, n) => (run && idOf(run, n) ? tryTimeline(run, idOf(run, n)) : null);
  const sweeps = [['jev', 'Calm', 'Blunt'], ['gptd', 'Calm', 'Blunt'], ['gptd', 'Cooperative', 'Greedy'], ['jev', 'No objective', 'Grow'], ['gptd', 'No objective', 'Grow']]
    .map(([s, a, b]) => { const set = find(s, a, b), step = set ? stepOf(set) : null; return step ? sweepOf(set, pictureSeed(set, step)) : null; }).filter(Boolean);
  const steps = [['jev', 'Calm', 'Blunt'], ['gptd', 'Calm', 'Blunt'], ['gptc', 'Calm', 'Blunt'], ['jev', 'Calm', 'Rude'], ['gptd', 'Calm', 'Rude'], ['gptd', 'Cooperative', 'Greedy'],
    ['jev', 'No objective', 'Grow'], ['gptd', 'No objective', 'Grow'], ['jev', 'No objective', 'Give'], ['gptd', 'No objective', 'Give'], ['jev', 'Hold', 'Grow']]
    .map(([s, a, b]) => { const set = find(s, a, b); return set ? stepOf(set) : null; }).filter(Boolean);
  // The claim threshold pictured: the match number whose changed agent ended closest to the two means, woven both ways.
  const threshold = thresholdOf(sets, find), shown = threshold?.contrasts.find(c => c.size === 5 && c.added === 'Blunt') ?? threshold?.contrasts[0] ?? null;
  const typical = shown ? [...shown.seeds].sort((p, q) => Math.abs(p.rules - shown.rules.mean) + Math.abs(p.raised - shown.raised.mean) - Math.abs(q.rules - shown.rules.mean) - Math.abs(q.raised - shown.raised.mean) || p.seed - q.seed)[0] : null;
  const pictured = typical ? { seed: typical.seed, contrast: shown.contrast, rules: await replayOf(shown.runs.rules, typical.seed), raised: await replayOf(shown.runs.raised, typical.seed) } : null;
  const peerRuns = (await Promise.all(['chosen-peers', 'peers'].map(async run => { try { return (await load(`runs/${run}/peers.json`)).rows; } catch { return null; } }))).filter(Boolean);
  const knowledge = await knowledgeOf(indexes, find, load);

  return {
    runs: indexes.size, agents: NAMES.map((name, seat) => ({ seat, name, hue: HUES[seat] })),
    benchmark: main ? benchmarkOf(main) : null,
    opening: opening ? await tryTimeline('main', opening.id, opening.seat) : null,
    blunt: bluntStep ? { ...bluntStep, seed, before: await replayOf(bluntStep.runs[0], seed), after: await replayOf(bluntStep.runs[1], seed) } : null,
    sweeps, steps,
    threshold: threshold ? { ...threshold, pictured } : null,
    systems: systemsOf(steps, sets, find, 'Calm', 'Blunt'),
    switches: switchesOf(indexes),
    peers: peerRuns.length ? peersOf(peerRuns) : null,
    knowledge,
  };
}
