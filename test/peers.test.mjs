/**
 * `node --test`: the peer study (`bench/peers.mjs`), and what it does to a match, its record and its kept files. No key
 * and no network: the minds are a stub.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rng } from '../engine/rng.mjs';
import { jevAsker } from '../engine/jev.mjs';
import { deal, play, recordOf, replay, summaryOf } from '../bench/core.mjs';
import {
  HEARD, ASKS, peerAsker, askOf, towardOf, tallyPeers, rowsOfPeers, peerTable, apart, heededCloth,
} from '../bench/peers.mjs';
import { newCloth } from '../engine/cloth.mjs';
import { keepMatch, writeIndex } from '../tools/keep.mjs';

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
const same = (a, b) => Buffer.from(a.cloth.dye).equals(Buffer.from(b.cloth.dye))
  && Buffer.from(a.cloth.mark).equals(Buffer.from(b.cloth.mark));
const asker = () => jevAsker(stub, { budget: 1e6 });
const SEED = 1, SEATS = deal(1);

/** One peers match with the stub: its rug, and its log. Shared by the tests that need it, woven once. */
let woven = null;
const peersRug = async () => (woven ??= await play({ seats: SEATS, seed: SEED, ask: asker(), peers: true }));

test('a match with peers has a log of decisions, each well formed; most are heard', async () => {
  const rug = await peersRug(), log = rug.peers;
  assert.ok(log.length > 50, `only ${log.length} decisions`);
  for (const e of log) {
    for (const k of ['alone', 'told', 'after']) {
      assert.equal(e[k].length, e.options.length);
      assert.ok(Math.abs(e[k].reduce((s, x) => s + x, 0) - 1) <= 0.02, `${k} does not sum to 1`);
    }
    for (const t of ['peerTop', 'aloneTop', 'afterTop']) assert.ok(Number.isInteger(e[t]) && e[t] >= 0 && e[t] < e.options.length, t);
    assert.notEqual(e.peer, e.seat);
    assert.ok(e.options.some(o => o.to === e.peer), 'the neighbour is not among the options');
    assert.equal(typeof e.said === 'string', e.heard);
  }
  const heard = log.filter(e => e.heard).length;
  assert.ok(heard >= log.length / 2 && heard <= log.length, `${heard} of ${log.length} heard`);
  assert.ok(Math.abs(heard / log.length - HEARD) < 0.15, 'the share heard is far from the HEARD share');
});

test('the same match played twice gives the same log and the same cloth', async () => {
  const a = await play({ seats: SEATS, seed: SEED, ask: asker(), peers: true });
  const b = await play({ seats: SEATS, seed: SEED, ask: asker(), peers: true });
  assert.deepEqual(a.peers, b.peers);
  assert.ok(same(a, b));
});

test('a held-back decision leaves the weights as they were; a heard one can move them', async () => {
  const log = (await peersRug()).peers;
  for (const e of log.filter(e => !e.heard)) {
    assert.deepEqual(e.after, e.alone);
    assert.equal(towardOf(e), 0);
  }
  assert.ok(log.some(e => e.heard && JSON.stringify(e.after) !== JSON.stringify(e.alone)), 'no heard decision moved');
});

test('what the weaver hears names the neighbour, the weaver, and the option the neighbour chose', async () => {
  const rug = await peersRug(), heard = rug.peers.filter(e => e.heard);
  assert.ok(heard.length > 0);
  for (const e of heard) {
    assert.ok(e.said.includes(rug.weavers[e.peer].name), 'no neighbour name');
    assert.ok(e.said.includes(rug.weavers[e.seat].name), 'no weaver name');
    assert.ok(e.said.includes(e.options[e.peerTop].text), 'not the chosen option');
  }
});

test('a peers record has mode and peers, survives JSON and replays; a quiet record has neither peers nor a peer log', async () => {
  const rug = await peersRug(), record = recordOf(rug, { id: 'x1', match: 1, seats: SEATS });
  assert.equal(record.mode, 'peers');
  assert.deepEqual(record.peers, rug.peers);
  assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
  const summary = summaryOf(record);
  assert.ok(!('peers' in summary) && !('tape' in summary));
  assert.ok(same(rug, await replay(record)));

  const quiet = await play({ seats: SEATS, seed: SEED, ask: asker() }), quietRecord = recordOf(quiet, { id: 'q1', match: 1, seats: SEATS });
  assert.equal(quietRecord.mode, 'quiet');
  assert.ok(!('peers' in quietRecord));
  assert.equal(quiet.peers, undefined);
});

test('peers without a model is woven by chance: no log, and a quiet record', async () => {
  const rug = await play({ seats: SEATS, seed: SEED, peers: true });
  assert.equal(rug.minds, 'chance');
  assert.equal(rug.peers, undefined);
  assert.equal(recordOf(rug, { id: 'c1', match: 1, seats: SEATS }).mode, 'quiet');
});

test('askOf names what a neighbour asks for, for each of the eight keys', () => {
  const entry = (kind, to) => ({ peer: 2, peerTop: 0, options: [{ kind, to }] });
  assert.equal(askOf(entry('carry', -1)), 'work');
  assert.equal(askOf(entry('yield', 2)), 'giveMe');
  assert.equal(askOf(entry('yield', 4)), 'giveOther');
  assert.equal(askOf(entry('push', 2)), 'takeMine');
  assert.equal(askOf(entry('push', 4)), 'takeOther');
  assert.equal(askOf(entry('offer', 2)), 'shareMe');
  assert.equal(askOf(entry('offer', 4)), 'shareOther');
  assert.equal(askOf(entry('rejoin', 4)), 'other');
  assert.deepEqual(Object.keys(ASKS).sort(), ['giveMe', 'giveOther', 'other', 'shareMe', 'shareOther', 'takeMine', 'takeOther', 'work']);
});

test('towardOf, tallyPeers and apart give what the hand says, and none gives NaN', () => {
  assert.ok(Math.abs(towardOf({ peerTop: 0, alone: [0.2, 0.8], after: [0.6, 0.4] }) - 40) < 1e-9);
  const entries = [
    { peerTop: 0, aloneTop: 0, afterTop: 0, alone: [0.5, 0.5], after: [0.8, 0.2] },
    { peerTop: 0, aloneTop: 0, afterTop: 1, alone: [0.7, 0.3], after: [0.4, 0.6] },
    { peerTop: 1, aloneTop: 0, afterTop: 0, alone: [0.5, 0.5], after: [0.5, 0.5] },
  ];
  const t = tallyPeers(entries);
  assert.equal(t.n, 3);
  assert.ok(Math.abs(t.toward) < 1e-9);
  assert.ok(Math.abs(t.movedToward - 10) < 1e-9);
  assert.ok(Math.abs(t.movedAway + 10) < 1e-9);
  assert.ok(Math.abs(t.took - 1 / 3) < 1e-9);
  assert.ok(Math.abs(t.backfired - 1 / 3) < 1e-9);
  const none = tallyPeers([]);
  assert.equal(none.n, 0);
  for (const k of ['toward', 'movedToward', 'movedAway', 'took', 'backfired']) assert.ok(Number.isNaN(none[k]), k);

  const grounds = (...g) => ({ results: g.map((ground, seat) => ({ seat, ground })) });
  assert.ok(Math.abs(apart(grounds(10, 20), grounds(14, 15)) - 4.5) < 1e-9);
});

/** A hand-made decision row, as `rowsOfPeers` makes them. */
const row = o => ({
  heard: true, alone: [0.6, 0.4], after: [0.6, 0.4], told: [0.5, 0.5], aloneTop: 0, peerTop: 0, afterTop: 0, asks: 'work',
  judge: { personality: 'warm', goal: 'grow' }, speaker: { personality: 'blunt', goal: 'hold' }, ...o,
});

test('peerTable on a small hand-made set: the counts add up, and the effect is heard less held', () => {
  const rows = [
    // Disagreed and heard: moves toward the neighbour's option by +30 points.
    row({ peerTop: 1, afterTop: 1, alone: [0.6, 0.4], after: [0.3, 0.7], asks: 'giveMe' }),
    // Disagreed and held back: asked twice, no movement.
    row({ heard: false, peerTop: 1, afterTop: 0, alone: [0.6, 0.4], after: [0.6, 0.4], asks: 'giveMe' }),
    // Agreed and heard: +10 on the shared top.
    row({
      peerTop: 1, aloneTop: 1, afterTop: 1, alone: [0.3, 0.7], after: [0.2, 0.8], asks: 'work',
      judge: { personality: 'blunt', goal: 'give' }, speaker: { personality: 'warm', goal: 'grow' },
    }),
    // Agreed and held back.
    row({ heard: false, judge: { personality: 'blunt', goal: 'give' }, speaker: { personality: 'warm', goal: 'grow' }, asks: 'takeMine' }),
    // Disagreed and heard, a sure weaver: +40 points.
    row({ peerTop: 1, afterTop: 1, alone: [0.9, 0.1], after: [0.5, 0.5], asks: 'takeMine' }),
  ];
  const t = peerTable(rows), count = x => x.heard.n + x.held.n;
  assert.equal(t.decisions, 5);
  assert.equal(count(t.disagreed), 3);
  assert.equal(count(t.agreed), 2);
  assert.equal(count(t.disagreed) + count(t.agreed), t.decisions);
  for (const side of [t.listeners, t.speakers, t.listenerGoals, t.speakerGoals]) {
    assert.equal(Object.values(side).reduce((s, x) => s + count(x), 0), count(t.disagreed));
  }
  assert.equal(Object.values(t.asks).reduce((s, x) => s + x.n, 0), t.decisions);
  assert.equal(Object.values(t.asks).reduce((s, x) => s + count(x), 0), count(t.disagreed));
  assert.equal(Object.keys(t.asks).length, Object.keys(ASKS).length);
  assert.equal(t.sure.low.heard.n + t.sure.low.held.n + t.sure.high.heard.n + t.sure.high.held.n, count(t.disagreed));
  assert.equal(count(t.listeners.warm), 3);

  assert.equal(t.disagreed.heard.n, 2);
  assert.ok(Math.abs(t.disagreed.heard.toward - 35) < 1e-9);
  assert.ok(Math.abs(t.disagreed.held.toward) < 1e-9);
  assert.ok(Math.abs(t.disagreed.effect - (t.disagreed.heard.toward - t.disagreed.held.toward)) < 1e-9);
  assert.ok(Math.abs(t.agreed.heard.toward - 10) < 1e-9);
});

test('keeping a peers match writes peers.json and the index says so; a quiet match writes neither', async () => {
  const peerDir = await mkdtemp(join(tmpdir(), 'loombench-peers-')), quietDir = await mkdtemp(join(tmpdir(), 'loombench-quiet-'));
  try {
    const rug = await peersRug(), record = recordOf(rug, { id: 'm001', match: 1, seats: SEATS });
    await keepMatch(peerDir, record, rug);
    const index = await writeIndex(peerDir, 'peers-test');
    assert.equal(index.mode, 'peers');
    const file = JSON.parse(await readFile(join(peerDir, 'peers.json'), 'utf8'));
    assert.equal(file.rows.length, record.peers.length);
    for (const r of file.rows) {
      assert.ok(r.judge && r.speaker);
      assert.ok(!('said' in r) && !('texts' in r));
    }

    const quiet = await play({ seats: SEATS, seed: SEED, ask: asker() });
    const quietRecord = recordOf(quiet, { id: 'm001', match: 1, seats: SEATS });
    await keepMatch(quietDir, quietRecord, quiet);
    const quietIndex = await writeIndex(quietDir, 'quiet-test');
    assert.equal(quietIndex.mode, 'quiet');
    await assert.rejects(access(join(quietDir, 'peers.json')));
  } finally {
    await rm(peerDir, { recursive: true, force: true });
    await rm(quietDir, { recursive: true, force: true });
  }
});

/**
 * A three-row cloth of four stitches each, by hand. Row 0 is pass 0, row 1 pass 1, row 2 pass 2. Stitch 3 of row 0 is
 * guild's; in row 2 stitch 1 is shared (`own2` 3), so it must be left alone whatever the seats did.
 */
const handCloth = () => {
  const c = newCloth(4, 3);
  c.rows = 3;
  c.pass.set([0, 1, 2]);
  c.own.set([0, 1, 2, -1, 1, 0, 2, 0, 0, 1, 1, 2]);
  c.own2.set([0, 1, 2, -1, 1, 0, 2, 0, 0, 3, 1, 2]);
  return c;
};
const ownOf = c => Array.from(c.own2);
/** An entry as `rowsOfPeers` and the record keep them, with only the fields the restriping reads. */
const at = (pass, seat, peer, o) => ({ pass, seat, peer, heard: true, aloneTop: 0, peerTop: 1, afterTop: 1, ...o });

test('heededCloth: a seat that took the neighbour\'s choice is striped with the neighbour, and only where it was alone', () => {
  const cloth = handCloth();
  const entries = [
    at(0, 0, 3),
    at(0, 1, 2, { heard: false }),
    at(1, 0, 2, { aloneTop: 1, peerTop: 1, afterTop: 1 }),
    at(1, 2, 0, { afterTop: 0 }),
    at(2, 1, 4),
  ];
  const out = heededCloth(cloth, entries);
  // Row 0: seat 0 took seat 3's choice at stitch 0. Seat 1 was not heard, seat 2 did not take it, guild stays guild.
  // Row 1: seat 0 agreed alone, seat 2 did not take the choice. Row 2: seat 1 took seat 4's choice, except the shared stitch.
  assert.deepEqual(ownOf(out), [3, 1, 2, -1, 1, 0, 2, 0, 0, 3, 4, 2]);
});

test('heededCloth: an entry that was not heard, that agreed alone, or that was not taken, restripes nothing', () => {
  const cloth = handCloth();
  const entries = [
    at(0, 0, 3, { heard: false }),
    at(0, 0, 3, { aloneTop: 1 }),
    at(0, 0, 3, { afterTop: 0 }),
    at(1, 0, 2, { aloneTop: 1, peerTop: 1, afterTop: 1 }),
    at(2, 1, 4, { heard: false }),
    at(2, 1, 4, { afterTop: 0 }),
  ];
  assert.deepEqual(ownOf(heededCloth(cloth, entries)), ownOf(handCloth()));
});

test('heededCloth: the cloth it is given is not changed, and the copy has its own array', () => {
  const cloth = handCloth(), before = ownOf(cloth);
  const out = heededCloth(cloth, [at(0, 0, 3), at(2, 1, 4)]);
  assert.deepEqual(ownOf(cloth), before);
  assert.notEqual(out.own2, cloth.own2);
  assert.ok(out.own2 instanceof Int8Array);
  assert.equal(out.own, cloth.own);
});

test('heededCloth: with no entries the copy\'s own2 equals the original\'s', () => {
  const cloth = handCloth();
  assert.deepEqual(ownOf(heededCloth(cloth, [])), ownOf(cloth));
});
