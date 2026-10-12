// The match-level comparisons of the report's Section 3.7: `node analysis/outcomes.mjs`. No key or network needed.
// Prints the tables and writes analysis/outcomes.json, which analysis/report.py reads.
//
// In each ruleset the same 22 match designs (assignment and seed) were executed without communication, without
// communication a second time (the replicate), and with peer communication. Differences are paired by match design;
// intervals are over matches (mean of paired differences, Student-t 95%).
//
// Two comparisons are printed side by side for every outcome:
//   peer - main        peer communication minus no communication
//   replicate - main   a second no-communication execution minus the first: nothing differs, so this shows how large
//                      a paired difference arises with no treatment at all
import { readFileSync, writeFileSync } from 'node:fs';
import { apart } from '../bench/peers.mjs';
import { mean } from '../bench/stats.mjs';

const RULESETS = [
  { name: 'Run 1 (first rules)', key: 'run1', main: 'runs/chosen-main', replicate: 'runs/chosen-replicate', peers: 'runs/chosen-peers' },
  { name: 'Run 2 (rules 2)', key: 'run2', main: 'runs/main', replicate: 'runs/replicate', peers: 'runs/peers' },
];
const index = path => JSON.parse(readFileSync(new URL(`../${path}/index.json`, import.meta.url), 'utf8')).matches;
const byMatch = path => Object.fromEntries(index(path).filter(m => m.match <= 22).map(m => [m.match, m]));

const T = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093,
  2.086, 2.08, 2.074, 2.069, 2.064, 2.06];
const sd = xs => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1));
const ci = xs => { const k = xs.length, h = T[k - 1] * sd(xs) / Math.sqrt(k); return { m: mean(xs), lo: mean(xs) - h, hi: mean(xs) + h, k }; };
const show = c => `${c.m >= 0 ? '+' : '−'}${Math.abs(c.m).toFixed(1)} [${c.lo.toFixed(1)}, ${c.hi.toFixed(1)}] k=${c.k}`;
const paired = (X, Y, f) => ci(Object.keys(X).filter(k => Y[k]).map(k => f(X[k]) - f(Y[k])));

const did = key => m => mean(m.results.map(r => r.did[key]));
const of = (objective, f) => m => f(m.results.find(r => r.goal === objective));
const attainment = m => 100 * mean(m.results.filter(r => r.goal !== 'none').map(r => (r.reached ? 1 : 0)));
const OUTCOMES = [
  ['concessions', 'concessions per agent', did('gave')], ['claims', 'claims per agent', did('took')], ['refusals', 'refusals per agent', did('refused')],
  ['overrides', 'overrides per agent', did('insisted')], ['withdrawals', 'withdrawals per agent', did('backedDown')], ['eliminations', 'eliminations per agent', did('pushedOut')],
  ['adoptions', 'design adoptions per agent', did('borrowed')], ['attainment', 'attainment rate (%)', attainment],
  ...['grow', 'give', 'hold', 'borrow'].map(g => [`score.${g}`, `objective score, ${g}`, of(g, r => r.score)]),
  ...['none', 'grow', 'give', 'hold', 'borrow'].map(g => [`share.${g}`, `final share (%), objective ${g}`, of(g, r => r.ground)]),
];

const out = {};
for (const set of RULESETS) {
  const MAIN = byMatch(set.main), REPLICATE = byMatch(set.replicate), PEERS = byMatch(set.peers), o = out[set.key] = { matches: {}, outcomes: {} };
  o.matches = { main: Object.keys(MAIN).length, replicate: Object.keys(REPLICATE).length, peers: Object.keys(PEERS).length };
  console.log(`== ${set.name}: main ${o.matches.main} matches, replicate ${o.matches.replicate}, peers ${o.matches.peers}`);
  console.log(`${'outcome (mean per match)'.padEnd(34)}${'main'.padStart(7)}${'replic.'.padStart(8)}${'peers'.padStart(7)}   ${'peer - main'.padEnd(30)}replicate - main`);
  for (const [key, name, f] of OUTCOMES) {
    const level = X => mean(Object.values(X).map(f)), peer = paired(PEERS, MAIN, f), placebo = paired(REPLICATE, MAIN, f);
    o.outcomes[key] = { main: level(MAIN), replicate: level(REPLICATE), peers: level(PEERS), peer, placebo };
    console.log(`${name.padEnd(34)}${level(MAIN).toFixed(2).padStart(7)}${level(REPLICATE).toFixed(2).padStart(8)}${level(PEERS).toFixed(2).padStart(7)}   ${show(peer).padEnd(30)}${show(placebo)}`);
  }
  // Divergence: mean absolute difference in final share per agent between two executions of the same match (pp).
  const divergence = (X, Y, keys = Object.keys(X).filter(k => Y[k])) => keys.map(k => apart(X[k], Y[k]));
  const both = Object.keys(REPLICATE).filter(k => PEERS[k] && MAIN[k]);
  const dPeer = divergence(PEERS, MAIN, both), dReplicate = divergence(REPLICATE, MAIN, both);
  o.divergence = { peer: ci(divergence(PEERS, MAIN)), placebo: ci(divergence(REPLICATE, MAIN)), difference: ci(dPeer.map((x, i) => x - dReplicate[i])) };
  console.log(`divergence, peers against main:      ${show(o.divergence.peer)} pp per agent`);
  console.log(`divergence, replicate against main:  ${show(o.divergence.placebo)} pp per agent`);
  console.log(`paired difference on the ${both.length} matches in all three: ${show(o.divergence.difference)}`);
  const agree = both.flatMap(k => MAIN[k].results.filter(r => r.goal !== 'none').map(r => (r.reached === REPLICATE[k].results[r.seat].reached ? 1 : 0)));
  o.attainmentAgrees = [agree.filter(Boolean).length, agree.length];
  console.log(`attainment agrees between main and replicate for ${o.attainmentAgrees[0]} of ${o.attainmentAgrees[1]} agents with an objective\n`);
}
try { writeFileSync(new URL('./outcomes.json', import.meta.url), JSON.stringify(out)); } catch (e) { console.error(`analysis/outcomes.json was not written: ${e.message}`); }
