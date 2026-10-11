import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCORED, rowsOf, mean, group, split, table } from '../bench/stats.mjs';

// A row told `goal` (or 'none') with the same score on every goal.
function woven(personality, goal, value) {
  const scores = { grow: value, give: value, hold: value, borrow: value };
  return result(personality, goal, scores, { grow: false, give: false, hold: false, borrow: false });
}

// A result as bench/core.mjs keeps it: a score and a met flag for each goal, and score/reached for the goal told.
function result(personality, goal, scores, met) {
  const told = goal !== 'none';
  return {
    seat: 0, name: 'Test', personality, goal, ground: 0, scores, met,
    score: told ? scores[goal] : null, reached: told ? met[goal] : null, did: {},
  };
}

// Rows for one match, from the results given.
function matchOf(id, results) {
  return rowsOf([{ id, results }]);
}

// A seeded stream of numbers between 0 and 1 (mulberry32), so the test is the same every run.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);
}

test('the score depends on the goal alone: all of the split is the goal', () => {
  const rows = [];
  for (const p of ['warm', 'blunt', 'calm']) {
    for (let i = 0; i < 3; i++) {
      rows.push(woven(p, 'grow', 80), woven(p, 'none', 20));
    }
  }
  const s = split(rows, 'grow');
  assertClose(s.goal, 1);
  assertClose(s.personality, 0);
  assertClose(s.both, 0);
  assertClose(s.rest, 0);
});

test('the score depends on the personality alone: all of the split is the personality', () => {
  const rows = [];
  for (const [p, value] of [['warm', 80], ['blunt', 20]]) {
    for (let i = 0; i < 3; i++) {
      rows.push(woven(p, 'grow', value), woven(p, 'none', value));
    }
  }
  const s = split(rows, 'grow');
  assertClose(s.goal, 0);
  assertClose(s.personality, 1);
  assertClose(s.both, 0);
  assertClose(s.rest, 0);
});

test('untold all score 50, told one personality 90 and another 10: half personality, half both', () => {
  const rows = [];
  for (let i = 0; i < 3; i++) {
    rows.push(woven('warm', 'none', 50), woven('blunt', 'none', 50));
    rows.push(woven('warm', 'grow', 90), woven('blunt', 'grow', 10));
  }
  const s = split(rows, 'grow');
  assertClose(s.goal, 0);
  assertClose(s.personality, 0.5);
  assertClose(s.both, 0.5);
  assertClose(s.rest, 0);
});

test('scores with no pattern: most of the split is everything else', () => {
  const rand = mulberry32(20261007);
  const people = ['warm', 'blunt', 'calm', 'anxious'];
  const rows = [];
  for (const p of people) {
    for (const goal of ['grow', 'none']) {
      for (let i = 0; i < 6; i++) rows.push(woven(p, goal, Math.floor(rand() * 100)));
    }
  }
  const s = split(rows, 'grow');
  assert.ok(s.rest > 0.8, `rest was ${s.rest}`);
  assertClose(s.goal + s.personality + s.both + s.rest, 1);
});

test('group and table on a small hand-made set', () => {
  const matches = [
    { id: 'm001', results: [
      result('warm', 'grow', { grow: 80, give: 10, hold: 90, borrow: 0 }, { grow: true, give: false, hold: true, borrow: false }),
      result('warm', 'none', { grow: 50, give: 40, hold: 60, borrow: 20 }, { grow: false, give: false, hold: false, borrow: false }),
      result('blunt', 'grow', { grow: 40, give: 60, hold: 30, borrow: 0 }, { grow: false, give: false, hold: false, borrow: false }),
      result('blunt', 'none', { grow: 20, give: 70, hold: 50, borrow: 10 }, { grow: false, give: true, hold: false, borrow: false }),
    ] },
    { id: 'm002', results: [
      result('warm', 'none', { grow: 30, give: 50, hold: 40, borrow: 60 }, { grow: true, give: false, hold: false, borrow: true }),
      result('blunt', 'none', { grow: 10, give: 0, hold: 20, borrow: 30 }, { grow: false, give: true, hold: false, borrow: false }),
    ] },
  ];
  const rows = rowsOf(matches);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].match, 'm001');
  assert.equal(rows[5].match, 'm002');

  const g = group(rows, 'grow');
  assert.equal(g.told.n, 2);
  assertClose(g.told.mean, 60);
  assert.equal(g.told.reached, 1);
  assertClose(g.told.rate, 0.5);
  assert.equal(g.untold.n, 4);
  assertClose(g.untold.mean, 27.5);
  assert.equal(g.untold.reached, 1);
  assertClose(g.untold.rate, 0.25);
  assertClose(g.lift, 32.5);

  // no weaver was told 'give': its told side is empty, so its mean and rate are NaN
  const gv = group(rows, 'give');
  assert.equal(gv.told.n, 0);
  assert.ok(Number.isNaN(gv.told.mean));
  assert.ok(Number.isNaN(gv.told.rate));
  assert.equal(gv.untold.n, 4);
  assertClose(gv.untold.mean, 40);
  assert.equal(gv.untold.reached, 2);
  assert.ok(Number.isNaN(gv.lift));

  const t = table(rows);
  assert.deepEqual(t.matches, ['m001', 'm002']);
  assert.equal(t.weavers, 6);
  assert.equal(t.overall.told.n, 2);
  assertClose(t.overall.told.mean, 60);
  assert.equal(t.overall.told.reached, 1);
  assertClose(t.overall.told.rate, 0.5);
  // four goals for each of the four untold rows: 16 values, summing to 560
  assert.equal(t.overall.untold.n, 4 * 4);
  assertClose(t.overall.untold.mean, 35);
  assert.equal(t.overall.untold.reached, 4);
  assertClose(t.overall.untold.rate, 0.25);
  assertClose(t.overall.lift, 25);

  assert.equal(t.goals.grow.told.n, 2);
  assertClose(t.goals.grow.lift, 32.5);
  assert.equal(t.goals.grow.by.warm.told.n, 1);
  assertClose(t.goals.grow.by.warm.told.mean, 80);
  assert.equal(t.goals.grow.by.warm.untold.n, 2);
  assertClose(t.goals.grow.by.warm.untold.mean, 40);
  assert.equal(t.goals.grow.by.warm.untold.reached, 1);
  assertClose(t.goals.grow.by.warm.lift, 40);
  assert.equal(t.goals.grow.by.blunt.told.reached, 0);
  assertClose(t.goals.grow.by.blunt.untold.mean, 15);
  assertClose(t.goals.grow.by.blunt.lift, 25);
  // give has no told rows, so no split and NaN lifts
  assert.equal(t.goals.give.split, null);
  assert.ok(Number.isNaN(t.goals.give.by.warm.told.mean));
  assert.ok(Number.isNaN(t.goals.give.by.warm.lift));
  assert.equal(t.goals.give.by.blunt.untold.reached, 2);
  assert.deepEqual(SCORED.map((x) => Object.keys(t.goals[x].by).length), [2, 2, 2, 2]);

  // personality lift: the mean of its finite lifts only (grow alone, since the others are NaN)
  assertClose(t.personalities.warm.lift, 40);
  assertClose(t.personalities.blunt.lift, 25);
  assert.equal(t.personalities.warm.told, 1);
  assert.equal(t.personalities.warm.reached, 1);
  assert.equal(t.personalities.blunt.told, 1);
  assert.equal(t.personalities.blunt.reached, 0);

  assert.ok(Number.isNaN(mean([])));
});

test('one personality only: there is no split', () => {
  const rows = [];
  for (let i = 0; i < 3; i++) rows.push(woven('warm', 'grow', 80), woven('warm', 'none', 20));
  rows.push(woven('blunt', 'grow', 70));
  assert.equal(split(rows, 'grow'), null);
  assert.equal(split(rows, 'give'), null);
});
