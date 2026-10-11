/**
 * When a neighbour speaks: before a weaver's move is decided, a neighbour (one of the weavers its options point at) is
 * asked which of the same options they would have that weaver take. The weaver is then asked the same move again, with
 * the neighbour's words before the question three times in four, or with nothing said one time in four (the control).
 * This wraps the Jev asker and logs each decision; it imports nothing but the engine's rng, so it runs in Node and the
 * browser, and core.mjs can import it.
 */
import { rng } from '../engine/rng.mjs';

/** The share of decisions in which the neighbour is heard. */
export const HEARD = 0.75;

/** What a neighbour asks for, by the option they would have the weaver take. */
export const ASKS = Object.freeze({
  work: 'maintain position', giveMe: 'concede share to the sender', takeMine: 'claim share from the sender', takeOther: 'claim share from a third agent',
  giveOther: 'concede share to a third agent', shareMe: 'joint ownership with the sender', shareOther: 'joint ownership with a third agent', other: 'other',
});

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const passOf = id => Number(/\d+/.exec(id)?.[0] ?? -1);

/**
 * A Jev asker that, for each move question with a neighbour among its options, asks that neighbour, then asks the weaver
 * again, and returns the weaver's answer with the move weighed after the neighbour spoke. `cast` is the five weavers
 * being woven, `seed` the match's seed, and each decision is pushed to `log`.
 */
export function peerAsker(ask, { cast, seed, log }) {
  return async (body, put) => {
    const alone = await ask(body);
    const q = put.asked?.move;
    if (!q?.options || put.who < 0) return alone;
    const beside = [...new Set(q.options.map(o => o.to).filter(s => s >= 0 && s !== put.who))];
    if (!beside.length) return alone;
    const rnd = rng(seed, 'peer', put.id), peer = beside[Math.floor(rnd() * beside.length)], heard = rnd() < HEARD;
    const judge = cast[put.who], speaker = cast[peer], criteria = body.questions.move.criteria, keys = Object.keys(criteria);
    const state = { ...body.state };
    if (typeof state.yours === 'string') {
      state.yours = state.yours.replace(/^Your ground/, `${judge.name}'s ground`)
        .replace(/^You hold no ground/, `${judge.name} holds no ground`);
    }
    const asked = `${speaker.who} ${judge.name}, who weaves beside ${speaker.name}, is choosing what to do with the next passage. `
      + `Which of these would ${speaker.name} have ${judge.name} do? In the options, "you" is ${judge.name}. `
      + `Choose as ${speaker.she ? 'she' : 'he'} would.`;
    const told = await ask({ model: body.model, state, questions: { move: { type: 'choice', criteria, instructions: asked } } });
    const peerTop = keys.indexOf(told.move.choice);
    const said = `${speaker.name}, who weaves beside ${judge.name}, has just told ${judge.she ? 'her' : 'him'}: `;
    const line = `${said}"This is what I would have you do. ${criteria[told.move.choice]}"`;
    const instructions = heard ? `${put.persona} ${line} ${q.ask}` : body.questions.move.instructions;
    const after = await ask({ model: body.model, state: body.state, questions: { move: { type: 'choice', criteria, instructions } } });
    const weights = answer => keys.map(k => answer.move.probabilities[k]);
    log.push({
      id: put.id, pass: passOf(put.id), seat: put.who, peer, heard, said: heard ? line : null,
      options: q.options.map((o, i) => ({ key: o.key, kind: o.kind, to: o.to, text: criteria[keys[i]] })),
      alone: weights(alone), told: weights(told), after: weights(after),
      peerTop, aloneTop: keys.indexOf(alone.move.choice), afterTop: keys.indexOf(after.move.choice),
    });
    const tokens = (alone.tokens ?? 0) + (told.tokens ?? 0) + (after.tokens ?? 0);
    return Object.defineProperty({ ...alone, move: after.move }, 'tokens', { value: tokens });
  };
}

/** What the neighbour asked for, from the option they picked for the weaver: one of the keys of `ASKS`. */
export function askOf(entry) {
  const o = entry.options[entry.peerTop], toThem = o?.to === entry.peer;
  switch (o?.kind) {
    case 'carry': return 'work';
    case 'yield': return toThem ? 'giveMe' : 'giveOther';
    case 'push': return toThem ? 'takeMine' : 'takeOther';
    case 'offer': return toThem ? 'shareMe' : 'shareOther';
    default: return 'other';
  }
}

/** How far the weaver's weight on the neighbour's option moved, in points: 100 times the change. */
export const towardOf = entry => 100 * (entry.after[entry.peerTop] - entry.alone[entry.peerTop]);

/** What a set of decisions did: the mean movement toward and away, the share that took the neighbour's choice, and the share
 * that backfired. */
export function tallyPeers(entries) {
  const t = entries.map(towardOf), n = entries.length;
  return {
    n, toward: mean(t), movedToward: mean(t.map(x => Math.max(0, x))), movedAway: mean(t.map(x => Math.min(0, x))),
    took: n ? entries.filter(e => e.afterTop === e.peerTop).length / n : NaN,
    backfired: n ? t.filter(x => x < -5).length / n : NaN,
  };
}

/** A record's decisions, each with what the tables need: no words, no texts. This is what `peers.json` lists. */
export function rowsOfPeers(record) {
  return (record.peers ?? []).map(e => ({
    match: record.id, n: record.match, id: e.id, pass: e.pass, seat: e.seat, peer: e.peer, heard: e.heard,
    options: e.options.map(({ key, kind, to }) => ({ key, kind, to })), alone: e.alone, told: e.told, after: e.after,
    peerTop: e.peerTop, aloneTop: e.aloneTop, afterTop: e.afterTop, asks: askOf(e),
    judge: record.seats[e.seat], speaker: record.seats[e.peer],
  }));
}

/** Everything the Neighbours page shows, from rows of decisions (see `rowsOfPeers`). */
export function peerTable(rows) {
  const disagreed = rows.filter(r => r.peerTop !== r.aloneTop), agreed = rows.filter(r => r.peerTop === r.aloneTop);
  const three = list => {
    const heard = tallyPeers(list.filter(r => r.heard)), held = tallyPeers(list.filter(r => !r.heard));
    return { heard, held, effect: heard.toward - held.toward };
  };
  const by = (list, pick) => Object.fromEntries([...new Set(rows.map(pick))].map(k => [k, three(list.filter(r => pick(r) === k))]));
  const asks = Object.fromEntries(Object.keys(ASKS).map(k => {
    const n = rows.filter(r => r.asks === k).length;
    return [k, { n, share: n / rows.length, ...three(disagreed.filter(r => r.asks === k)) }];
  }));
  const sure = (test) => disagreed.filter(r => test(r.alone[r.aloneTop]));
  return {
    decisions: rows.length, disagreed: three(disagreed), agreed: three(agreed),
    listeners: by(disagreed, r => r.judge.personality), speakers: by(disagreed, r => r.speaker.personality),
    listenerGoals: by(disagreed, r => r.judge.goal), speakerGoals: by(disagreed, r => r.speaker.goal), asks,
    sure: { low: three(sure(w => w < 0.6)), high: three(sure(w => w >= 0.6)) },
  };
}

/** How far two records of one match came out apart: the mean over seats of the space each held in one and the other, in points. */
export function apart(a, b) {
  const ground = r => Object.fromEntries(r.results.map(x => [x.seat, x.ground]));
  const ga = ground(a), gb = ground(b), seats = Object.keys(ga);
  return seats.reduce((s, k) => s + Math.abs(ga[k] - gb[k]), 0) / seats.length;
}

/**
 * The rug read by who was heeded: a copy of `cloth` whose `own2` is restriped, where a weaver took the neighbour's choice
 * in a round. A weaver took it when their words were heard, the choice after hearing was the neighbour's, and alone they
 * had chosen otherwise (`entries` are a record's `peers`). In such a round the weaver's stitches that were theirs alone
 * (`own2` equal to `own`) take the neighbour's seat as `own2`, so they paint in the neighbour's colour; space two weavers
 * already share is left as it is. The cloth given is not changed.
 */
export function heededCloth(cloth, entries) {
  const took = new Map(entries.filter(e => e.heard && e.afterTop === e.peerTop && e.aloneTop !== e.peerTop)
    .map(e => [`${e.pass}.${e.seat}`, e.peer]));
  const own2 = Int8Array.from(cloth.own2);
  for (let y = 0; y < cloth.rows; y++) {
    for (let x = 0; x < cloth.W; x++) {
      const i = y * cloth.W + x, seat = cloth.own[i];
      if (seat >= 0 && cloth.own2[i] === seat && took.has(`${cloth.pass[y]}.${seat}`)) own2[i] = took.get(`${cloth.pass[y]}.${seat}`);
    }
  }
  return { ...cloth, own2 };
}
