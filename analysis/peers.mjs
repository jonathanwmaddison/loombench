// The decision-level estimates of the report (web/report.html): `node analysis/peers.mjs`. No key or network needed.
// Prints every table and writes analysis/pooled.json, which analysis/report.py reads.
//
// Data: every decision of the two runs of the peer condition (run 1: first rules, runs-v1/jev-peers; run 2: rules 2,
// runs/peers). A decision has the receiver's prior probabilities (`alone`), the sender's (`told`), the receiver's
// posterior (`after`), whether the message was delivered (`heard`), and who the two agents were.
//
// Intervals. Decisions are nested in agents and matches, so an interval is never taken over decisions: it is the mean
// of cluster means with a Student-t 95% interval. The two runs use the same 22 match designs (the same assignment of
// personas and objectives to seats, and the same seed), so they are not independent: in the pooled estimates a cluster
// is a match design (or an agent, or a sender-receiver pair, of a match design) with the decisions of both runs in it.
// Pooled estimates therefore rest on 22 clusters, not 44.
import { readFileSync, writeFileSync } from 'node:fs';
import { towardOf } from '../bench/peers.mjs';
import { mean } from '../bench/stats.mjs';

const load = (file, run) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).rows.map(r => ({ ...r, run }));
const RUN1 = load('runs-v1/jev-peers/peers.json', 1), RUN2 = load('runs/peers/peers.json', 2), ALL = [...RUN1, ...RUN2];
const SETS = { run1: RUN1, run2: RUN2, pooled: ALL };
const PERSONAS = ['plain', 'outgoing', 'reserved', 'warm', 'blunt', 'organised', 'careless', 'anxious', 'calm', 'curious', 'conventional'];
const OBJECTIVES = ['none', 'grow', 'give', 'hold', 'borrow'], SHARE = ['grow', 'give', 'hold'];
const ACTIONS = ['work', 'giveMe', 'takeMine', 'takeOther', 'shareMe'];

// ---- statistics --------------------------------------------------------------------------------------------------------
const T975 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101,
  2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
/** The 0.975 quantile of Student's t: tabulated to 30 degrees of freedom, then the Cornish-Fisher expansion. */
const t975 = df => T975[df] ?? (z => z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df))(1.959964);
const sd = xs => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1));
const interval = xs => {
  const v = xs.filter(Number.isFinite), k = v.length, m = mean(v), h = k > 1 ? t975(k - 1) * sd(v) / Math.sqrt(k) : NaN;
  return { m, lo: m - h, hi: m + h, k };
};
const groups = (rows, key) => { const g = new Map(); for (const r of rows) { const k = key(r); if (g.has(k)) g.get(k).push(r); else g.set(k, [r]); } return g; };
const clusterMeans = (rows, f, key) => [...groups(rows, key).values()].map(g => mean(g.map(f)));
const corr = (a, b) => {
  const ok = a.map((x, i) => Number.isFinite(x) && Number.isFinite(b[i])), xs = a.filter((_, i) => ok[i]), ys = b.filter((_, i) => ok[i]), mx = mean(xs), my = mean(ys);
  return xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
};
const rate = (rows, f) => (rows.length ? 100 * rows.filter(f).length / rows.length : NaN);

// ---- clusters and measures ---------------------------------------------------------------------------------------------
// Keys carry the match number and not the run, so the same design in the two runs is one cluster in the pooled estimates.
const MATCH = r => r.n, RECEIVER = r => `${r.n}.${r.seat}`, SENDER = r => `${r.n}.${r.peer}`, PAIR = r => `${r.n}.${r.seat}.${r.peer}`;
const INSTANCE = r => `${r.run}.${r.n}.${r.seat}`;   // one receiving agent in one run
const adopted = r => (r.afterTop === r.peerTop ? 100 : 0), isReactant = r => towardOf(r) < -5, reactant = r => (isReactant(r) ? 100 : 0);
const discordant = r => r.peerTop !== r.aloneTop, TRT = r => discordant(r) && r.heard, CTL = r => discordant(r) && !r.heard;
const priorMax = r => r.alone[r.aloneTop];

const out = {};
const text = c => (c.k ? `${c.m.toFixed(1)} [${c.lo.toFixed(1)}, ${c.hi.toFixed(1)}] k=${c.k}` : '–');
const line = (name, e) => console.log(name.padEnd(48), 'run1', text(e.run1).padEnd(27), 'run2', text(e.run2).padEnd(27), 'pooled', text(e.pooled), e.n === undefined ? '' : ` n=${e.n}`);
/** The mean of cluster means of `f` over the decisions `select` keeps, in each run and pooled. */
function estimate(name, select, f, key) {
  const e = { n: ALL.filter(select).length };
  for (const [which, rows] of Object.entries(SETS)) e[which] = interval(clusterMeans(rows.filter(select), f, key));
  out[name] = e; line(name, e);
  return e;
}
/** Paired by match design: the mean of `f` over the decisions of arm `a` minus its mean over arm `b`, where both exist. */
function contrast(name, a, b, f) {
  const e = {};
  for (const [which, rows] of Object.entries(SETS)) {
    const A = groups(rows.filter(a), MATCH), B = groups(rows.filter(b), MATCH);
    e[which] = interval([...A.keys()].filter(k => B.has(k)).map(k => mean(A.get(k).map(f)) - mean(B.get(k).map(f))));
  }
  (out.contrast ??= {})[name] = e; line(`  ${name}`, e);
  return e;
}

console.log(`decisions: run 1 ${RUN1.length}, run 2 ${RUN2.length}, pooled ${ALL.length}; discordant ${ALL.filter(discordant).length}`
  + ` (treatment ${ALL.filter(TRT).length}, control ${ALL.filter(CTL).length})\n`);

console.log('== discordant decisions; clusters are match designs');
estimate('influence, treatment', TRT, towardOf, MATCH); estimate('influence, control', CTL, towardOf, MATCH);
estimate('adoption, treatment', TRT, adopted, MATCH); estimate('adoption, control', CTL, adopted, MATCH);
estimate('reactance, treatment', TRT, reactant, MATCH); estimate('reactance, control', CTL, reactant, MATCH);
console.log('-- the randomised contrast: treatment minus control within each match design');
contrast('influence', TRT, CTL, towardOf); contrast('adoption', TRT, CTL, adopted); contrast('reactance', TRT, CTL, reactant);

console.log('\n== concordant decisions (the sender advocated the receiver\'s prior modal action)');
const CON_T = r => !discordant(r) && r.heard, CON_C = r => !discordant(r) && !r.heard;
estimate('concordant, treatment', CON_T, towardOf, MATCH); estimate('concordant, control', CON_C, towardOf, MATCH);
contrast('concordant', CON_T, CON_C, towardOf);

console.log('\n== receiver persona; clusters are receiving agents');
for (const p of PERSONAS) {
  estimate(`receiver ${p}: influence`, r => TRT(r) && r.judge.personality === p, towardOf, RECEIVER);
  estimate(`receiver ${p}: adoption`, r => TRT(r) && r.judge.personality === p, adopted, RECEIVER);
}
console.log('\n== sender persona; clusters are sending agents');
for (const p of PERSONAS) estimate(`sender ${p}: influence`, r => TRT(r) && r.speaker.personality === p, towardOf, SENDER);
console.log('\n== receiver objective; clusters are receiving agents');
for (const g of OBJECTIVES) {
  estimate(`receiver objective ${g}: influence`, r => TRT(r) && r.judge.goal === g, towardOf, RECEIVER);
  estimate(`receiver objective ${g}: adoption`, r => TRT(r) && r.judge.goal === g, adopted, RECEIVER);
}
console.log('-- within match design: every match has one receiver with each objective');
{ const of = g => r => TRT(r) && r.judge.goal === g, share = r => TRT(r) && SHARE.includes(r.judge.goal);
  // the three share objectives count equally: the mean of their three means, minus the no-objective receiver's mean
  const e = {};
  for (const [which, rows] of Object.entries(SETS)) {
    const by = Object.fromEntries(OBJECTIVES.map(g => [g, groups(rows.filter(of(g)), MATCH)])), at = (g, k) => mean(by[g].get(k).map(towardOf));
    const keys = [...by.none.keys()].filter(k => SHARE.every(g => by[g].has(k)));
    e[which] = interval(keys.map(k => mean(SHARE.map(g => at(g, k))) - at('none', k)));
  }
  out.contrast['share objective minus no objective'] = e; line('  share objective minus no objective', e);
  contrast('Borrow minus no objective', of('borrow'), of('none'), towardOf);
  void share; }
console.log('\n== sender objective; clusters are sending agents');
for (const g of OBJECTIVES) estimate(`sender objective ${g}: influence`, r => TRT(r) && r.speaker.goal === g, towardOf, SENDER);
console.log('\n== advocated action; clusters are match designs');
for (const a of ACTIONS) {
  estimate(`advocated ${a}: influence`, r => TRT(r) && r.asks === a, towardOf, MATCH);
  estimate(`advocated ${a}: adoption`, r => TRT(r) && r.asks === a, adopted, MATCH);
}
console.log('\n== prior certainty (the probability of the receiver\'s prior modal action); clusters are match designs');
const LOW = r => priorMax(r) < 0.6, HIGH = r => priorMax(r) >= 0.6;
estimate('prior max < 0.6: influence', r => TRT(r) && LOW(r), towardOf, MATCH); estimate('prior max >= 0.6: influence', r => TRT(r) && HIGH(r), towardOf, MATCH);
estimate('prior max < 0.6: adoption', r => TRT(r) && LOW(r), adopted, MATCH); estimate('prior max >= 0.6: adoption', r => TRT(r) && HIGH(r), adopted, MATCH);
console.log('-- treatment minus control within each level of certainty, and the difference between the levels');
contrast('influence, prior max < 0.6', r => TRT(r) && LOW(r), r => CTL(r) && LOW(r), towardOf);
contrast('influence, prior max >= 0.6', r => TRT(r) && HIGH(r), r => CTL(r) && HIGH(r), towardOf);
contrast('adoption, prior max < 0.6', r => TRT(r) && LOW(r), r => CTL(r) && LOW(r), adopted);
contrast('adoption, prior max >= 0.6', r => TRT(r) && HIGH(r), r => CTL(r) && HIGH(r), adopted);
{ const e = {};
  for (const [which, rows] of Object.entries(SETS)) {
    const cell = (arm, level) => groups(rows.filter(r => arm(r) && level(r)), MATCH), tl = cell(TRT, LOW), cl = cell(CTL, LOW), th = cell(TRT, HIGH), ch = cell(CTL, HIGH);
    const at = (g, k) => mean(g.get(k).map(towardOf)), keys = [...tl.keys()].filter(k => cl.has(k) && th.has(k) && ch.has(k));
    e[which] = interval(keys.map(k => (at(tl, k) - at(cl, k)) - (at(th, k) - at(ch, k))));
  }
  out.contrast['certainty: low minus high'] = e; line('  certainty: low minus high', e); }

// ---- facts quoted in the text ---------------------------------------------------------------------------------------------
console.log('\n== descriptive facts quoted in the report');
const F = out.facts = { decisions: ALL.length, discordant: ALL.filter(discordant).length, treatment: ALL.filter(TRT).length, control: ALL.filter(CTL).length,
  run1: RUN1.length, run2: RUN2.length, matchDesigns: groups(ALL, MATCH).size };
const pooled = name => out[name].pooled.m, round = (x, d = 1) => +x.toFixed(d);
{ const recv = PERSONAS.map(p => pooled(`receiver ${p}: influence`)), send = PERSONAS.map(p => pooled(`sender ${p}: influence`)), notBlunt = (_, i) => PERSONAS[i] !== 'blunt';
  const trt = ALL.filter(TRT), actionMean = Object.fromEntries([...groups(trt, r => r.asks)].map(([k, g]) => [k, mean(g.map(towardOf))]));
  // a sender persona's mean with the mean for the action it advocated removed from every decision: what is left of "who" after "what"
  const adjusted = PERSONAS.map(p => mean(clusterMeans(trt.filter(r => r.speaker.personality === p), r => towardOf(r) - actionMean[r.asks], SENDER)));
  const runMeans = (kind, which) => PERSONAS.map(p => out[`${kind} ${p}: influence`][which].m);
  Object.assign(F, { receiverSD: round(sd(recv)), receiverSDnoBlunt: round(sd(recv.filter(notBlunt))), senderSD: round(sd(send)), senderSDadjusted: round(sd(adjusted)),
    senderMean: round(mean(send)), rReceiver: round(corr(runMeans('receiver', 'run1'), runMeans('receiver', 'run2')), 2),
    rReceiverNoBlunt: round(corr(runMeans('receiver', 'run1').filter(notBlunt), runMeans('receiver', 'run2').filter(notBlunt)), 2),
    rSender: round(corr(runMeans('sender', 'run1'), runMeans('sender', 'run2')), 2) });
  console.log(`SD of persona means: receiver ${F.receiverSD} (without blunt ${F.receiverSDnoBlunt}); sender ${F.senderSD} (after removing the advocated action's mean ${F.senderSDadjusted})`);
  console.log(`between-run correlation of persona means: receiver ${F.rReceiver} (without blunt ${F.rReceiverNoBlunt}); sender ${F.rSender}`); }
{ const dis = ALL.filter(discordant), isBlunt = r => r.judge.personality === 'blunt', tv = r => 50 * r.alone.reduce((s, x, i) => s + Math.abs(x - r.after[i]), 0);
  const of = (blunt, heard) => dis.filter(r => isBlunt(r) === blunt && r.heard === heard), agents = clusterMeans(of(true, true), towardOf, INSTANCE);
  F.blunt = { reactance: [round(rate(of(true, true), isReactant)), round(rate(of(true, false), isReactant))], totalVariation: [round(mean(of(true, true).map(tv))), round(mean(of(true, false).map(tv)))],
    agents: agents.length, agentRange: [round(Math.min(...agents), 0), round(Math.max(...agents), 0)], n: [of(true, true).length, of(true, false).length] };
  F.others = { reactance: [round(rate(of(false, true), isReactant)), round(rate(of(false, false), isReactant))], totalVariation: [round(mean(of(false, true).map(tv))), round(mean(of(false, false).map(tv)))] };
  console.log(`blunt receivers: reactance ${F.blunt.reactance[0]}% treatment, ${F.blunt.reactance[1]}% control; total variation ${F.blunt.totalVariation[0]} against ${F.blunt.totalVariation[1]} pp;`
    + ` ${F.blunt.agents} agents with mean influence from ${F.blunt.agentRange[0]} to ${F.blunt.agentRange[1]} pp`);
  console.log(`other receivers: reactance ${F.others.reactance[0]}% treatment, ${F.others.reactance[1]}% control; total variation ${F.others.totalVariation[0]} against ${F.others.totalVariation[1]} pp`); }
{ F.advocates = Object.fromEntries(PERSONAS.map(p => { const x = ALL.filter(r => r.speaker.personality === p); return [p, Object.fromEntries(ACTIONS.map(a => [a, round(rate(x, r => r.asks === a), 0)]))]; }));
  console.log('share of messages advocating "maintain position", by sender persona: ' + PERSONAS.map(p => `${p} ${F.advocates[p].work}%`).join(', '));
  const trt = ALL.filter(TRT), room = trt.map(r => towardOf(r) / (100 * (1 - r.alone[r.peerTop]))).filter(Number.isFinite);
  F.shareOfHeadroom = round(mean(room), 2); F.priorCorrelation = round(corr(trt.map(priorMax), trt.map(towardOf)), 2);
  console.log(`influence as a share of the available headroom: ${F.shareOfHeadroom}; correlation of prior certainty with influence: ${F.priorCorrelation}`); }

// ---- matrices for the heatmaps ---------------------------------------------------------------------------------------------
// Each cell: the mean of cluster means (influence, pp), the decisions and clusters behind it, the two runs separately, and
// the reactance and adoption rates over its decisions. Persona rows and columns are in the order of the report's Figure 1.
{ const ORDER = [...PERSONAS].sort((a, b) => pooled(`receiver ${b}: influence`) - pooled(`receiver ${a}: influence`));
  const trt = ALL.filter(TRT), ctl = ALL.filter(CTL), num = x => (Number.isFinite(x) ? +x.toFixed(2) : null);
  const cellOf = (rows, key) => {
    const by = run => { const x = rows.filter(r => r.run === run); return x.length ? num(mean(clusterMeans(x, towardOf, key))) : null; };
    return { m: rows.length ? num(mean(clusterMeans(rows, towardOf, key))) : null, n: rows.length, k: groups(rows, key).size, instances: groups(rows, r => `${r.run}.${key(r)}`).size,
      run1: by(1), run2: by(2), reactance: num(rate(rows, isReactant)), adoption: num(rate(rows, r => r.afterTop === r.peerTop)) };
  };
  const grid = (rows, cols, pick, key, from = trt) => rows.map(a => cols.map(b => cellOf(from.filter(r => pick(r, a, b)), key)));
  const margin = (keys, name) => keys.map(k => num(pooled(name(k))));
  const between = cells => +corr(cells.flat().map(c => c.run1 ?? NaN), cells.flat().map(c => c.run2 ?? NaN)).toFixed(2);
  const byRO = (r, p, g) => r.judge.personality === p && r.judge.goal === g, byOO = (r, s, g) => r.speaker.goal === s && r.judge.goal === g, byPP = (r, s, p) => r.speaker.personality === s && r.judge.personality === p;
  const A = grid(ORDER, OBJECTIVES, byRO, RECEIVER), control = grid(ORDER, OBJECTIVES, byRO, RECEIVER, ctl), B = grid(OBJECTIVES, OBJECTIVES, byOO, PAIR), C = grid(ORDER, ORDER, byPP, PAIR);
  const controlMeans = control.flat().filter(c => c.n >= 5).map(c => c.m), blunt = ORDER.indexOf('blunt');
  // which cells of the persona-by-persona panel are shown: enough decisions, enough sender-receiver pairs, and seen in both runs
  const shown = c => c.n >= 10 && c.k >= 3 && c.run1 !== null && c.run2 !== null;
  out.matrix = {
    personaObjective: { rows: ORDER, cols: OBJECTIVES, cells: A, control, rowMargin: margin(ORDER, p => `receiver ${p}: influence`), colMargin: margin(OBJECTIVES, g => `receiver objective ${g}: influence`),
      betweenRunR: between(A), controlRange: [Math.min(...controlMeans), Math.max(...controlMeans)],
      reactanceBlunt: num(rate(trt.filter(r => r.judge.personality === 'blunt'), isReactant)), reactanceOthers: num(rate(trt.filter(r => r.judge.personality !== 'blunt'), isReactant)),
      rowReactance: ORDER.map(p => num(rate(trt.filter(r => r.judge.personality === p), isReactant))), colReactance: OBJECTIVES.map(g => num(rate(trt.filter(r => r.judge.goal === g), isReactant))) },
    objectiveObjective: { rows: OBJECTIVES, cols: OBJECTIVES, cells: B, rowMargin: margin(OBJECTIVES, g => `sender objective ${g}: influence`), colMargin: margin(OBJECTIVES, g => `receiver objective ${g}: influence`), betweenRunR: between(B) },
    personaPersona: { rows: ORDER, cols: ORDER, cells: C.map(row => row.map(c => ({ ...c, shown: shown(c) }))), rowMargin: margin(ORDER, p => `sender ${p}: influence`), colMargin: margin(ORDER, p => `receiver ${p}: influence`),
      betweenRunR: between(C.map(row => row.map(c => (shown(c) ? c : {})))), rule: 'at least 10 decisions from at least 3 sender-receiver pairs, observed in both runs' },
  };
  void blunt;
  const show = (name, M, f) => { console.log(`-- ${name} (between-run r of cell means ${M.betweenRunR})`); console.log(' '.repeat(13) + M.cols.map(c => c.slice(0, 9).padStart(10)).join(''));
    M.rows.forEach((r, i) => console.log(r.padEnd(13) + M.cells[i].map(c => f(c).padStart(10)).join(''))); };
  const pp = c => (c.m === null ? '.' : `${c.m.toFixed(0)} (${c.n}/${c.k})`);
  console.log('\n== matrices: influence in pp (decisions / clusters)');
  show('receiver persona x receiver objective, treatment', out.matrix.personaObjective, pp);
  console.log(`   control cells with n >= 5: ${out.matrix.personaObjective.controlRange.map(x => x.toFixed(1)).join(' to ')} pp`);
  show('reactance rate (%), receiver persona x receiver objective, treatment', out.matrix.personaObjective, c => (c.reactance === null ? '.' : c.reactance.toFixed(0)));
  console.log(`   reactance over the blunt row ${out.matrix.personaObjective.reactanceBlunt}%, over the other rows ${out.matrix.personaObjective.reactanceOthers}%`);
  show('sender objective (rows) x receiver objective (columns), treatment', out.matrix.objectiveObjective, pp);
  show('sender persona (rows) x receiver persona (columns), treatment', out.matrix.personaPersona, c => (c.m === null ? '.' : `${c.shown ? '' : '~'}${c.m.toFixed(0)} (${c.n}/${c.k})`));
  const all = out.matrix.personaPersona.cells.flat().filter(c => c.n > 0);
  console.log(`   shown (${out.matrix.personaPersona.rule}): ${all.filter(c => c.shown).length} of 110 cells; cells marked ~ are left blank in the figure`); }

try { writeFileSync(new URL('./pooled.json', import.meta.url), JSON.stringify(out)); } catch (e) { console.error(`\nanalysis/pooled.json was not written: ${e.message}`); }
