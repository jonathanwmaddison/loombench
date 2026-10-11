/** `node --test`: the bench core. The deal, the cast, the plain game played by chance, the scores, and the kept record. No network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAVERS, TYPES, american, typed, said } from '../engine/weavers.mjs';
import { jevAsker } from '../engine/jev.mjs';
import { rng } from '../engine/rng.mjs';
import {
  PERSONALITIES, GOALS, SCORED, deal, castOf, sentenceOf, play, scoresOf, recordOf, summaryOf, replay, personality, goal,
} from '../bench/core.mjs';

/** A stub mind: valid answers in Jev's own shape, decided by a hash of what was asked, so the same question gets the same answer. */
const stub = async body => ({ answers: Object.fromEntries(Object.entries(body.questions).map(([k, q]) => {
  const r = rng(k, q.instructions, JSON.stringify(q.criteria));
  if (q.type === 'score') return [k, { type: 'score', score: r() * (q.criteria.length - 1), confidence: 0.5 }];
  const keys = Object.keys(q.criteria), w = keys.map(() => r() ** 3 + 0.01), sum = w.reduce((a, b) => a + b, 0);
  const p = w.map(x => Math.round(1e6 * x / sum) / 1e6);
  const top = p.indexOf(Math.max(...p)); p[top] += 1 - p.reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(keys.map((key, i) => [key, p[i]]));
  return [k, { type: 'choice', choice: keys[top], confidence: p[top], probabilities }];
})) });
const same = (a, b) => Buffer.from(a.cloth.dye).equals(Buffer.from(b.cloth.dye));
const BASE = american(WEAVERS.slice(0, 5));

/** A rug as far as the scores read it: the shares, each seat's design after each round, and the moves each weaver made. */
function handRug(shares, history = [], yarns = [null, null, null, null, null]) {
  return {
    history: [{ kind: 'border', shares: [0, 0, 0, 0, 0], yarns }, ...history, { kind: 'passage', shares, yarns }],
    stats: { weavers: shares.map(() => ({ moves: {} })) },
  };
}

test('the names, the personalities and the goals are in the order and the texts the plan gives', () => {
  const keys = ['plain', 'outgoing', 'reserved', 'warm', 'blunt', 'organised', 'careless', 'anxious', 'calm', 'curious', 'conventional'];
  assert.deepEqual(PERSONALITIES.map(p => p.key), keys);
  assert.equal(personality('plain').name, 'No persona');
  assert.equal(personality('warm').name, 'Warm');
  assert.equal(personality('plain').text, null);
  assert.deepEqual(GOALS.map(g => g.key), ['none', 'grow', 'give', 'hold', 'borrow']);
  assert.deepEqual(SCORED, ['grow', 'give', 'hold', 'borrow']);
  assert.equal(goal('none').text, null);
  assert.equal(goal('grow').text, '{N} has one goal for this rug: to finish it holding more ground than any other weaver.');
  assert.throws(() => personality('nobody'));
  assert.throws(() => goal('nothing'));
});

test('every match has five different goals and five different personalities', () => {
  for (let m = 1; m <= 55; m++) {
    const seats = deal(m);
    assert.equal(seats.length, 5);
    assert.equal(new Set(seats.map(s => s.goal)).size, 5, `goals in match ${m}`);
    assert.equal(new Set(seats.map(s => s.personality)).size, 5, `personalities in match ${m}`);
    for (const s of seats) { personality(s.personality); goal(s.goal); }
  }
});

test('over 11 matches each personality holds each goal exactly once, in each round of the deal', () => {
  for (const [from, to] of [[1, 11], [12, 22]]) {
    const seen = new Map();
    for (let m = from; m <= to; m++) {
      for (const s of deal(m)) { const k = `${s.personality}/${s.goal}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
    }
    assert.equal(seen.size, 55, `every personality with every goal in matches ${from}-${to}`);
    assert.ok([...seen.values()].every(n => n === 1), `each once in matches ${from}-${to}`);
  }
});

test('over 55 matches every seat has held every goal 11 times', () => {
  const held = Array.from({ length: 5 }, () => new Map());
  for (let m = 1; m <= 55; m++) deal(m).forEach((s, i) => held[i].set(s.goal, (held[i].get(s.goal) ?? 0) + 1));
  for (const h of held) for (const g of GOALS) assert.equal(h.get(g.key), 11, `${g.key}`);
});

test('the cast: personality sentence, then goal sentence, then "Choose as"; neither for plain and none; temperature 0.7', () => {
  const seats = [
    { personality: 'warm', goal: 'grow' }, { personality: 'blunt', goal: 'none' }, { personality: 'plain', goal: 'borrow' },
    { personality: 'plain', goal: 'none' }, { personality: 'curious', goal: 'hold' },
  ];
  const cast = castOf(seats);
  const who = cast[0].who, p = sentenceOf(0, 'warm', 'personality'), g = sentenceOf(0, 'grow', 'goal');
  assert.ok(p && g && !p.includes('{') && !g.includes('{'), 'both sentences are filled in');
  assert.ok(who.indexOf(p) >= 0 && who.indexOf(p) < who.indexOf(g), 'personality before goal');
  assert.ok(who.indexOf(g) < who.indexOf(' Choose as'), 'goal before Choose as');
  assert.equal(who, typed(BASE[0], 'warm').who.replace(' Choose as', ` ${g} Choose as`));

  assert.equal(cast[1].who, typed(BASE[1], 'blunt').who, 'no goal sentence for none');
  assert.ok(!cast[1].who.includes('has one goal'));
  assert.equal(cast[2].who, typed(BASE[2], 'plain').who.replace(' Choose as', ` ${sentenceOf(2, 'borrow', 'goal')} Choose as`));
  assert.equal(cast[3].who, typed(BASE[3], 'plain').who, 'neither for plain and none');
  assert.ok(cast.every(c => c.temperature === 0.7));
  assert.equal(castOf(seats).length, 5);
});

test('sentences are said as the seat is: its own name and pronouns, and none for plain or none', () => {
  assert.equal(sentenceOf(0, 'plain', 'personality'), '');
  assert.equal(sentenceOf(0, 'none', 'goal'), '');
  const g = sentenceOf(0, 'hold', 'goal');
  assert.ok(g.startsWith(`${BASE[0].name} has one goal`), g);
  assert.ok(g.includes(`${BASE[0].she ? 'she' : 'he'} started`), g);
  assert.equal(sentenceOf(0, 'warm', 'personality'), said(BASE[0], TYPES.find(t => t.key === 'warm').text));
});

test('a match played by chance has 28 history entries, no step-back, and five scored weavers', async () => {
  const rug = await play({ seats: deal(1), seed: 1 });
  assert.equal(rug.history.length, 28);
  assert.deepEqual(rug.loom.stepBacks, []);
  assert.equal(rug.minds, 'chance');
  assert.equal(rug.stats.calls.jev, 0);
  assert.equal(rug.weavers.length, 5);
});

test('the grow scores sum to 250 over the five, and give is 100 minus grow', async () => {
  for (const m of [1, 2, 3]) {
    const scores = scoresOf(await play({ seats: deal(m), seed: m }));
    assert.equal(scores.reduce((sum, s) => sum + s.scores.grow, 0), 250);
    for (const s of scores) assert.equal(s.scores.give, 100 - s.scores.grow);
  }
});

test('hold is 100 at an exact fifth of the loom and 0 at none of it or at twice it', () => {
  const fifth = scoresOf(handRug([0.2, 0.2, 0.2, 0.2, 0.2]));
  assert.ok(fifth.every(s => s.scores.hold === 100 && s.met.hold && s.ground === 20));
  const none = scoresOf(handRug([0, 0.25, 0.25, 0.25, 0.25]));
  assert.equal(none[0].scores.hold, 0);
  assert.equal(none[0].met.hold, false);
  assert.equal(none[1].scores.hold, 75);
  const twice = scoresOf(handRug([0.4, 0.15, 0.15, 0.15, 0.15]));
  assert.equal(twice[0].scores.hold, 0);
});

test('grow is a place among the five, with ties split; met grow only when strictly most', () => {
  const tied = scoresOf(handRug([0.2, 0.2, 0.2, 0.2, 0.2]));
  assert.ok(tied.every(s => s.scores.grow === 50 && s.met.grow === false));
  const place = scoresOf(handRug([0, 0.25, 0.25, 0.25, 0.25]));
  assert.equal(place[0].scores.grow, 0);
  assert.equal(place[1].scores.grow, 62.5);
  assert.equal(place[1].met.grow, false);
  const most = scoresOf(handRug([0.1, 0.1, 0.1, 0.1, 0.6]));
  assert.equal(most[4].scores.grow, 100);
  assert.equal(most[4].met.grow, true);
  assert.equal(most[4].scores.give, 0);
  assert.equal(most[0].met.give, false);
});

test('borrow is the share of rounds, not counting the borders, in which a neighbour\'s idea is in the seat\'s design', () => {
  const borrowed = { a: 0, aBy: 1, strands: [] }, own = { a: 0, aBy: 0, strands: [{ fill: 'bands', dye: 1, s: 0, by: 0, dyeBy: 0 }] };
  const rug = {
    history: [
      { kind: 'border', shares: [0, 0, 0, 0, 0], yarns: [borrowed, null, null, null, null] },
      { kind: 'passage', shares: [0.2, 0.2, 0.2, 0.2, 0.2], yarns: [borrowed, null, null, null, null] },
      { kind: 'passage', shares: [0.2, 0.2, 0.2, 0.2, 0.2], yarns: [own, null, null, null, null] },
      { kind: 'border', shares: [0.2, 0.2, 0.2, 0.2, 0.2], yarns: [borrowed, null, null, null, null] },
    ],
    stats: { weavers: [0, 1, 2, 3, 4].map(() => ({ moves: {} })) },
  };
  const s = scoresOf(rug);
  assert.equal(s[0].scores.borrow, 50);
  assert.equal(s[0].met.borrow, true);
  assert.equal(s[1].scores.borrow, 0);
  assert.equal(s[1].met.borrow, false);
});

test('a record survives JSON, its summary leaves out the tape and loom, and replay by chance gives the same cloth', async () => {
  const seats = deal(4), rug = await play({ seats, seed: 4 });
  const record = JSON.parse(JSON.stringify(recordOf(rug, { id: 'm004', match: 4, seats })));
  assert.equal(record.loombench, 1);
  assert.equal(record.results.length, 5);
  assert.ok(record.results.every((r, i) => r.seat === i && r.personality === seats[i].personality && r.goal === seats[i].goal));
  for (const r of record.results) {
    assert.equal(r.score, r.goal === 'none' ? null : r.scores[r.goal]);
    assert.equal(r.reached, r.goal === 'none' ? null : r.met[r.goal]);
  }
  const summary = summaryOf(record);
  assert.ok(!('tape' in summary) && !('loom' in summary) && summary.id === 'm004');
  const again = await replay(record);
  assert.ok(same(rug, again), 'the same cloth');
  assert.equal(again.name, rug.name);
});

test('a record played with a stub mind replays from its tape to the same cloth', async () => {
  const seats = deal(7), rug = await play({ seats, seed: 7, ask: jevAsker(stub, { budget: 1e6 }) });
  assert.equal(rug.minds, 'jev');
  assert.ok(rug.stats.calls.jev > 100);
  const record = JSON.parse(JSON.stringify(recordOf(rug, { id: 'm007', match: 7, seats })));
  const again = await replay(record);
  assert.ok(again.replayed);
  assert.ok(same(rug, again), 'the same cloth');
});
