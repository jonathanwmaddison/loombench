// The overview's numbers (bench/overview.mjs), built from the runs kept in this repository: every part is there, it can
// be sent as JSON, and it agrees with the tables the other pages draw from the same records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { overviewFrom } from '../tools/keep.mjs';
import { ruleThreshold } from '../bench/overview.mjs';
import { rowsOf, table, mean } from '../bench/stats.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const overview = overviewFrom(ROOT);
const near = (a, b, by = 0.011) => assert.ok(Math.abs(a - b) <= by, `${a} is not within ${by} of ${b}`);

test('the overview has every part, and is plain JSON', async () => {
  const d = await overview;
  for (const part of ['benchmark', 'opening', 'blunt', 'threshold', 'systems', 'switches', 'peers']) assert.ok(d[part], `no ${part}`);
  assert.ok(d.sweeps.length >= 2 && d.steps.length >= 2);
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d, 'a value that JSON cannot carry (NaN, undefined)');
});

test('the benchmark\'s figures are the Results page\'s', async () => {
  const d = await overview, index = JSON.parse(await readFile(`${ROOT}runs/${d.benchmark.run}/index.json`, 'utf8')), t = table(rowsOf(index.matches));
  assert.equal(d.benchmark.withObjective.attained, t.overall.told.reached);
  assert.equal(d.benchmark.withObjective.n, t.overall.told.n);
  assert.equal(d.benchmark.baseline.attained, t.overall.untold.reached);
  for (const o of d.benchmark.objectives) {
    near(o.score, t.goals[o.key].told.mean);
    assert.ok(o.split, `no split for ${o.key}`);
    near(o.split.objective + o.split.persona + o.split.both + o.split.residual, 100, 0.3);
  }
});

test('a replayed match is whole: every round divides the loom, and the last round is the result', async () => {
  const d = await overview;
  for (const timeline of [d.opening, d.blunt.before, d.blunt.after, d.threshold.pictured.rules, d.threshold.pictured.raised]) {
    assert.equal(timeline.rounds.length, 26);
    for (const round of timeline.rounds) near(round.reduce((sum, s) => sum + s.wide, 0), 100);
    for (const seat of timeline.seats) near(timeline.shares.at(-1)[seat.seat], seat.share, 0.06);
  }
  const sampled = d.opening.decision.options.filter(o => o.sampled);
  assert.equal(sampled.length, 1);
  assert.equal(sampled[0].act, 'claim');
  near(d.opening.decision.options.reduce((sum, o) => sum + o.p, 0), 100, 1.5);
});

test('the step from none to one is paired by match number', async () => {
  const d = await overview;
  for (const step of [d.blunt, ...d.steps]) {
    near(step.focal.change.mean, mean(step.pairs.map(p => p.focal[1] - p.focal[0])));
    near(step.others.change.mean, mean(step.pairs.map(p => p.others[1] - p.others[0])), 0.02);
    assert.ok(step.focal.change.lo <= step.focal.change.mean && step.focal.change.mean <= step.focal.change.hi);
  }
});

test('the claim threshold: the rule by group size, and both runs of each match number', async () => {
  assert.deepEqual([5, 4, 3, 2].map(n => Math.round(ruleThreshold(n) * 10) / 10), [46, 46, 53.3, 70]);
  const d = await overview, t = d.threshold;
  assert.ok(t.raised > t.rules);
  for (const c of t.contrasts) {
    near(c.rules.mean, mean(c.seeds.map(p => p.rules)));
    near(c.raised.mean, mean(c.seeds.map(p => p.raised)));
    near(c.difference.mean, c.raised.mean - c.rules.mean, 0.02);
  }
  assert.ok(t.contrasts.find(c => c.size === 5).seeds.some(p => p.seed === t.pictured.seed));
});

test('attainment under each switch counts the agents given an objective on the same match designs', async () => {
  const { switches } = await overview;
  for (const system of switches.systems) {
    assert.ok(system.objectiveOff && system.objectiveOff.claims >= 0, `no objectiveOff for ${system.name}`);
    for (const cell of system.cells) {
      assert.equal(cell.n, 4 * switches.designs, `${system.name}, ${cell.name}`);
      near(cell.rate, 100 * cell.attained / cell.n);
      assert.equal(cell.difference === null, cell.key === 'default');
      for (const g of ['grow', 'give', 'hold', 'borrow']) {
        assert.equal(cell.scores[g].n, switches.designs, `${system.name}, ${cell.name}, ${g}`);
      }
      assert.equal(
        ['grow', 'give', 'hold', 'borrow'].reduce((s, g) => s + cell.scores[g].attained, 0),
        cell.attained,
        `${system.name}, ${cell.name} per-objective attained sum`
      );
    }
  }
});

test('peer communication: the two arms are the discordant decisions, and the control did not move', async () => {
  const { peers } = await overview;
  assert.equal(peers.treatment.n + peers.control.n, peers.discordant);
  assert.equal(peers.histogram.treatment.reduce((a, b) => a + b, 0), peers.treatment.n);
  assert.equal(peers.histogram.control.reduce((a, b) => a + b, 0), peers.control.n);
  assert.ok(Math.abs(peers.control.influence.mean) < 1 && peers.effect.lo > 0);
  assert.equal(peers.example.options.filter(o => o.advocated).length, 1);
});
