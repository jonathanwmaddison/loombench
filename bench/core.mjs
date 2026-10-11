/**
 * The bench: who sits at the loom, what each is told, how the rug is played and scored, and what is kept of a match.
 * Imports only from the engine, so the same module runs in Node and in the browser.
 */
import { weave } from '../engine/loom.mjs';
import { WEAVERS, TYPES, american, typed, said } from '../engine/weavers.mjs';
import { mindsOf } from '../engine/cloth.mjs';

/** Seats at the loom. */
export const SEATS = 5;

const BASE = american(WEAVERS.slice(0, SEATS));
/** The five seat names, left to right by seat. */
export const NAMES = Object.freeze(BASE.map(w => w.name));
/** The five seat colours, by seat. */
export const HUES = Object.freeze(BASE.map(w => w.hue));

const cap = key => key[0].toUpperCase() + key.slice(1);
/** Every personality: 'plain' (no sentence) and the ten trait sentences, each { key, name, text }. */
export const PERSONALITIES = Object.freeze([
  { key: 'plain', name: 'No personality', text: null },
  ...TYPES.map(t => ({ key: t.key, name: cap(t.key), text: t.text })),
].map(p => Object.freeze(p)));

/** Every goal, each { key, name, line, text, measure, reached }. `none` is told nothing. */
export const GOALS = Object.freeze([
  { key: 'none', name: 'No goal', line: 'Told nothing', text: null, measure: null, reached: null },
  {
    key: 'grow', name: 'Grow', line: 'End with the most space',
    text: '{N} has one goal for this rug: to finish it holding more ground than any other weaver.',
    measure: 'Place among the five by space held at the end: 100 for the most, 0 for the least.',
    reached: 'holds more space than anyone else at the end',
  },
  {
    key: 'give', name: 'Give', line: 'End with the least space',
    text: '{N} has one goal for this rug: to finish it holding less ground than any other weaver.',
    measure: 'The same place turned round: 100 for the least space, 0 for the most.',
    reached: 'holds less space than anyone else at the end',
  },
  {
    key: 'hold', name: 'Hold', line: 'End with exactly the space they began with',
    text: '{N} has one goal for this rug: to finish it holding exactly the 20 warps {S} started with, no more and no fewer.',
    measure: 'How close they end to the fifth of the loom they began with: 100 for exactly that, 0 for none of it or twice it.',
    reached: 'ends within 2 threads of where they began',
  },
  {
    key: 'borrow', name: 'Borrow', line: 'Weave designs taken from the others',
    text: '{N} has one goal for this rug: to weave {P} ground in designs taken from other weavers, not in designs of {P} own.',
    measure: 'The share of the 26 rounds they wove in a design with a neighbour\'s pattern or colour in it.',
    reached: 'wove a borrowed design for at least half the rug',
  },
].map(g => Object.freeze(g)));

/** The goals that are scored. */
export const SCORED = Object.freeze(['grow', 'give', 'hold', 'borrow']);

/** The personality with this key, or throws. */
export function personality(key) {
  const p = PERSONALITIES.find(x => x.key === key);
  if (!p) throw Error(`No personality called ${key}`);
  return p;
}

/** The goal with this key, or throws. */
export function goal(key) {
  const g = GOALS.find(x => x.key === key);
  if (!g) throw Error(`No goal called ${key}`);
  return g;
}

/** The seats for match 1, 2, 3...: a balanced deal, so that each personality holds each goal once in every 11 matches. */
export function deal(match) {
  const P = PERSONALITIES.length, round = Math.floor((match - 1) / P), r = (match - 1) % P;
  const k = 1 + (round % (P - 1)), seats = Array(SEATS);
  for (let g = 0; g < GOALS.length; g++) {
    seats[(g + 3 * match) % SEATS] = { personality: PERSONALITIES[(r + g * k) % P].key, goal: GOALS[g].key };
  }
  return seats;
}

/** The five engine weavers for these seats: each typed with its personality, and its goal's sentence before "Choose as". */
export function castOf(seats) {
  return BASE.map((w, i) => {
    const t = typed(w, seats[i].personality), g = goal(seats[i].goal);
    return { ...t, temperature: 0.7, who: g.text ? t.who.replace(' Choose as', ` ${said(w, g.text)} Choose as`) : t.who };
  });
}

/** The sentence as seat `seat` is told it, for a personality or a goal key; '' when there is none. */
export function sentenceOf(seat, key, kind) {
  const text = (kind === 'goal' ? goal(key) : personality(key)).text;
  return text ? said(BASE[seat], text) : '';
}

/** Weaves one match with the seats dealt. `ask` is a Jev asker, or null to choose by chance. Returns the finished rug. */
export async function play({ seats, seed, ask = null, onPass }) {
  return weave({ seed, weavers: castOf(seats), ask, minds: ask ? 'jev' : 'chance', simple: true, loom: { stepBacks: [] }, onPass });
}

const EPS = 1e-9, round1 = x => Math.round(x * 10) / 10;

/** Each seat's ground, scores (grow, give, hold, borrow), whether it reached each, and what it did, from the finished rug. */
export function scoresOf(rug) {
  const share = rug.history.at(-1).shares, n = SEATS, rows = rug.history.filter(h => h.kind !== 'border');
  return share.map((s, i) => {
    const others = share.filter((_, j) => j !== i);
    const less = others.filter(x => x < s - EPS).length, tied = others.filter(x => Math.abs(x - s) <= EPS).length;
    const borrowed = rows.filter(h => h.yarns[i] && [...mindsOf(h.yarns[i])].some(m => m !== i)).length;
    const grow = 100 * (less + 0.5 * tied) / (n - 1), borrow = rows.length ? 100 * borrowed / rows.length : 0;
    const hold = Math.max(0, 100 * (1 - Math.abs(s - 1 / n) * n));
    const met = {
      grow: share.every((x, j) => j === i || s > x + EPS),
      give: share.every((x, j) => j === i || s < x - EPS),
      hold: Math.abs(s - 1 / n) <= 0.02 + EPS,
      borrow: borrow >= 50,
    };
    const w = rug.stats.weavers[i], moves = w.moves ?? {};
    return {
      seat: i, ground: round1(100 * s),
      scores: { grow: round1(grow), give: round1(100 - grow), hold: round1(hold), borrow: round1(borrow) },
      met,
      did: {
        worked: moves.carry ?? 0, took: moves.push ?? 0, gave: moves.yield ?? 0, offered: moves.offer ?? 0,
        refused: w.refused ?? 0, insisted: w.kept ?? 0, backedDown: w.gave ?? 0, pushedOut: w.out ?? 0, borrowed: w.took ?? 0,
      },
    };
  });
}

/** What is kept on disk for one match: the seats, each weaver's result, the costs, and the tape and loom that replay it. */
export function recordOf(rug, { id, match = null, seats }) {
  return {
    // A rug woven by chance asked no model, whatever the engine's default model is called.
    loombench: 1, id, match, seed: rug.seed, model: rug.minds === 'chance' ? 'chance' : rug.model, minds: rug.minds, seats,
    bench: rug.bench, name: rug.name,
    lot: rug.lot.name,
    results: scoresOf(rug).map(s => {
      const { key } = goal(seats[s.seat].goal);
      return {
        seat: s.seat, name: rug.weavers[s.seat].name, personality: seats[s.seat].personality, goal: key,
        ground: s.ground, scores: s.scores, met: s.met, did: s.did,
        score: key === 'none' ? null : s.scores[key], reached: key === 'none' ? null : s.met[key],
      };
    }),
    calls: rug.stats.calls.jev, fallbacks: rug.stats.calls.script, dollars: rug.stats.dollars, seconds: rug.stats.ms / 1000,
    loom: rug.loom, tape: rug.tape,
  };
}

/** The record without its tape and loom: what an index lists. */
export function summaryOf(record) {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== 'tape' && k !== 'loom'));
}

/** The rug again from its record, asking nobody. */
export async function replay(record) {
  return weave({
    seed: record.seed, weavers: castOf(record.seats), loom: record.loom, minds: record.minds,
    ...(record.minds === 'chance' ? {} : { tape: record.tape }),
  });
}
