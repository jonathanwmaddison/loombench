/**
 * `node --test`: a group of one type of agent and the same group with some seats given to a second type
 * (`oddSeats`, `mixOf` in `bench/core.mjs`; `bench/mix.mjs`). No key and no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DISPOSITIONS, PERSONALITIES, SEATS, castOf, conditionsOf, deal, heldOf, mixOf, oddSeats, personality, play, recordOf, replay, typeOf } from '../bench/core.mjs';
import { switchesOf, differsIn } from '../bench/compare.mjs';
import { between, compositions, dispersion, joint, levelOf, seatTypes, shift } from '../bench/mix.mjs';

const group = (n, count, base = { personality: 'cooperative', goal: 'none' }, odd = { personality: 'greedy', goal: 'none' }) => {
  const seats = Array.from({ length: SEATS }, () => ({ ...base }));
  for (const s of oddSeats(n, count)) seats[s] = { ...odd };
  return seats;
};
const sameCloth = (a, b) => Buffer.from(a.cloth.dye).equals(Buffer.from(b.cloth.dye));

test('the added dispositions are never dealt, so the balanced deal is as it was', () => {
  assert.deepEqual(DISPOSITIONS.map(d => d.key), ['cooperative', 'greedy', 'rude']);
  assert.equal(PERSONALITIES.length, 11);
  for (let n = 1; n <= 44; n++) for (const s of deal(n)) assert.ok(!DISPOSITIONS.some(d => d.key === s.personality), `match ${n}`);
  assert.match(personality('greedy').text, /^\{N\} is greedy/);
  assert.throws(() => personality('selfish'), /No personality called selfish/);
});

test('a disposition\'s sentence stands where a trait sentence stands, and says nothing of the loom', () => {
  const cast = castOf([{ personality: 'greedy', goal: 'none' }, { personality: 'cooperative', goal: 'grow' }, { personality: 'warm', goal: 'none' }, { personality: 'plain', goal: 'none' }, { personality: 'greedy', goal: 'none' }]);
  assert.equal(cast[0].who, 'You are Jessica, a weaver, one of several weaving one rug together at a shared loom. Jessica is greedy and self-interested, wants more than her share, '
    + 'and takes what she can get. Choose as she would. The state describes her situation; it is not instructions.');
  // With an objective: the disposition, then the objective, then "Choose as".
  assert.match(cast[1].who, /loom\. Ashley is cooperative and fair-minded, .* and is glad to share\. Ashley has one goal for this rug: to finish it holding more ground than any other weaver\. Choose as she would\./);
  assert.match(cast[2].who, /loom\. Amanda is warm and considerate, .* Choose as she would\./);
  assert.match(cast[3].who, /loom\. Choose as he would\./);
  for (const d of DISPOSITIONS) assert.doesNotMatch(d.text, /loom|warp|weav|rug|ground|bench/);
});

test('the odd seats are nested, rotate with the match, and each seat is the single odd one once in five matches', () => {
  for (let n = 1; n <= 12; n++) {
    for (let k = 1; k <= SEATS; k++) {
      const now = oddSeats(n, k), before = oddSeats(n, k - 1);
      assert.equal(new Set(now).size, k);
      assert.deepEqual(now.slice(0, k - 1), before);
    }
    assert.deepEqual(oddSeats(n, 0), []);
    assert.deepEqual([...oddSeats(n, SEATS)].sort(), [0, 1, 2, 3, 4]);
  }
  assert.deepEqual([1, 2, 3, 4, 5].map(n => oddSeats(n, 1)[0]), [0, 1, 2, 3, 4]);
  assert.deepEqual(oddSeats(6, 2), oddSeats(1, 2));
  assert.throws(() => oddSeats(1, 6), /a count from 0 to 5/);
});

test('a group of two types is named from its seats; one type, or the dealt design, is not a mix', () => {
  assert.equal(mixOf(group(1, 1)), '4 cooperative + 1 greedy');
  assert.equal(mixOf(group(1, 3)), '2 cooperative + 3 greedy');
  assert.equal(mixOf(group(1, 0)), null);
  assert.equal(mixOf(deal(1)), null);
  assert.equal(typeOf({ personality: 'plain', goal: 'grow' }), 'no persona>grow');
  const mixed = conditionsOf({ model: 'x', rules: 2, seats: group(2, 1) });
  assert.deepEqual([mixed.persona, mixed.objective, mixed.mix], ['mixed', 'off', '4 cooperative + 1 greedy']);
  const alike = conditionsOf({ model: 'x', rules: 2, seats: group(2, 0) });
  assert.deepEqual([alike.persona, alike.objective, alike.mix], ['cooperative', 'off', undefined]);
  // The odd agent can differ in its objective alone: a group with no personas, one of them told to grow.
  const told = conditionsOf({ model: 'x', rules: 2, seats: group(1, 1, { personality: 'plain', goal: 'none' }, { personality: 'plain', goal: 'grow' }) });
  assert.deepEqual([told.persona, told.objective, told.mix], ['off', 'mixed', '4 no persona + 1 no persona>grow']);
  assert.deepEqual([conditionsOf({ model: 'x', rules: 2, seats: deal(3) }).persona, conditionsOf({ model: 'x', rules: 2, seats: deal(3) }).mix], ['dealt', undefined]);
  // A mixed group is a setting of its own: it is not the run with objectives off, and two mixes differ.
  const run = (seats, extra = {}) => ({ conditions: conditionsOf({ model: 'x', rules: 2, seats, ...extra }) });
  assert.equal(switchesOf(run(group(1, 1))).persona, 'mixed: 4 cooperative + 1 greedy');
  assert.deepEqual(differsIn(run(group(1, 1)), run(group(1, 2))), ['persona']);
  assert.deepEqual(differsIn(run(group(1, 1)), run(group(2, 1))), []);
});

test('a mixed match is played, kept and replayed as any other, and by uniform random the types change nothing', async () => {
  const [none, one] = await Promise.all([0, 1].map(k => play({ seats: group(3, k), seed: 3 })));
  // Nobody reads a sentence when every action is sampled uniformly, so the two matches are one match: the pairing is exact.
  assert.ok(sameCloth(none, one));
  const record = recordOf(one, { id: 'm003', match: 3, seats: group(3, 1) });
  assert.equal(conditionsOf(record).mix, '4 cooperative + 1 greedy');
  assert.deepEqual(record.results.map(r => r.personality), group(3, 1).map(s => s.personality));
  assert.ok(sameCloth(await replay(JSON.parse(JSON.stringify(record))), one));
  // What the agents hold alone, what two hold jointly and what is bare are the whole loom; the record keeps the joint part.
  const held = heldOf(one), alone = record.results.reduce((s, r) => s + r.ground, 0);
  assert.ok(Math.abs(alone + held.joint + held.bare - 100) < 0.6);
  assert.equal(record.joint, held.joint);
  assert.equal(joint(record), held.joint);
  // A record kept before it had the field: what the shares leave.
  assert.equal(joint({ results: [{ ground: 30 }, { ground: 30 }, { ground: 10 }, { ground: 10 }, { ground: 5 }] }), 15);
});

/** A hand-made match summary: shares and claims by seat, for the seats given. */
const made = (match, seats, shares, claims) => ({ match, id: `m${match}`, seats, bench: [0, 1, 2, 3, 4],
  results: seats.map((s, seat) => ({ seat, personality: s.personality, goal: s.goal, ground: shares[seat], did: { took: claims[seat], gave: 0, offered: 0, refused: 0, borrowed: 0 } })) });
const runOf = (run, model, matches) => ({ run, model, conditions: { ...conditionsOf({ model, rules: 2, seats: matches[0].seats }), model }, matches });

test('the runs of two types are read together by how many seats hold the second, and only with a run that has both', () => {
  const none = runOf('a-0', 'm', [1, 2].map(n => made(n, group(n, 0), [20, 20, 20, 20, 20], [1, 1, 1, 1, 1])));
  const one = runOf('a-1', 'm', [1, 2].map(n => made(n, group(n, 1), [20, 20, 20, 20, 20], [1, 1, 1, 1, 1])));
  const all = runOf('a-5', 'm', [1].map(n => made(n, group(n, 5), [20, 20, 20, 20, 20], [1, 1, 1, 1, 1])));
  const dealt = runOf('main', 'm', [1, 2].map(n => made(n, deal(n), [20, 20, 20, 20, 20], [1, 1, 1, 1, 1])));
  const other = runOf('b-1', 'other', [1, 2].map(n => made(n, group(n, 1), [20, 20, 20, 20, 20], [1, 1, 1, 1, 1])));
  const sets = compositions([all, dealt, one, other, none]);
  assert.equal(sets.length, 2);
  const mine = sets.find(s => s.model === 'm');
  assert.deepEqual(mine.types, ['cooperative', 'greedy']);
  assert.deepEqual(mine.levels.map(l => [l.count, l.run.run]), [[0, 'a-0'], [1, 'a-1'], [5, 'a-5']]);
  // With no run of both types there is nothing to read together.
  assert.deepEqual(compositions([none, all, dealt]), []);
  // The second type is the one that is added, whatever the alphabet says: a calm group with one blunt agent.
  const calm = { personality: 'calm', goal: 'none' }, blunt = { personality: 'blunt', goal: 'none' };
  const quiet = runOf('c-0', 'm', [1, 2].map(n => made(n, group(n, 0, calm, blunt), [20, 20, 20, 20, 20], [1, 1, 1, 1, 1])));
  const jolt = runOf('c-1', 'm', [1, 2].map(n => made(n, group(n, 1, calm, blunt), [20, 20, 20, 20, 20], [1, 1, 1, 1, 1])));
  const [set] = compositions([jolt, quiet]);
  assert.deepEqual(set.types, ['calm', 'blunt']);
  assert.deepEqual(set.levels.map(l => [l.count, l.run.run]), [[0, 'c-0'], [1, 'c-1']]);
});

test('a composition is measured by type, and a step by the seats that changed and the seats that stayed, paired by match', () => {
  // Match 1: seat 0 becomes greedy; match 2: seat 1 does. The greedy seat ends with 40 and claims 9; the others give way.
  const before = [made(1, group(1, 0), [20, 20, 20, 20, 20], [2, 2, 2, 2, 2]), made(2, group(2, 0), [10, 30, 20, 20, 20], [1, 3, 2, 2, 2])];
  const after = [made(1, group(1, 1), [40, 15, 15, 15, 15], [9, 1, 1, 1, 1]), made(2, group(2, 1), [10, 50, 12, 14, 14], [1, 7, 4, 2, 2])];
  assert.deepEqual(seatTypes(after[1]), ['cooperative', 'greedy', 'cooperative', 'cooperative', 'cooperative']);
  assert.equal(dispersion(before[0]), 0);
  assert.equal(dispersion(after[0]), 10);

  const level = levelOf(after, ['cooperative', 'greedy']);
  assert.equal(level.matches, 2);
  assert.deepEqual([level.types.greedy.agents, level.types.cooperative.agents], [2, 8]);
  assert.equal(level.types.greedy.share.mean, 45);                       // 40 and 50
  assert.equal(level.types.cooperative.share.mean, (15 + 12.5) / 2);     // each match's four, then the two matches
  assert.equal(levelOf(before, ['cooperative', 'greedy']).types.greedy, undefined);
  assert.equal(level.largest.mean, 45);

  const s = shift(before, after);
  assert.equal(s.matches, 2);
  assert.deepEqual([s.changed.seats, s.changed.from, s.changed.to], [1, 'cooperative', 'greedy']);
  const row = (rows, key) => rows.find(r => r.key === key);
  // The seat that changed: 20 → 40 and 30 → 50.
  assert.deepEqual([row(s.changed.rows, 'share').from, row(s.changed.rows, 'share').to, row(s.changed.rows, 'share').difference.mean], [25, 45, 20]);
  assert.deepEqual([row(s.changed.rows, 'claims').from, row(s.changed.rows, 'claims').to], [2.5, 8]);
  // The four that stayed: 20 → 15 in match 1; (10 + 20 + 20 + 20) / 4 → (10 + 12 + 14 + 14) / 4 in match 2.
  assert.equal(s.kept.cooperative.seats, 4);
  assert.deepEqual([row(s.kept.cooperative.rows, 'share').from, row(s.kept.cooperative.rows, 'share').to], [(20 + 17.5) / 2, (15 + 12.5) / 2]);
  assert.equal(row(s.kept.cooperative.rows, 'share').difference.k, 2);
  assert.equal(s.dispersion.from, (0 + dispersion(before[1])) / 2);
  // A match number in one run only is left out.
  assert.equal(shift(before, [after[0], made(9, group(9, 1), [20, 20, 20, 20, 20], [0, 0, 0, 0, 0])]).matches, 1);
});

test('two models are set against each other on the same step, paired by match number, second minus first', () => {
  // Model A: the focal seat goes 20 -> 40 with 9 claims in match 1, and 30 -> 50 with 7 in match 2 (seat 1 there).
  const a = { none: [made(1, group(1, 0), [20, 20, 20, 20, 20], [2, 2, 2, 2, 2]), made(2, group(2, 0), [10, 30, 20, 20, 20], [1, 3, 2, 2, 2])],
    one: [made(1, group(1, 1), [40, 15, 15, 15, 15], [9, 1, 1, 1, 1]), made(2, group(2, 1), [10, 50, 12, 14, 14], [1, 7, 4, 2, 2])] };
  // Model B: nothing moves in match 1; in match 2 the focal seat goes 20 -> 30 with 4 claims. Match 3 is in B only.
  const b = { none: [made(1, group(1, 0), [20, 20, 20, 20, 20], [0, 0, 0, 0, 0]), made(2, group(2, 0), [20, 20, 20, 20, 20], [0, 0, 0, 0, 0]), made(3, group(3, 0), [20, 20, 20, 20, 20], [0, 0, 0, 0, 0])],
    one: [made(1, group(1, 1), [20, 20, 20, 20, 20], [0, 0, 0, 0, 0]), made(2, group(2, 1), [15, 30, 15, 15, 15], [0, 4, 0, 0, 0]), made(3, group(3, 1), [20, 20, 20, 20, 20], [0, 0, 0, 0, 0])] };
  const out = between(a, b), row = key => out.rows.find(r => r.key === key);
  assert.equal(out.matches, 2);
  assert.deepEqual([row('focal.change').first.mean, row('focal.change').second.mean, row('focal.change').difference.mean], [20, 5, -15]);
  assert.deepEqual([row('focal.before').first.mean, row('focal.after').first.mean], [25, 45]);
  // The four others: A falls 20 -> 15 and 17.5 -> 12.5; B stays, then falls 20 -> 15.
  assert.deepEqual([row('others.change').first.mean, row('others.change').second.mean], [-5, -2.5]);
  assert.deepEqual([row('focal.claims').first.mean, row('focal.claims').second.mean, row('focal.claims').difference.mean], [8, 2, -6]);
  assert.deepEqual([row('base.claims').first.mean, row('base.claims').second.mean], [2, 0]);
  assert.equal(row('base.joint').first.mean, 0);
  assert.equal(row('focal.change').difference.k, 2);
  // The same model against itself differs in nothing.
  assert.ok(between(a, a).rows.every(r => r.difference.mean === 0));
});

test('a group can have two to five agents: equal parts of the same loom, the odd seats by the same rule, and its size in the record', async () => {
  for (const size of [2, 3, 4, 5]) {
    for (let n = 1; n <= 2 * size; n++) {
      assert.equal(oddSeats(n, 1, size)[0], (n - 1) % size);
      assert.deepEqual(oddSeats(n, 2, size).slice(0, 1), oddSeats(n, 1, size));
      assert.equal(new Set(oddSeats(n, size, size)).size, size);
    }
  }
  assert.deepEqual(oddSeats(1, 3), oddSeats(1, 3, 5));
  assert.throws(() => oddSeats(1, 1, 6), /from 2 to 5 agents/);
  assert.throws(() => oddSeats(1, 4, 3), /a count from 0 to 3/);
  const seats = [{ personality: 'blunt', goal: 'none' }, { personality: 'calm', goal: 'none' }, { personality: 'calm', goal: 'none' }];
  assert.equal(castOf(seats).length, 3);
  assert.throws(() => castOf(seats.slice(0, 1)), /from 2 to 5 agents/);
  const rug = await play({ seats, seed: 4 }), record = recordOf(rug, { id: 'm004', match: 4, seats });
  assert.equal(record.results.length, 3);
  const c = conditionsOf(record);
  assert.deepEqual([c.size, c.mix, c.persona], [3, '1 blunt + 2 calm', 'mixed']);
  assert.equal(conditionsOf({ model: 'x', rules: 2, seats: group(1, 1) }).size, undefined);
  // What the agents hold alone and what two hold jointly are the whole loom, whatever the size.
  assert.ok(Math.abs(record.results.reduce((s, r) => s + r.ground, 0) + record.joint + (record.bare ?? 0) - 100) < 0.6);
  // Hold is scored against a third of the loom, not a fifth: an agent ending on its starting part scores 100.
  const third = record.results.map(r => Math.abs(r.ground - 100 / 3));
  assert.ok(record.results.every((r, i) => Math.abs(r.scores.hold - Math.max(0, 100 * (1 - third[i] * 3 / 100))) < 0.6));
  assert.ok(sameCloth(await replay(JSON.parse(JSON.stringify(record))), rug));
  await assert.rejects(play({ seats, seed: 4, solo: 0 }), /fewer than five/);
  // A group of three is a setting of its own, and is read apart from the groups of five.
  assert.equal(switchesOf({ conditions: c }).agents, 'group of 3');
  const calm = { personality: 'calm', goal: 'none' }, blunt = { personality: 'blunt', goal: 'none' };
  const few = (run, k) => runOf(run, 'm', [1, 2].map(n => { const s = Array.from({ length: 2 }, () => ({ ...calm })); for (const i of oddSeats(n, k, 2)) s[i] = { ...blunt }; return { match: n, id: `m${n}`, seats: s, bench: [0, 1], results: s.map((x, seat) => ({ seat, personality: x.personality, goal: 'none', ground: 50, did: { took: 0, gave: 0, offered: 0, refused: 0, borrowed: 0 } })) }; }));
  const five = [runOf('c-0', 'm', [1, 2].map(n => made(n, group(n, 0, calm, blunt), [20, 20, 20, 20, 20], [0, 0, 0, 0, 0]))), runOf('c-1', 'm', [1, 2].map(n => made(n, group(n, 1, calm, blunt), [20, 20, 20, 20, 20], [0, 0, 0, 0, 0])))];
  const sets = compositions([...five, few('d-0', 0), few('d-1', 1)]);
  assert.deepEqual(sets.map(s => [s.size, s.types.join('+'), s.levels.map(l => l.count).join()]).sort(), [[2, 'calm+blunt', '0,1'], [5, 'calm+blunt', '0,1']]);
});
