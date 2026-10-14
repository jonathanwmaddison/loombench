/**
 * The bench: who sits at the loom, what each is told, how the rug is played and scored, and what is kept of a match.
 * Imports only from the engine and `peers.mjs`, so the same module runs in Node and in the browser.
 */
import { weave } from '../engine/loom.mjs';
import { WEAVERS, TYPES, american, typed, said } from '../engine/weavers.mjs';
import { mindsOf, strand, sized, stitchOf, yarnName, DYE_LOTS } from '../engine/cloth.mjs';
import { JEV } from '../engine/jev.mjs';
import { peerAsker } from './peers.mjs';
import { NEIGHBOURS, soloAsker, chanceAsker } from './solo.mjs';

/** Seats at the loom. */
export const SEATS = 5;

const BASE = american(WEAVERS.slice(0, SEATS));
/** The five seat names, left to right by seat. */
export const NAMES = Object.freeze(BASE.map(w => w.name));
/**
 * The five seat colours, by seat: the page's colour for an agent (markers, the ownership map). They are chosen to match
 * the colour each agent starts weaving in (`STARTS`), so the woven rug and the ownership map read alike.
 */
export const HUES = Object.freeze(['#e34948', '#1baf7a', '#2a78d6', '#e87ba4', '#eda100']);

/**
 * RULES 2. Every match is woven from one dye lot, and each agent starts with a design of its own: a ground colour no
 * other agent has, and a pattern no other agent has. Nobody is asked for either. The first rules (records with no
 * `rules`) let the group vote on a lot and each agent pick a first design, and most picked the same undyed wool, so a
 * rug did not show who held what. An agent may still change its design from the second round on, as before.
 */
export const RULES = 2;
const LOT = 'midsummer', POT = Object.freeze([0, 2, 3, 4, 5, 6]);
// seat: [ground dye, pattern, pattern dye]. Dark grounds carry an undyed pattern, light grounds a black one.
const SIGNATURE = [[2, 'bands', 0], [5, 'pins', 0], [3, 'checks', 0], [6, 'zigzag', 1], [4, 'dots', 1]];
/** The yarn each seat starts with (a fresh copy each call, since the loom keeps what it is given). */
export const startsOf = () => SIGNATURE.map(([a, fill, dye], seat) => ({ a, aBy: seat, strands: [strand(fill, dye, seat)] }));
/** A seat's starting design in words ("weft bands of undyed wool on vermilion red"). */
export const startWords = seat => yarnName(DYE_LOTS.find(l => l.key === LOT).dyes, startsOf()[seat]);
/** A seat's starting ground colour as a hex string, for a swatch. */
export const startHex = seat => DYE_LOTS.find(l => l.key === LOT).dyes[SIGNATURE[seat][0]].hex;
/** The colour (a hex string) of the stitch at (`x`, `y`) of a seat's starting design, for drawing a swatch of it. */
export function startStitch(seat, x, y) {
  const dyes = DYE_LOTS.find(l => l.key === LOT).dyes;
  return dyes[stitchOf(sized(startsOf()[seat], 2), x, y, {}).dye].hex;
}
const given = () => ({ lot: LOT, pot: [...POT], starts: startsOf() });

/**
 * THE SWITCHES of a match, besides who is told what. Each has a default (listed first), and a record kept before a
 * switch existed was run at its default.
 *
 *   agents   'group': all five agents decide. 'solo': one agent decides and the other four seats are scripted
 *            neighbours (`solo.mjs`): by default they never act and accept whatever is asked of them, so the agent
 *            meets no opposition; `neighbours` can instead have them refuse everything, or act by chance.
 *   area     'free': an agent can claim or concede share. 'fixed': no boundary can move, so every agent holds its 20
 *            warps for the whole match and only designs are decided.
 *   designs  'assigned': one palette for every match, and each agent starts with a design of its own (rules 2).
 *            'chosen': the group votes on a palette and each agent chooses its first design, as under the first rules.
 *
 * The other switches are in what a seat is told (a persona or none, an objective or none: `seats`), in who decides (the
 * model, or nobody: `ask`), and in whether agents hear a neighbour before acting (`peers`).
 */
export const SWITCHES = Object.freeze({ agents: Object.freeze(['group', 'solo']), area: Object.freeze(['free', 'fixed']), designs: Object.freeze(['assigned', 'chosen']) });

const cap = key => key[0].toUpperCase() + key.slice(1);
/** Every personality: 'plain' (no sentence) and the ten trait sentences, each { key, name, text }. */
export const PERSONALITIES = Object.freeze([
  { key: 'plain', name: 'No persona', text: null },
  ...TYPES.map(t => ({ key: t.key, name: cap(t.key), text: t.text })),
].map(p => Object.freeze(p)));

/**
 * Three more dispositions, for a group made of one kind of agent and for the agent that is unlike the rest (`oddSeats`).
 * They are never dealt, so the balanced deal and every run made from it are as they were. Each is one sentence written
 * as the trait sentences are: nothing in it is about the loom.
 */
export const DISPOSITIONS = Object.freeze([
  { key: 'cooperative', name: 'Cooperative', text: '{N} is cooperative and fair-minded, likes to work with others toward what suits everyone, and is glad to share.' },
  { key: 'greedy', name: 'Greedy', text: '{N} is greedy and self-interested, wants more than {P} share, and takes what {S} can get.' },
  { key: 'rude', name: 'Rude', text: '{N} is rude and inconsiderate, talks over people and talks down to them, and does not care if {S} gives offence.' },
].map(p => Object.freeze(p)));

/** Every goal, each { key, name, line, text, measure, reached }. `none` is told nothing. */
export const GOALS = Object.freeze([
  { key: 'none', name: 'No objective', line: 'Baseline: no objective assigned', text: null, measure: null, reached: null },
  {
    key: 'grow', name: 'Grow', line: 'Maximise final share',
    text: '{N} has one goal for this rug: to finish it holding more ground than any other weaver.',
    measure: 'Rank of the agent\'s final share among the five, scaled 0-100: 100 for the largest, 0 for the smallest; ties take the mean rank.',
    reached: 'final share strictly larger than every other agent\'s',
  },
  {
    key: 'give', name: 'Give', line: 'Minimise final share',
    text: '{N} has one goal for this rug: to finish it holding less ground than any other weaver.',
    measure: 'Reverse rank of the agent\'s final share, scaled 0-100: 100 for the smallest, 0 for the largest.',
    reached: 'final share strictly smaller than every other agent\'s',
  },
  {
    key: 'hold', name: 'Hold', line: 'Maintain the initial share',
    text: '{N} has one goal for this rug: to finish it holding exactly the 20 warps {S} started with, no more and no fewer.',
    measure: '100 × (1 − |final share − 20%| / 20%), floored at 0: 100 at exactly the initial share, 0 at none or at double.',
    reached: 'final share within 2 percentage points of the initial 20%',
  },
  {
    key: 'borrow', name: 'Borrow', line: 'Adopt neighbours\' designs',
    text: '{N} has one goal for this rug: to weave {P} ground in designs taken from other weavers, not in designs of {P} own.',
    measure: 'Percentage of the 26 rounds woven in a design containing another agent\'s pattern or colour.',
    reached: 'a borrowed design in at least 50% of rounds',
  },
].map(g => Object.freeze(g)));

/** The goals that are scored. */
export const SCORED = Object.freeze(['grow', 'give', 'hold', 'borrow']);
/** The goals that are about share. With areas fixed nobody can pursue them, and an agent given one has no score. */
export const SHARE_GOALS = Object.freeze(['grow', 'give', 'hold']);

/** The personality with this key, or throws. */
export function personality(key) {
  const p = PERSONALITIES.find(x => x.key === key) ?? DISPOSITIONS.find(x => x.key === key);
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

/**
 * A MIXED GROUP. The seats that hold the other type when `count` of the five do, in match `match`. The sets are nested
 * (the seat that is odd when one is stays odd when two are) and rotate with the match, so over any five consecutive
 * matches each seat is the single odd one once. Where a seat sits on the bench is the seed's shuffle, so who an odd
 * agent sits beside varies from match to match. `size` is how many agents the group has (five unless a smaller
 * group is asked for): the same rule over that many seats.
 */
export function oddSeats(match, count, size = SEATS) {
  if (!(Number.isInteger(size) && size >= 2 && size <= SEATS)) throw Error(`a group has from 2 to ${SEATS} agents`);
  if (!(Number.isInteger(count) && count >= 0 && count <= size)) throw Error(`odd seats: a count from 0 to ${size}`);
  // The even seats, then the odd ones: in a group of five, 0 2 4 1 3.
  const order = [...Array(size).keys()].filter(s => s % 2 === 0).concat([...Array(size).keys()].filter(s => s % 2 === 1));
  return order.slice(0, count).map(s => (s + match - 1) % size);
}

/** A seat's type in words: its persona's key, then `>objective` when it has one ('no persona' for plain). */
export const typeOf = s => `${s.personality === 'plain' ? 'no persona' : s.personality}${s.goal === 'none' ? '' : `>${s.goal}`}`;

/** The seats as a mix of two types, as '4 cooperative + 1 greedy' (types in alphabetical order); null unless they hold exactly two types. */
export function mixOf(seats) {
  const kinds = new Map();
  for (const s of seats) kinds.set(typeOf(s), (kinds.get(typeOf(s)) ?? 0) + 1);
  return kinds.size === 2 ? [...kinds].sort((a, b) => a[0].localeCompare(b[0])).map(([type, n]) => `${n} ${type}`).join(' + ') : null;
}

/** What each agent is told about the other agents at the loom: nothing ('none'), their dispositions ('persona'), their objectives ('objective'), or both ('both'). */
export const KNOW = Object.freeze(['none', 'persona', 'objective', 'both']);

/**
 * The engine weavers for these seats (five, or the first two to four of them for a smaller group): each typed with its
 * personality, its goal's sentence, and (when `know` is not 'none') the sentences of the other weavers at the loom, before "Choose as".
 */
export function castOf(seats, know = 'none') {
  if (!(seats.length >= 2 && seats.length <= SEATS)) throw Error(`a group has from 2 to ${SEATS} agents, not ${seats.length}`);
  if (!KNOW.includes(know)) throw Error(`know: ${KNOW.join(', ')}`);
  return BASE.slice(0, seats.length).map((w, i) => {
    const extra = DISPOSITIONS.find(x => x.key === seats[i].personality), plain = typed(w, extra ? 'plain' : seats[i].personality);
    // A disposition's sentence stands where a trait sentence stands: after the opening, before "Choose as".
    const t = extra ? { ...plain, who: plain.who.replace(' Choose as', ` ${said(w, extra.text)} Choose as`) } : plain, g = goal(seats[i].goal);
    const own = g.text ? t.who.replace(' Choose as', ` ${said(w, g.text)} Choose as`) : t.who;
    const others = [];
    if (know !== 'none') {
      for (let j = 0; j < seats.length; j++) {
        if (j === i) continue;
        if (know === 'persona' || know === 'both') { const p = sentenceOf(j, seats[j].personality, 'personality'); if (p) others.push(p); }
        if (know === 'objective' || know === 'both') { const o = sentenceOf(j, seats[j].goal, 'goal'); if (o) others.push(o); }
      }
    }
    const who = others.length ? own.replace(/ Choose as (?:she|he) would\./, ` At the same loom: ${others.join(' ')} Choose as ${w.name} would.`) : own;
    return { ...t, temperature: 0.7, who };
  });
}

/** The sentence as seat `seat` is told it, for a personality or a goal key; '' when there is none. */
export function sentenceOf(seat, key, kind) {
  const text = (kind === 'goal' ? goal(key) : personality(key)).text;
  return text ? said(BASE[seat], text) : '';
}

/**
 * Weaves one match with the seats dealt. `ask` is a model's asker (Jev's, or a chat model's: `llm.mjs`), or null to
 * choose by chance. With `peers` and an `ask`, each move is asked again after the neighbour speaks (`peers.mjs`), and
 * the log of those decisions is `rug.peers`. `solo` is the one seat that decides (0 to 4), the rest being scripted as
 * `neighbours` says ('accept', 'refuse' or 'chance'); `area: 'fixed'` lets no boundary move, and `designs: 'chosen'`
 * lets the agents choose the palette and their first designs (`SWITCHES`). Returns the finished rug, with
 * `rug.conditions` and `rug.cost`.
 */
export async function play({ seats, seed, ask = null, onPass, peers = false, solo = null, neighbours = 'accept', area = 'free', designs = 'assigned', threshold = null, know = 'none' }) {
  // The claim threshold: the share of the loom, in percent, at which an agent is offered no further claims. The loom's
  // own is 46 for five agents (for fewer, the larger of 46 and an equal part plus 20); another can be given.
  if (threshold !== null && !(Number.isFinite(threshold) && threshold >= 30 && threshold <= 100)) throw Error('threshold: a share from 30 to 100 percent');
  if (threshold !== null && area === 'fixed') throw Error('with areas fixed nobody claims, so there is no claim threshold to set');
  if (!KNOW.includes(know)) throw Error(`know: ${KNOW.join(', ')}`);
  if (solo !== null && !(Number.isInteger(solo) && solo >= 0 && solo < SEATS)) throw Error(`solo: a seat from 0 to ${SEATS - 1}`);
  // A smaller group: every agent then starts with an equal part of the same loom (a third each for three), and the
  // share at which an agent is offered no further claims is the larger of 46% and that part plus 20 points
  // (engine/loom.mjs, `maxShare`: a threshold on the claims offered, not a limit on what an agent can end with).
  if (seats.length !== SEATS && (solo !== null || peers || designs === 'chosen')) throw Error('a group of fewer than five is run with every agent deciding, no peer communication and assigned designs');
  if (!NEIGHBOURS.includes(neighbours)) throw Error(`neighbours: ${NEIGHBOURS.join(', ')}`);
  if (solo === null && neighbours !== 'accept') throw Error('neighbours are scripted only in a solo match');
  if (!SWITCHES.area.includes(area)) throw Error(`area: ${SWITCHES.area.join(' or ')}`);
  if (!SWITCHES.designs.includes(designs)) throw Error(`designs: ${SWITCHES.designs.join(' or ')}`);
  // A placeholder keeps its design, so it must be given one.
  if (solo !== null && designs === 'chosen') throw Error('a solo match needs assigned designs: a placeholder chooses nothing');
  if (peers && solo !== null) throw Error('peer communication needs neighbours that decide, so it cannot be run solo');
  if (peers && area === 'fixed') throw Error('peer communication is about the action, and with fixed areas there is one action');
  const cast = castOf(seats, know), log = [], speaking = Boolean(peers && ask), count = { scripted: 0 }, cost = { dollars: null, requests: null, reasked: 0, unanswered: 0 };
  // What a chat model charges, and how many requests an answer took, are carried beside each of its answers; Jev's
  // cost is the loom's own count of tokens, and a Jev call is one request. OpenAI's decision model also says how many
  // questions of a call it refused and was asked again, and how many it never answered (bench/decisions.mjs); a chat
  // model read by stated chances says the same of replies that could not be read (bench/llm.mjs).
  const metered = ask && (async (body, put) => {
    const answers = await ask(body, put);
    if (answers.dollars != null) cost.dollars = (cost.dollars ?? 0) + answers.dollars;
    if (answers.requests != null) cost.requests = (cost.requests ?? 0) + answers.requests;
    if (answers.reasked) cost.reasked += answers.reasked;
    if (answers.unanswered) cost.unanswered += answers.unanswered;
    return answers;
  });
  let asker = speaking ? peerAsker(metered, { cast, seed, log }) : metered;
  if (solo !== null) asker = soloAsker(asker ?? chanceAsker(seed, count), solo, count, { neighbours, seed });
  const rug = await weave({
    seed, weavers: cast, ask: asker, minds: asker ? 'jev' : 'chance', model: ask ? ask.model ?? JEV.model : 'chance',
    simple: true, loom: { stepBacks: [], ...(area === 'fixed' ? { fixed: true } : {}), ...(threshold === null ? {} : { maxShare: threshold / 100 }) }, onPass, ...(designs === 'assigned' ? given() : {}),
  });
  if (speaking) rug.peers = log;
  rug.conditions = { agents: solo === null ? 'group' : 'solo', ...(solo === null ? {} : { solo, neighbours }), area, ...(threshold === null ? {} : { threshold }), ...(know === 'none' ? {} : { know }), ...(designs === 'chosen' ? { designs } : {}), ...(ask?.read ? { read: ask.read } : {}), ...(ask?.effort ? { effort: ask.effort } : {}) };
  rug.scripted = count.scripted;
  rug.cost = ask ? cost.dollars ?? rug.stats.dollars : 0;
  rug.requests = cost.requests;
  rug.reasked = cost.reasked;
  rug.unanswered = cost.unanswered;
  return rug;
}

const EPS = 1e-9, round1 = x => Math.round(x * 10) / 10;

/** Each seat's ground, scores (grow, give, hold, borrow), whether it reached each, and what it did, from the finished rug. */
export function scoresOf(rug) {
  const share = rug.history.at(-1).shares, n = share.length, rows = rug.history.filter(h => h.kind !== 'border');
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

/**
 * How a finished rug's loom is held beyond the agents' own shares, in percent of its width: `joint`, the ground two
 * agents hold together, and `bare`, warp nobody weaves. An agent's share (`ground`) is what it holds alone.
 */
export function heldOf(rug) {
  const bench = rug.history.at(-1)?.bench ?? [], wide = bench.reduce((s, g) => s + g.wide, 0) || 1;
  const part = test => round1(100 * bench.filter(test).reduce((s, g) => s + g.wide, 0) / wide);
  return { joint: part(g => Boolean(g.pair)), bare: part(g => g.who < 0 && !g.pair) };
}

/**
 * What is kept on disk for one match: the seats, each agent's result, the switches it was run under, the costs, and
 * the tape and loom that replay it. In a solo match the four scripted neighbours' results are marked `placeholder`,
 * and the tables leave them out (`stats.mjs`). With areas fixed, an agent whose objective is about share has no
 * `score`. `joint` is the part of the loom two agents hold together at the end, and `bare`, when there is any, the
 * part nobody weaves (`heldOf`); a record kept before these were added has neither.
 */
export function recordOf(rug, { id, match = null, seats }) {
  const conditions = rug.conditions ?? { agents: 'group', area: 'free' }, chance = rug.minds === 'chance' || rug.model === 'chance', held = heldOf(rug);
  return {
    // A rug woven by chance asked no model, whatever the engine's default model is called.
    loombench: 1, id, match, seed: rug.seed, model: chance ? 'chance' : rug.model, minds: chance ? 'chance' : rug.minds, seats,
    bench: rug.bench, name: rug.name,
    lot: rug.lot.name, joint: held.joint, ...(held.bare ? { bare: held.bare } : {}),
    results: scoresOf(rug).map(s => {
      // No score for an agent with no objective, for one whose objective is about share when no share can change, or
      // for a placeholder, which was told nothing.
      const { key } = goal(seats[s.seat].goal), placeholder = conditions.agents === 'solo' && s.seat !== conditions.solo;
      const unscored = key === 'none' || placeholder || (conditions.area === 'fixed' && SHARE_GOALS.includes(key));
      return {
        seat: s.seat, name: rug.weavers[s.seat].name, personality: seats[s.seat].personality, goal: key,
        ground: s.ground, scores: s.scores, met: s.met, did: s.did,
        score: unscored ? null : s.scores[key], reached: unscored ? null : s.met[key],
        ...(placeholder ? { placeholder: true } : {}),
      };
    }),
    // `calls` are the loom's calls that a model answered: one for each time an agent is asked, whatever number of
    // questions it holds. Calls answered for a placeholder, or by chance, asked no model and are not counted. A chat
    // model takes one request for each question, so its record also says how many `requests` the host answered; and a match
    // in which OpenAI's decision model refused questions says how many were asked again (`reasked`) and how many of
    // those it never answered, which were taken as no preference (`unanswered`).
    calls: rug.stats.calls.jev - (rug.scripted ?? 0), ...(rug.requests == null ? {} : { requests: rug.requests }), ...(rug.reasked ? { reasked: rug.reasked } : {}), ...(rug.unanswered ? { unanswered: rug.unanswered } : {}),
    fallbacks: rug.stats.calls.script, dollars: rug.cost ?? rug.stats.dollars, seconds: rug.stats.ms / 1000,
    loom: rug.loom, tape: rug.tape,
    mode: rug.peers ? 'peers' : 'quiet', ...(rug.peers?.length ? { peers: rug.peers } : {}), rules: RULES, conditions,
  };
}

/**
 * The switches a record was run under, in full: its model, whether personas and objectives were assigned ('dealt' when
 * they differ between agents, 'off' when nobody has one, or the one key everybody has; 'mixed' when the seats hold
 * two types that differ in it, with `mix` naming the group, as '4 cooperative + 1 greedy'), who decides, whether areas can
 * change, whether starting designs were assigned, and whether agents hear a neighbour. A record kept before a switch
 * existed reads as its default.
 */
export function conditionsOf(record) {
  // In a solo match the placeholders keep the persona and objective their seat was dealt, though nothing is asked as them.
  const mix = mixOf(record.seats);
  const one = (pick, off) => { const keys = [...new Set(record.seats.map(pick))]; return keys.length > 1 ? (mix ? 'mixed' : 'dealt') : keys[0] === off ? 'off' : keys[0]; };
  return {
    model: record.model, persona: one(s => s.personality, 'plain'), objective: one(s => s.goal, 'none'), ...(mix ? { mix } : {}),
    // How many agents the group has, when it is not the benchmark's five.
    ...(record.seats.length !== SEATS ? { size: record.seats.length } : {}),
    agents: record.conditions?.agents ?? 'group',
    ...(record.conditions?.agents === 'solo' ? { neighbours: record.conditions.neighbours ?? 'accept' } : {}),
    area: record.conditions?.area ?? 'free',
    // Under the first rules (a record with no `rules`) the agents always chose.
    designs: record.rules >= 2 ? record.conditions?.designs ?? 'assigned' : 'chosen', peers: record.mode === 'peers',
    ...(record.conditions?.read ? { read: record.conditions.read } : {}),
    ...(record.conditions?.effort ? { effort: record.conditions.effort } : {}),
    // The claim threshold in percent, when the match was not run at the loom's own.
    ...(record.conditions?.threshold ? { threshold: record.conditions.threshold } : {}),
    ...(record.conditions?.know ? { know: record.conditions.know } : {}),
  };
}

/** The record without its tape, loom and peer log: what an index lists. */
export function summaryOf(record) {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== 'tape' && k !== 'loom' && k !== 'peers'));
}

/** The rug again from its record, asking nobody. `onAsk` is shown every question as it was put (`weave`). */
export async function replay(record, { onAsk = null } = {}) {
  return weave({
    onAsk,
    seed: record.seed, weavers: castOf(record.seats, record.conditions?.know ?? 'none'), loom: record.loom, minds: record.minds, model: record.model,
    // A record kept under the first rules has no `rules`, and is woven again as it was: a voted lot, a chosen first design.
    ...(record.rules >= 2 && record.conditions?.designs !== 'chosen' ? given() : {}),
    // A match woven wholly by chance has nothing on its tape; a solo match by chance has its placeholders' answers there.
    ...(record.minds === 'chance' && record.conditions?.agents !== 'solo' ? {} : { tape: record.tape }),
  });
}
