/**
 * THE LOOM. One rug, woven from the bottom up by weavers sitting side by side at one wide loom, each holding a ground
 * of their own and each a mind of their own (`weavers.mjs`). Code decides what is possible and Jev decides what each
 * weaver wants: at every passage code writes out, from the cloth as it really stands, the moves open to a weaver and
 * the yarns they could weave, in words; the weaver's mind weighs them; and the draw is made from those weights.
 *
 * THEY ARGUE. Where two weavers want the same warps, how the argument ends is woven in (`JOINS`): an edge agreed is
 * dovetailed, one met halfway is hatched in both colours, one kept over an objection is left an open slit, one taken
 * back leaves a knot, and where both draw back bare warp shows.
 *
 * AND THEY COMBINE. A yarn is plied from strands (`cloth.mjs`), and every strand remembers whose it was. So a weaver
 * can take one thing from another's work and leave the rest: their pattern in her own colours, their colour in her own
 * pattern, their pattern laid over hers, or worked against hers until it is a structure neither had. And an argument
 * has a third way to end besides winning it and halving it (`PLIES`): the two hold the warps together in a yarn plied
 * from both, or the ground goes one way and a strand goes the other. Every yarn keeps where it came from (`ideas`), so
 * a finished rug can be read twice: by who held the ground, and by whose ideas are woven in it.
 *
 * A PASSAGE IS THREE BEATS, each one round of Jev calls made together. Everyone moves: what they do with their ground,
 * with what yarn, how hard, how fine. Whoever a move touches answers the move that was made, not one imagined. Whoever
 * was not simply told yes replies. Every raw answer is kept on the rug's `tape`, so a rug can be woven again exactly,
 * at any speed, without asking anyone (`weave({ tape })`).
 */
import { rng, draw, shuffled, pick, sureness, normalise, apart, topOf } from './rng.mjs';
import { JEV, unit } from './jev.mjs';
import { BENCH, NEUTRAL_WHO, said } from './weavers.mjs';
import { newCloth, MARK, GUILD, SHARED, DYE_LOTS, UNDYED, DARK, KEPT_BACK, FILLS, PATTERNS, FIGURES, BANDS, strand, copyYarn, sized, coloursOf, mindsOf, lookOf, sameLook, stitchOf, figureAt, yarnName, reachOf } from './cloth.mjs';

export const LOOM = Object.freeze({
  warps: 108, guard: 4,    // The rug's width in warps, and the guard stripe up each side.
  rows: 6, passes: 26,     // A passage is this many rows; the field this many passages.
  band: 9,                 // Rows in the border at each end.
  maxShare: 0.46,          // The loom's law: nobody is offered more ground once they hold this much of the field.
  refuse: 0.58,            // Where along REACT a weaver will not have what the guild's caller proposes.
  combine: true,           // Whether weavers may take from each other's yarns and hold ground together, or only argue.
  simple: false,           // The plain game: see `SIMPLE` below.
  councilTemperature: 0.35,
  stepBacks: [9, 18],      // Before these passages the guild steps back and looks at the whole.
  lotsOffered: 4, bandsOffered: 5, namesOffered: 6, movesOffered: 8,
  yarnsOffered: 6, crossOffered: 3,   // Yarns a weaver is offered, and how many of them may take from another's.
  settle: 2,               // Pacing is code's: a yarn newly taken up is woven this many passages before its weaver thinks again.
  together: false,         // One cloth, decided together: nobody has a ground, and the guild decides what goes in every place (`together`).
  places: 0,               // In that game, how many places a row has side by side (set from the bench).
  plan: false,             // In that game, whether the guild agrees a plan for the whole rug before the first row (`PLANS`).
  // In that game, how a row of decisions is cut into cloth: `blocks`, every block the same square; or `free`, where what
  // the room wanted more gets more of the cloth and no block is square (`weaveFree`).
  cut: 'blocks',
  plansOffered: 5,
  // How much of the plan is said at a decision: `full` (the question says what the plan wants there, and every option says
  // whether it keeps or breaks it), `unlabelled` (the question says it, the options do not), or `context` (the plan is in
  // the state every weaver is shown and nowhere else). For telling the plan's own effect from that of being reminded of it.
  planSay: 'full',
  fixedCaller: false,      // Under `caller`, whether one weaver calls every block (the seed's caller) or the call moves along the bench.
  // Whether they talk before a row is decided (`speech`): each weaver is asked alone where they lean, each then says in a
  // sentence what they want of the row and why, hearing those who spoke before, and all are asked again with what was
  // said in front of them. And whoever will not have a proposal says why, and its proposer hears that before answering.
  deliberate: false,
  // Whether a weaver asked again is shown what they said themselves as well as what the others said. Off where the
  // words were put in their mouth, so that nobody is told they said what they would not have.
  hearSelf: true,
});

/**
 * THE PLAIN GAME (`simple: true`). The same loom with the ornament taken off, so that every choice is one anybody can
 * picture. A weaver's turn is one of: weave on; take space from a neighbour; give a neighbour space; offer a neighbour
 * a piece to work on together. Their yarn is kept, begun again from the pot, stripped to plain, or made from a
 * neighbour's: their pattern, one of their colours, or the whole of it. Someone whose space is being taken accepts,
 * refuses, or proposes sharing it; someone refused insists, backs down, or meets halfway. No figures, no bare warp, no
 * diamonds, no pattern laid over or worked against another, no ground for a strand. It is the game for asking a plain
 * question of the minds, and for telling someone else what was found.
 */
export const SIMPLE = Object.freeze({
  carry: 'keep working on their own piece', push: 'take space from a neighbour', yield: 'give a neighbour space', offer: 'offer a neighbour a piece to work on together',
  keep: 'keep their design', pattern: 'borrow a neighbour\'s pattern', colour: 'borrow a neighbour\'s colour', whole: 'copy a neighbour\'s design', new: 'start a new design', plain: 'strip their design back to one colour',
  pass: 'accept it', refuse: 'say no', share: 'propose sharing the space instead', back: 'back down', half: 'meet halfway', take: 'accept the offer to share', hold: 'hold firm', give: 'give way', decline: 'decline',
});

/** How a thing is taken, how hard a weaver goes at it, how fine they want their pattern: the anchors of the scores. */
export const REACT = ['is glad of it', 'lets it pass', 'minds it', 'will not have it'];
export const BOLD = ['a thread at a time', 'steadily', 'firmly', 'all at once'];
export const FINE = ['broad and calm', 'even and easy to read', 'fine', 'as fine as the loom allows'];

/** What each join means, for whoever reads the cloth. */
export const JOINS = Object.freeze({
  dovetail: 'agreed: the two yarns step into each other',
  plain: 'let pass: a straight meeting',
  hatch: 'met halfway: woven in both colours',
  slit: 'kept over an objection, or a standoff: an open slit',
  knot: 'taken back: a knot marks the place',
});
/** What one cloth decided together shows when it is cut free (`weaveFree`), for whoever reads the cloth. */
export const FREE_CUT = Object.freeze({
  'A deep row': 'the room was agreed on it; a row it fought over is cut short',
  'A wide block': 'the room wanted it; one it wanted less is narrow, and begins late',
  'A figure in a block': 'the room wanted that design more than the one woven there',
  'Dark line round it': 'the block was kept over an objection',
});
/** What each way of combining leaves in the cloth. */
export const PLIES = Object.freeze({
  taken: 'a strand taken: one weaver\'s pattern or colour in another\'s yarn',
  shared: 'held together: a ground between two weavers, in a yarn plied from both',
  trade: 'ground for a strand: the edge moved one way, the pattern the other',
  joint: 'a figure of two hands: one weaver\'s shape, the other\'s pattern inside it',
});
/** How a yarn can be come by (`ideas[].how`), in a few words. */
export const HOWS = Object.freeze({
  new: 'started from the pot', plain: 'the pattern put aside', drop: 'a strand left out', turn: 'turned inside out', more: 'a pattern of their own added',
  pattern: 'a pattern taken', colour: 'a colour taken', over: 'a pattern laid over their own', counter: 'a pattern worked against their own', whole: 'taken up whole',
  trade: 'a strand taken for ground', shared: 'plied for a ground held together',
});

/** The ways the guild decides something for the whole rug. */
export const WAYS = Object.freeze({
  propose: { name: 'Propose and answer', words: 'The caller proposes. The others say how they take it. Refused, the caller keeps to it, gives way to the room, or takes what nobody minds.' },
  vote: { name: 'Vote', words: 'Everyone\'s weights are added together and the choice is drawn from the sum.' },
  consensus: { name: 'Consensus', words: 'Everyone\'s weights are multiplied together, so one strong no sinks an option.' },
  caller: { name: 'The caller\'s day', words: 'One weaver decides for all. Who it is changes with the seed.' },
});

const SIDE = { L: 'left', R: 'right' }, OTHER = { L: 'R', R: 'L' };
const cap = s => s[0].toUpperCase() + s.slice(1);
const times = n => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const list = names => (names.length < 2 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
const warps = n => `${n} warp${n === 1 ? '' : 's'}`;

/* ------------------------------------------------------------------------------------------------ the rug's state */

function setup(o) {
  const weavers = o.weavers ?? BENCH, n = weavers.length, seed = o.seed ?? 1, decider = o.decider ?? null;
  // A bench longer than five needs a wider loom, and a short one must let each weaver hold more of it than five may.
  const L = Object.freeze({ ...LOOM, warps: Math.max(LOOM.warps, 2 * LOOM.guard + 20 * n), maxShare: Math.min(0.9, Math.max(LOOM.maxShare, 1 / n + 0.2)),
    // Decided together, a row is one decision for every place in it: fewer, deeper rows, and a design is thought about afresh for each.
    // A tape kept before the cut could be free says nothing of the cut, and is woven again in the blocks it was woven in.
    ...(o.together ?? o.loom?.together ? { together: true, passes: 8, rows: 20, stepBacks: [], settle: 1, places: Math.max(3, Math.min(6, n)), plan: o.plan ?? true, cut: o.tape ? 'blocks' : 'free' } : {}), ...(o.loom ?? {}), ...(o.combine == null ? {} : { combine: !!o.combine }), ...(o.simple == null ? {} : { simple: !!o.simple }) });
  const W = L.warps, H = 2 * L.band + L.passes * L.rows, way = WAYS[o.way] ? o.way : 'propose';
  return {
    L, seed, n, weavers, way, decider, deciderMood: decider?.moods?.length ? pick(decider.moods, rng(seed, 'mood', decider.key)) : '', minds: o.minds ?? (o.ask || o.tape ? 'jev' : 'chance'), temperature: o.temperature ?? null,
    ask: o.ask ?? null, speak: o.speak ?? null, replay: o.tape ?? null, tape: {}, model: o.model ?? JEV.model, now: o.now ?? (() => performance.now()),
    cloth: newCloth(W, H), y: 0, pass: -1, x0: L.guard, x1: W - L.guard, field: W - 2 * L.guard,
    lot: null, pot: [], band: null, name: null, grounds: [], edges: [], figures: [], knots: [], below: null, placed: weavers.map(() => 0), plan: null, plans: [], vision: weavers.map(() => null), grid: [], cut: null,
    // What each weaver weaves with, the idea it is (`ideas`), and how many strands each has had from each other.
    yarn: Array(n).fill(null), node: Array(n).fill(-1), ideas: [], took: weavers.map(() => Array(n).fill(0)), unison: null, unisonNext: null, reach: null,
    used: new Float64Array(8), kept: Array(n).fill(0), same: Array(n).fill(0), lastMove: Array(n).fill(''), spell: null, truce: false,
    tally: weavers.map(() => ({ pressed: 0, refused: 0, gave: 0, kept: 0, overruled: 0, planted: 0, out: 0, took: 0, lent: 0, shared: 0 })),
    pair: weavers.map(() => weavers.map(() => ({ pressed: 0, kept: 0 }))),
    joins: { dovetail: 0, plain: 0, hatch: 0, slit: 0, knot: 0, standoff: 0, bare: 0, figure: 0, fenced: 0, shut: 0, out: 0, taken: 0, shared: 0, trade: 0, joint: 0, declined: 0, closed: 0, unison: 0 },
    fresh: weavers.map(() => []), next: weavers.map(() => []),
    record: [], history: [], entry: null, calls: { jev: 0, script: 0, chance: 0, ms: 0, tokens: 0 },
    moods: weavers.map(w => pick(w.moods, rng(seed, 'mood', w.key))), caller: Math.floor(rng(seed, 'caller')() * n),
    onPass: o.onPass ?? (() => {}), onAsk: o.onAsk ?? null,
    // What a rug may be given and not asked: its dye lot (a key of `DYE_LOTS`), the dyes in its pot, and a yarn each weaver starts with.
    given: { lot: o.lot ?? null, pot: o.pot ?? null, starts: o.starts ?? null },
  };
}

const temp = (S, w) => S.temperature ?? (S.decider ?? S.weavers[w]).temperature;
const benchWords = S => (S.n === 1 ? 'one weaver alone at it' : `${S.n} weavers side by side`);
const groundOf = (S, w) => S.grounds.findIndex(g => g.who === w);
const width = (S, k) => Math.round(S.edges[k + 1].x) - Math.round(S.edges[k].x);
/** A ground is a weaver's own (`who` their place on the bench), bare warp that nobody weaves, or one two weavers hold together (`pair`). */
const isBare = g => g.who === GUILD, isShared = g => g.who === SHARED;
const partner = (g, w) => g.pair.find(x => x !== w);
const yarnOf = (S, g) => (isBare(g) ? g.yarn : S.unison ?? g.yarn ?? S.yarn[g.who]);
const nm = (S, w) => S.weavers[w].name, her = (S, w) => (S.weavers[w].she ? 'her' : 'his'), she = (S, w) => (S.weavers[w].she ? 'she' : 'he');
/** A ground by name, as weaver `me` would say it. */
const nameOf = (S, g, me = -1) => (g.who >= 0 ? nm(S, g.who) : isBare(g) ? 'the bare warp' : g.pair.includes(me) ? `the ground you hold with ${nm(S, partner(g, me))}` : `the ground ${nm(S, g.pair[0])} and ${nm(S, g.pair[1])} hold together`);
const holder = (S, g) => (g.who >= 0 ? nm(S, g.who) : isBare(g) ? 'bare warp' : `${nm(S, g.pair[0])} and ${nm(S, g.pair[1])} together`);

const yarnWords = (S, y) => yarnName(S.lot.dyes, y);
const fillWords = s => FILLS[s.fill].words;

/** ", the widest ground on the loom" for the ground that is, among the weavers' own; nothing for the rest. */
function rank(S, k) {
  const ws = S.grounds.map((g, i) => (g.who >= 0 ? width(S, i) : null)).filter(x => x !== null), mine = width(S, k);
  if (ws.length < 3) return '';
  if (mine === Math.max(...ws) && ws.filter(x => x === mine).length === 1) return ', the widest ground on the loom';
  if (mine === Math.min(...ws) && ws.filter(x => x === mine).length === 1) return ', the narrowest ground on the loom';
  return '';
}

/** Something happened: kept for the story and the page, and said back to those it touched before their next turn. */
function note(S, kind, who, text) {
  S.entry.events.push({ pass: S.pass, kind, who, text });
  for (const w of who) if (w >= 0) S.next[w].push(text);
}
/** A weaver says one of their own authored lines. */
function say(S, w, key) {
  const text = (w < 0 ? S.decider : S.weavers[w]).says[key];
  if (text && (w < 0 || !S.decider)) S.entry.said.push({ pass: S.pass, who: w, key, text });
}

/**
 * A yarn newly on the loom, kept with where it came from: who weaves it (`who`, two for a ground held together), how
 * it was come by (`HOWS`), whose yarn it took from (`lender`), and the yarns it was made of (`from`, as they stood in
 * `nodes` when it was made). The whole of a rug's `ideas` is the family tree of its cloth.
 */
function idea(S, who, yarn, how, lender = -1, text = '', nodes = S.node) {
  const from = [...new Set([...who.map(w => nodes[w]), lender >= 0 ? nodes[lender] : -1].filter(i => i >= 0))];
  S.ideas.push({ id: S.ideas.length, pass: S.pass, who, yarn: copyYarn(yarn), how, lender, from, text, minds: [...mindsOf(yarn)] });
  return S.ideas.length - 1;
}
/** Weaver `w` takes up `yarn`. If it took from `lender`'s, that is counted between the two of them and said to both. */
function setYarn(S, w, yarn, how, lender = -1, told = '', nodes = S.node) {
  const node = idea(S, [w], yarn, how, lender, told, nodes);
  S.yarn[w] = yarn; S.node[w] = node; S.kept[w] = 1;
  if (lender < 0 || lender === w) return;
  S.took[w][lender]++; S.tally[w].took++; S.tally[lender].lent++; S.joins.taken++;
  S.entry.links.push({ from: lender, to: w, how, node });
  if (told) { note(S, 'ply', [w, lender], told); say(S, w, 'take'); }
}

/* --------------------------------------------------------------------------------------------------------- minds */

/**
 * One call to weaver `w`'s mind: `questions` ({ key: { ask, options: [{ key, text }] } } a choice, { ask, anchors } a
 * score), over `state`. The persona and the day's mood go before every question (influence said in the question moves
 * a choice; said in the state it is read as identity and barely does). The options of a choice are listed in an order
 * drawn from this call's own stream, since a mind leans to the first thing written. Never rejects: a late, malformed or
 * missing answer is replaced by the stream's own, and marked so.
 */
async function mind(S, w, id, questions, state) {
  const D = S.decider, me = w < 0 ? D : S.weavers[w], sub = rng(S.seed, 'mind', id), started = S.now();
  // With one decider every question goes to that mind, about the weaver whose hands it is.
  const who = S.minds === 'neutral' ? NEUTRAL_WHO : !D ? `${me.who} ${S.moods[w]}`
    : `${D.who} ${S.deciderMood}${me.key === D.key ? '' : ` Today the whole bench weaves as ${D.name} directs, and ${D.name} is deciding for ${me.name}: in the options, "you" is ${me.name} at ${me.she ? 'her' : 'his'} place on the bench.`}`;
  const body = { model: S.model, state, questions: {} }, order = {};
  for (const [k, q] of Object.entries(questions)) {
    const instructions = `${who} ${said(me, q.ask)}`;
    if (q.options) {
      order[k] = shuffled(q.options, sub);
      body.questions[k] = { type: 'choice', instructions, criteria: Object.fromEntries(order[k].map((o, i) => [`o${i + 1}`, said(me, o.text)])) };
    } else body.questions[k] = { type: 'score', instructions, criteria: q.anchors.map(a => said(me, a)) };
  }
  // Whoever is studying the minds is shown every question as it is asked, with what kind of question it is, whom it is
  // about, and what each option would do and to whom: enough to ask the same thing again of a mind changed in one respect,
  // or of another model altogether (`persona` and each `ask` are the words of the request, apart, for one that is spoken to differently).
  const put = { id, who: w, body, persona: who, asked: Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, { what: q.what ?? k, about: q.about ?? -1, ask: said(me, q.ask), options: q.options ? order[k].map(o => ({ key: o.key, kind: o.kind ?? null, act: o.act ?? null, to: o.to ?? (o.from >= 0 ? o.from : -1) })) : null }])) };
  if (S.onAsk) S.onAsk(put);
  let answers = null, by = 'chance', why = '';
  if (S.replay) { answers = S.replay[id] ?? null; by = answers ? 'jev' : 'script'; why = answers ? '' : 'not on the tape'; }
  else if (S.minds !== 'chance') {
    by = 'script';
    if (!S.ask) why = 'no Jev';
    else try { answers = await S.ask(body, put); by = 'jev'; S.calls.tokens += answers.tokens ?? Math.round(JSON.stringify(body).length / 4); } catch (e) { why = String(e?.message ?? e).slice(0, 80); }
  }
  S.tape[id] = answers;
  const ms = Math.round(S.now() - started);
  S.calls[by]++; S.calls.ms += by === 'jev' && !S.replay ? ms : 0;
  const out = { id, by, why, ms, who: w, state, asked: {} };
  for (const [k, q] of Object.entries(questions)) {
    out.asked[k] = body.questions[k].instructions.slice(who.length + 1);
    if (q.options) {
      const listed = Object.fromEntries(order[k].map((o, i) => [o.key, i + 1]));
      // Jev's weights arrive rounded to two places; made a true distribution again before anything is drawn from them.
      const p = normalise(Object.fromEntries(q.options.map(o => [o.key, answers ? answers[k].probabilities[`o${listed[o.key]}`] : 1])));
      out[k] = { p, listed, top: answers ? order[k][Number(answers[k].choice.slice(1)) - 1].key : null, sure: answers ? sureness(p) : 0, r: sub() };
    } else {
      const u = answers ? unit(answers[k], q.anchors.length) : null;
      out[k] = { u: u ?? sub(), anchors: q.anchors.map(a => said(me, a)) };
    }
  }
  return out;
}

/**
 * A choice as the record keeps it: every option with its weight and where it was listed, the one drawn, the mind's own
 * top. An option that would make a yarn keeps the yarn, so the page can show every road not taken as cloth.
 */
const kept = (options, a, chose) => ({ chose, top: a.top, sure: a.sure, options: options.map(o => ({ key: o.key, text: o.text, p: a.p[o.key], listed: a.listed[o.key],
  ...(o.kind ? { kind: o.kind } : {}), ...(o.yarn ? { yarn: o.yarn } : {}), ...(o.from >= 0 ? { from: o.from } : {}) })) });

/* ------------------------------------------------------------------------------------------- what a weaver is shown */

function clothWords(S) {
  const j = S.joins, total = S.used.reduce((s, x) => s + x, 0), bits = [], n = (k, one) => `${k} ${one}${k === 1 ? '' : 's'}`;
  if (j.slit + j.standoff) bits.push(n(j.slit + j.standoff, 'open slit'));
  if (j.hatch) bits.push(`${n(j.hatch, 'edge')} woven in two colours`);
  if (j.figure) bits.push(`${n(j.figure, 'figure')} planted`);
  if (j.shared) bits.push(`${n(j.shared, 'ground')} opened between two weavers to hold together`);
  if (j.taken) bits.push(`${n(j.taken, 'strand')} taken from one weaver's yarn into another's`);
  const bare = total ? Math.round(100 * S.cloth.bare / total) : 0;
  if (bare >= 2) bits.push(`bare warp over ${bare}% of the cloth`);
  return bits.length ? `So far the cloth has ${list(bits)}.` : S.pass ? 'So far nothing in the cloth has been argued over.' : 'Nothing is woven yet but the border.';
}

function stateFor(S, w) {
  const total = S.used.reduce((s, x) => s + x, 0), k = groundOf(S, w);
  const pot = S.pot.map(d => `${S.lot.dyes[d].name}${total ? ` ${Math.round(100 * S.used[d] / total)}%` : ''}`).join(', ');
  return {
    loom: `One rug on a shared loom, ${benchWords(S)}. Passage ${S.pass + 1} of ${S.L.passes}; the field is ${S.field} warps across.`,
    bench: `Left to right, in warps held: ${S.grounds.map((g, i) => `${holder(S, g)} ${width(S, i)}`).join(', ')}.`,
    // How long each has woven it is said too: to some weavers a pattern is worth taking up only once it has lasted.
    ...(S.n > 1 && S.yarn.some(Boolean) ? { yarns: `What each weaves now, left to right: ${S.grounds.filter(g => !isBare(g) && yarnOf(S, g)).map(g => `${holder(S, g)}, ${yarnWords(S, yarnOf(S, g))}${g.who >= 0 && S.kept[g.who] > 2 ? ` (for ${S.kept[g.who]} passages)` : ''}`).join('; ')}.` } : {}),
    yours: k < 0 ? 'You hold no ground: you were squeezed off the bench.'
      : `Your ground is ${width(S, k)} warps${rank(S, k)}, in ${yarnWords(S, S.yarn[w])}${S.kept[w] > 1 ? `, kept for ${S.kept[w]} passages` : ''}.`,
    pot: `The dyes in the pot${total ? ', and how much of the cloth each is so far' : ''}: ${pot}.`,
    cloth: clothWords(S),
  };
}

/**
 * What a weaver carries into the question: what just happened to them, how the rug has gone for them, a rut they are
 * in. These are the facts a persona's conditions turn on (pushed too often, the same yarn for a long while, a hand that
 * reaches further than its ground), and they are said in the question because that is where a fact moves a choice.
 */
function memory(S, w) {
  const bits = S.fresh[w].slice(-3).map(t => `Last passage: ${t}`), t = S.tally[w], pc = x => Math.round(100 * x);
  if (t.gave + t.overruled) bits.push(`In this rug {N} has given way ${times(t.gave)} and been overruled ${times(t.overruled)}.`);
  if (t.took + t.lent) bits.push(`{N} has taken from another weaver's yarn ${times(t.took)}, and others have taken from {P} ${times(t.lent)}.`);
  if (S.reach && Math.abs(S.reach.held[w] - S.reach.reach[w]) >= 0.08) bits.push(`{N} holds ${pc(S.reach.held[w])}% of the cloth woven so far, and ${pc(S.reach.reach[w])}% of it is of {P} devising.`);
  if (S.plan && S.plan.over == null && S.grid.length) {
    const woven = S.grid.length * S.L.places, wish = S.vision[w];
    bits.push(wish === S.plan.key ? `The plan is the rug {N} wanted, and ${S.plan.kept} of the ${woven} blocks woven keep to it.`
      : `{N} wanted another rug than the plan: ${PLANS[wish].text}. ${fitOf(S, wish)} of the ${woven} blocks woven would suit it as they stand.`);
  }
  if (S.kept[w] >= 4) bits.push(`{N} has woven the same yarn for ${S.kept[w]} passages.`);
  if (S.same[w] >= 3) bits.push(`{N} has made the same move ${S.same[w]} passages running.`);
  return bits.length ? `${bits.join(' ')} ` : '';
}

/** Whether a figure is still being woven in `host`'s ground. */
const busy = (S, host) => S.figures.some(f => f.host === host && S.y < Math.min(f.until, f.y0 + f.rows));

/** The moves open to weaver `w` this passage, each written from the cloth as it stands. */
function moveOffer(S, w, rnd) {
  const L = S.L, k = groundOf(S, w), out = [], pool = [];
  const rowsLeft = (L.passes - S.pass) * L.rows - 2;
  const hosts = S.grounds.map((g, i) => ({ g, i, wide: width(S, i) })).filter(h => h.g.who >= 0 && h.g.who !== w && h.wide >= 9 && !busy(S, h.g.who));
  const plant = h => {
    const kind = pick(Object.keys(FIGURES), rnd), yarn = S.yarn[h.g.who];
    return { key: `plant:${S.weavers[h.g.who].key}`, kind: 'plant', host: h.g.who, to: h.g.who, figure: kind,
      text: `Plant ${FIGURES[kind].words} of your own in the middle of ${nm(S, h.g.who)}'s ground: ${h.wide} warps${yarn ? ` of ${yarnWords(S, yarn)}` : ', not yet begun'}${rank(S, h.i)}.` };
  };
  // Pacing is code's: nobody plants two passages running, and nothing is planted that could not be finished.
  const rested = !['plant', 'own'].includes(S.lastMove[w]);
  const plants = !L.simple && rowsLeft >= 6 && rested ? shuffled(hosts, rnd).sort((a, b) => b.wide - a.wide).slice(0, 2).map(plant) : [];

  if (k < 0) {
    // Off the bench: sit down again at an edge (the guild's law: nobody is refused a seat), plant in someone's ground, or watch.
    const free = S.edges.map((e, i) => ({ e, i })).filter(({ i }) => ![S.grounds[i - 1], S.grounds[i]].some(g => g && isShared(g)));
    const seats = shuffled(free, rnd).slice(0, 3).map(({ e, i }) => {
      const a = S.grounds[i - 1], b = S.grounds[i];
      return { key: `sit:${i}`, kind: 'rejoin', edge: e, text: `Sit down again ${a && b ? `between ${nameOf(S, a)} and ${nameOf(S, b)}` : `at the ${a ? 'right' : 'left'} selvedge, beside ${nameOf(S, a ?? b)}`}: a new ground of your own, a few warps wide, opened at that edge.` };
    });
    return [...seats, ...plants, { key: 'watch', kind: 'watch', text: 'Stay off the bench for this passage and watch the others weave.' }].slice(0, L.movesOffered);
  }

  const mine = width(S, k), beside = { L: S.grounds[k - 1] ?? null, R: S.grounds[k + 1] ?? null };
  const at = s => (beside[s] ? nameOf(S, beside[s], w) : `the ${SIDE[s]} selvedge`), ki = s => (s === 'L' ? k - 1 : k + 1);
  const mayGrow = mine + 2 <= L.maxShare * S.field, mayGive = mine >= 6, still = !!S.spell;
  out.push({ key: 'carry', kind: 'carry', text: still ? `Weave straight on while the bench is put even: your ground is ${mine} warps, between ${at('L')} and ${at('R')}.`
    : `Weave straight on. Keep both your edges where they are: ${mine} warps between ${at('L')} and ${at('R')}.` });
  if (!still) {
    for (const s of ['L', 'R']) {
      const g = beside[s]; if (!g) continue;
      const theirs = width(S, ki(s));
      if (isBare(g)) { if (mayGrow) out.push({ key: `push${s}`, kind: 'push', side: s, text: `Weave out over the bare warp on your ${SIDE[s]}: ${theirs} warps that nobody holds.` }); continue; }
      if (isShared(g)) {
        // Beside a ground held with another, a weaver's own edge of it is theirs to move: more of their own given to it, or some of it taken back.
        const them = nm(S, partner(g, w));
        if (mayGive) pool.push({ key: `yield${s}`, kind: 'yield', side: s, to: partner(g, w), act: 'feed', text: `Give more of your own ground to the one you hold with ${them} on your ${SIDE[s]}: what the two of you weave together widens. It is ${warps(theirs)} wide now.` });
        if (mayGrow) pool.push({ key: `push${s}`, kind: 'push', side: s, to: partner(g, w), act: 'unfeed', text: `Take back some of the ground you hold with ${them} on your ${SIDE[s]}, into your own. It is ${warps(theirs)} wide now; you hold ${mine} of your own.` });
        continue;
      }
      const them = nm(S, g.who);
      if (mayGrow) out.push({ key: `push${s}`, kind: 'push', side: s, to: g.who, text: `Press into ${them}'s ground on your ${SIDE[s]} and take some of it. ${them} holds ${theirs} warps${rank(S, ki(s))}; you hold ${mine}${rank(S, k)}.` });
      if (mayGive) pool.push({ key: `yield${s}`, kind: 'yield', side: s, to: g.who, text: `Give ${them} some of your ground on your ${SIDE[s]}, freely. You hold ${mine} warps${rank(S, k)}; ${them} holds ${theirs}${rank(S, ki(s))}.` });
      if (L.combine && !S.decider && mine >= 8 && S.yarn[w] && S.yarn[g.who] && !sameLook(S.yarn[w], S.yarn[g.who]))
        pool.push({ key: `offer${s}`, kind: 'offer', side: s, to: g.who, text: `Offer ${them} a ground to hold together, on your ${SIDE[s]}: you give some of your own warps to start it, and it is woven in a yarn plied from both of yours.` });
    }
    if (mayGive && !L.simple) { const s = rnd() < 0.5 ? 'L' : 'R'; if (!beside[s] || beside[s].who >= 0) pool.push({ key: `bare${s}`, kind: 'bare', side: s, text: `Draw in on your ${SIDE[s]} and leave bare warp showing between you and ${at(s)}: a strip that nobody weaves.` }); }
    if (!L.simple && beside.L && beside.R && mine + 4 <= L.maxShare * S.field) pool.push({ key: 'swell', kind: 'swell', text: `Swell on both sides at once, into ${at('L')} and into ${at('R')}: the start of a diamond.` });
    if (!L.simple && beside.L && beside.R && mine >= 10) pool.push({ key: 'gather', kind: 'gather', text: `Draw in on both sides and let ${at('L')} and ${at('R')} close in: your ground narrows toward a point.` });
  }
  pool.push(...plants);
  if (!L.simple && rowsLeft >= 6 && rested && mine >= 9 && !busy(S, w)) {
    const kind = pick(Object.keys(FIGURES), rnd);
    pool.push({ key: 'own', kind: 'own', figure: kind, text: `Weave ${FIGURES[kind].words} into the middle of your own ground, in a colour that stands out from it.` });
  }
  const theirs = S.figures.find(f => f.host === w && f.who !== w && Math.min(f.until, f.y0 + f.rows) - S.y >= 3);
  if (theirs) out.push({ key: 'shut', kind: 'shut', figure: theirs, text: `Weave shut the figure ${nm(S, theirs.who)} planted in your ground, before it is finished: it would end as a flat stump.` });
  return [...out, ...shuffled(pool, rnd).slice(0, Math.max(0, L.movesOffered - out.length))];
}

/**
 * One yarn taking from another, the ways a weaver can: `pattern` (their structure, in my colours), `colour` (my
 * structure, with a colour of theirs in place of one of mine: `slot` says which), `over` (their structure laid over
 * mine as a third thing), `counter` (their structure worked against mine, in my two colours), `whole` (theirs as it
 * stands). Null where there is nothing to take that way. A structure newly taken has no scale yet: the hand that weaves
 * it sets how fine. Returns the yarn, and the strand (`tp`) or colour (`c`, in place of `old`) that was taken.
 */
function taken(S, mine, theirs, kind, me, slot = 'p') {
  const [p, q] = mine.strands, out = copyYarn(mine), tp = theirs.strands.find(s => s.fill !== p?.fill && s.fill !== q?.fill) ?? null;
  if (kind === 'whole') return { yarn: copyYarn(theirs) };
  if (kind === 'colour') {
    const has = coloursOf(mine), c = [[theirs.a, theirs.aBy], ...theirs.strands.filter(s => !s.counter).map(s => [s.dye, s.dyeBy])].find(([dye]) => !has.includes(dye));
    if (!c) return null;
    if (!p || slot === 'a') { out.a = c[0]; out.aBy = c[1]; return { yarn: out, c: c[0], old: mine.a }; }
    for (const s of out.strands) if (s.dye === p.dye) { s.dye = c[0]; s.dyeBy = c[1]; }
    return { yarn: out, c: c[0], old: p.dye };
  }
  if (!tp) return null;
  // The colour a strand of theirs takes in my yarn: its own if that shows against mine, else their ground's, else the dark or the pale.
  const has = coloursOf(mine), c = [tp.counter ? null : tp.dye, theirs.a, DARK, UNDYED].find(dye => dye != null && !has.includes(dye)), cBy = c === tp.dye ? tp.dyeBy : c === theirs.a ? theirs.aBy : me;
  if (kind === 'pattern') {
    if (!p && c == null) return null;
    if (p) out.strands[0] = { ...p, fill: tp.fill, s: 0, by: tp.by }; else out.strands = [strand(tp.fill, c, tp.by, cBy)];
    return { yarn: out, tp, c: p ? p.dye : c };
  }
  if (!p || q) return null;
  if (kind === 'counter') { out.strands.push(strand(tp.fill, p.dye, tp.by, p.dyeBy, { counter: true })); return { yarn: out, tp }; }
  if (kind === 'over' && c != null) { out.strands.push(strand(tp.fill, c, tp.by, cBy, { thin: true })); return { yarn: out, tp, c }; }
  return null;
}

/** A taking in words: the option as the weaver reads it (`text`), and what is said of it afterwards (`told`, of {N}). */
function crossWords(S, kind, t, mine, x, where) {
  const d = S.lot.dyes, X = nm(S, x), p = mine.strands[0], own = p ? fillWords(p) : `plain ${d[mine.a].name}`;
  if (kind === 'whole') return { text: `Weave exactly what ${X} weaves ${where}: ${yarnName(d, t.yarn)}. ${where === 'beside you' ? 'The edge between you would all but disappear' : 'The two sides of the rug would answer each other'}.`,
    told: `{N} took up ${X}'s yarn whole, and their two grounds rhymed.` };
  if (kind === 'pattern') return { text: p ? `Take the ${fillWords(t.tp)} from ${X}'s ground ${where}, and weave them in your own ${d[mine.a].name} and ${d[p.dye].name}.`
    : `Take the ${fillWords(t.tp)} from ${X}'s ground ${where} into your plain ${d[mine.a].name}, in ${d[t.c].name}.`, told: `{N} took the ${fillWords(t.tp)} from ${X}'s ground into {P} own colours.` };
  if (kind === 'over') return { text: `Lay ${X}'s ${fillWords(t.tp)} over your own ${own}, in ${d[t.c].name}: both patterns showing at once, in three colours.`, told: `{N} laid ${X}'s ${fillWords(t.tp)} over {P} own ${own}.` };
  if (kind === 'counter') return { text: `Work ${X}'s ${fillWords(t.tp)} against your own ${own}: wherever the two cross, your ${d[mine.a].name} and ${d[p.dye].name} change places.`,
    told: `{N} worked ${X}'s ${fillWords(t.tp)} against {P} own ${own}: a pattern neither of them had.` };
  return { text: `${p ? `Keep your ${own}, but take` : 'Take'} ${X}'s ${d[t.c].name} from ${where} in place of your ${d[t.old].name}: ${yarnName(d, t.yarn)}.`, told: `{N} took ${X}'s ${d[t.c].name} into {P} own yarn.` };
}

/** The same takings as `crossWords`, said where nobody holds a ground: what is taken is taken from a design on the table. */
function tableWords(S, kind, t, mine, x) {
  const d = S.lot.dyes, X = nm(S, x), p = mine.strands[0], own = p ? fillWords(p) : `plain ${d[mine.a].name}`;
  if (kind === 'whole') return { text: `Put forward exactly ${X}'s design as your own: ${yarnName(d, t.yarn)}. The two of you would be asking for the same thing.`, told: `{N} took up ${X}'s design whole.` };
  if (kind === 'pattern') return { text: p ? `Take the ${fillWords(t.tp)} from ${X}'s design, and weave them in your own ${d[mine.a].name} and ${d[p.dye].name}.`
    : `Take the ${fillWords(t.tp)} from ${X}'s design into your plain ${d[mine.a].name}, in ${d[t.c].name}.`, told: `{N} took the ${fillWords(t.tp)} from ${X}'s design into {P} own colours.` };
  if (kind === 'over') return { text: `Lay ${X}'s ${fillWords(t.tp)} over your own ${own}, in ${d[t.c].name}: both patterns showing at once, in three colours.`, told: `{N} laid ${X}'s ${fillWords(t.tp)} over {P} own ${own}.` };
  if (kind === 'counter') return { text: `Work ${X}'s ${fillWords(t.tp)} against your own ${own}: wherever the two cross, your ${d[mine.a].name} and ${d[p.dye].name} change places.`,
    told: `{N} worked ${X}'s ${fillWords(t.tp)} against {P} own ${own}: a pattern neither of them had.` };
  return { text: `${p ? `Keep your ${own}, but take` : 'Take'} ${X}'s ${d[t.c].name} in place of your ${d[t.old].name}: ${yarnName(d, t.yarn)}.`, told: `{N} took ${X}'s ${d[t.c].name} into {P} own design.` };
}

/**
 * The yarns two weavers could hold a ground in together, each plied from what both weave now: one's pattern on the
 * other's ground, either way round; their two patterns worked against each other in their two ground colours; or, of
 * two plain yarns, the two colours in turn. Only what is neither's own yarn already. `say(me)` is one in words, as
 * either of them would hear it.
 */
function plied(S, a, b) {
  const ya = S.yarn[a], yb = S.yarn[b], d = S.lot.dyes, out = [], pa = ya.strands[0], pb = yb.strands[0], whose = (x, me) => (me === x ? 'your' : `${nm(S, x)}'s`);
  const onto = (x, y, X, Y) => {
    const p = x.strands[0]; if (!p) return;
    const lines = y.strands.find(s => !s.counter && s.dye !== y.a), c = lines ? [lines.dye, lines.dyeBy] : x.a !== y.a ? [x.a, x.aBy] : p.dye !== y.a ? [p.dye, p.dyeBy] : [y.a === DARK ? UNDYED : DARK, X];
    const yarn = { a: y.a, aBy: y.aBy, strands: [strand(p.fill, c[0], p.by, c[1], { s: p.s })] };
    out.push({ yarn, say: me => `${whose(X, me)} ${fillWords(p)} on ${whose(Y, me)} ${d[y.a].name}: ${yarnName(d, yarn)}` });
  };
  onto(ya, yb, a, b); onto(yb, ya, b, a);
  if (!S.L.simple && pa && pb && pa.fill !== pb.fill && ya.a !== yb.a) {
    const yarn = { a: ya.a, aBy: ya.aBy, strands: [strand(pa.fill, yb.a, pa.by, yb.aBy, { s: pa.s }), strand(pb.fill, yb.a, pb.by, yb.aBy, { s: pb.s, counter: true })] };
    out.push({ yarn, say: () => `both your patterns worked against each other, in both your ground colours: ${yarnName(d, yarn)}` });
  }
  if (!pa && !pb && ya.a !== yb.a) {
    const yarn = { a: ya.a, aBy: ya.aBy, strands: [strand('bands', yb.a, yb.aBy, yb.aBy, { s: 2 })] };
    out.push({ yarn, say: () => `both your colours in turn: ${yarnName(d, yarn)}` });
  }
  return out.filter((r, i) => !sameLook(r.yarn, ya) && !sameLook(r.yarn, yb) && out.findIndex(o => sameLook(o.yarn, r.yarn)) === i).map((r, i) => ({ ...r, key: `share${i + 1}` }));
}

/**
 * What `a` would weave having taken a strand of `b`'s in return for ground: `b`'s pattern over `a`'s own, or in place
 * of it, or failing a pattern a colour of `b`'s. `say(me)` is the strand and where it goes, as either would hear it.
 */
function graft(S, a, b) {
  const mine = S.yarn[a], theirs = S.yarn[b], d = S.lot.dyes, p = mine.strands[0];
  for (const kind of ['over', 'pattern', 'colour']) {
    const t = taken(S, mine, theirs, kind, a);
    if (!t || sameLook(t.yarn, mine)) continue;
    const what = t.tp ? fillWords(t.tp) : d[t.c].name, mineIs = me => (me === a ? 'your' : her(S, a));
    const where = me => (kind === 'over' ? `over ${mineIs(me)} own ${fillWords(p)}` : kind === 'colour' ? `in place of ${mineIs(me)} ${d[t.old].name}` : p ? `in place of ${mineIs(me)} own ${fillWords(p)}` : `into ${mineIs(me)} plain ${d[mine.a].name}`);
    return { kind, what, yarn: sized(t.yarn, t.tp?.s || 2), say: me => `${me === b ? 'your' : `${nm(S, b)}'s`} ${what} ${where(me)}` };
  }
  return null;
}

/**
 * The yarns open to weaver `w`: keeping theirs; what they could make of it alone (something new from the pot, the
 * pattern put aside, a strand left out, the yarn turned inside out, a pattern of their own added); and, where weavers
 * combine, what they could take from whoever weaves on either side of them and across the loom. A few of each, as
 * unlike each other as the moment allows: a mind is a poor judge between near twins.
 */
function yarnOffer(S, w, rnd) {
  const L = S.L, d = S.lot.dyes, mine = S.yarn[w], total = S.used.reduce((s, x) => s + x, 0), words = y => yarnName(d, y);
  const colours = S.pot.filter(c => c !== UNDYED), byUse = [...colours].sort((a, b) => S.used[a] - S.used[b]), rare = byUse[0], loud = byUse.at(-1);
  const use = c => (!total ? '' : S.used[c] === 0 ? ', which nobody has woven with yet' : c === rare ? ', the least used colour on the loom' : c === loud ? ', already the commonest colour in the cloth' : '');
  const inPot = y => coloursOf(y).every(c => c === DARK || S.pot.includes(c));
  const own = [], cross = [], fresh = y => !!y && inPot(y) && !(mine && sameLook(y, mine)) && ![...own, ...cross].some(c => sameLook(c.yarn, y));
  const bench = L.together ? S.weavers.map((_, x) => x) : S.grounds.filter(g => g.who >= 0).map(g => g.who), at = bench.indexOf(w);
  const beside = at < 0 || L.together ? [] : [bench[at - 1], bench[at + 1]].filter(x => x != null && S.yarn[x]);

  // What could be taken from another's yarn, as it stands on the loom now.
  if (mine && at >= 0) {
    // Decided together, every design is on the table for all to see: three of the others', drawn.
    const seen = L.together ? shuffled(bench.filter(x => x !== w && S.yarn[x]), rnd).slice(0, 3).map(x => [x, '']) : [...beside.map(x => [x, 'beside you']), [bench[bench.length - 1 - at], 'across the loom']].filter(([x], i, all) => x != null && x !== w && S.yarn[x] && all.findIndex(([y]) => y === x) === i);
    for (const [x, where] of seen) for (const kind of !L.combine ? ['whole'] : shuffled(L.simple ? ['pattern', 'colour', 'whole'] : ['pattern', 'colour', 'over', 'counter', 'whole'], rnd)) {
      const t = taken(S, mine, S.yarn[x], kind, w, rnd() < 0.5 ? 'a' : 'p');
      if (t && fresh(t.yarn)) cross.push({ kind, from: x, yarn: t.yarn, ...(L.together ? tableWords(S, kind, t, mine, x) : crossWords(S, kind, t, mine, x, where)) });
    }
  }
  // As unlike each other as may be: not the same way of taking twice, nor always from the same weaver.
  // A structure taken goes further toward a new cloth than a colour swapped or a yarn copied, so those are offered first.
  const taking = [], pool = shuffled(cross, rnd), cost = c => 2 * taking.filter(o => o.kind === c.kind).length + taking.filter(o => o.from === c.from).length + (c.kind === 'colour' || c.kind === 'whole' ? 1 : 0);
  while (pool.length && taking.length < (L.combine ? L.crossOffered : 3)) taking.push(...pool.splice(pool.reduce((best, c, i) => (cost(c) < cost(pool[best]) ? i : best), 0), 1));

  // What the weaver could make alone.
  const add = (kind, yarn, text) => { if (fresh(yarn)) own.push({ kind, from: -1, yarn, text }); };
  const hides = c => { const x = beside.find(x => S.yarn[x].a === c && !S.yarn[x].strands.length); return x == null ? '' : ` It is what ${nm(S, x)} weaves beside you: the edge between you would be hard to see.`; };
  const woven = new Set(S.yarn.filter(Boolean).flatMap(y => y.strands.map(s => s.fill)));
  const fromPot = (a = pick(colours, rnd)) => ({ a, aBy: a === mine?.a ? mine.aBy : w, strands: [strand(pick(PATTERNS, rnd), pick([...S.pot, DARK].filter(c => c !== a), rnd), w)] });
  const start = () => { const y = fromPot(); add('new', y, `Start a new yarn from the pot: ${words(y)}.${total && !woven.has(y.strands[0].fill) ? ` Nobody weaves ${fillWords(y.strands[0])} on this loom now.` : ''}`); };
  const plain = c => add('plain', { a: c, aBy: c === mine?.a ? mine.aBy : w, strands: [] }, `${mine?.strands.length ? 'Put pattern aside and weave' : 'Weave'} ${c === UNDYED ? 'plain undyed wool: no dye at all, the palest and quietest yarn there is.' : `plain ${d[c].name}${use(c)}: one colour, with nothing worked into it.`}${hides(c)}`);
  start();
  if (mine) {
    const [p, q] = mine.strands;
    if (p) add('plain', { a: mine.a, aBy: mine.aBy, strands: [] }, `Strip your yarn back to its ground: plain ${d[mine.a].name}, with nothing worked into it.${hides(mine.a)}`);
    if (q) { const y = copyYarn(mine); y.strands.pop(); add('drop', y, `Leave out the ${fillWords(q)}${q.by >= 0 && q.by !== w ? ` you had from ${nm(S, q.by)}` : ''}: back to ${words(y)}.`); }
    // Inside out is another yarn only where the pattern is not half and half already.
    if (!L.simple && p && (q || !['bands', 'pins', 'checks'].includes(p.fill))) {
      const y = copyYarn(mine); y.a = p.dye; y.aBy = p.dyeBy;
      for (const s of y.strands) if (s.dye === p.dye) { s.dye = mine.a; s.dyeBy = mine.aBy; }
      add('turn', y, `Turn your yarn inside out: the same ${fillWords(p)}, with the ${d[p.dye].name} as the ground and the ${d[mine.a].name} worked into it.`);
    }
    if (L.simple) { /* nothing is added to a yarn in the plain game: it is kept, changed for another, or stripped */ }
    else if (!p) { const y = fromPot(mine.a); add('more', y, `Work a pattern of your own into your ${d[mine.a].name}: ${words(y)}.`); }
    else if (!q) {
      const fill = pick(PATTERNS.filter(f => f !== p.fill), rnd), c = pick([...S.pot, DARK].filter(c => !coloursOf(mine).includes(c)), rnd), y = copyYarn(mine);
      if (c != null) { y.strands.push(strand(fill, c, w, w, { thin: true })); add('more', y, `Lay a second pattern of your own over your ${fillWords(p)}: ${FILLS[fill].words} in ${d[c].name}, three colours in all.`); }
    }
  } else { start(); start(); }
  plain(rare); if (loud !== rare) plain(loud); plain(UNDYED); start();

  const keep = !!mine && inPot(mine), room = Math.max(2, L.yarnsOffered - (keep ? 1 : 0) - taking.length);
  const out = shuffled([...taking, ...[own[0], ...shuffled(own.slice(1), rnd)].filter(Boolean).slice(0, room)], rnd).map((c, i) => ({ key: `y${i + 1}`, ...c }));
  if (keep) out.unshift({ key: 'keep', kind: 'keep', from: -1, yarn: null, text: `Keep your yarn as it is: ${words(mine)}${S.kept[w] > 1 ? `, as for the last ${S.kept[w]} passages` : ''}.` });
  return out;
}

/* ---------------------------------------------------------------------------------------------------- the weaving */

function put(S, x, y, dye, own, mark = 0, by = own, by2 = by, own2 = own) {
  const c = S.cloth, i = y * c.W + x;
  c.dye[i] = dye; c.own[i] = own; c.own2[i] = own2; c.by[i] = by; c.by2[i] = by2; c.mark[i] = mark;
}
const STITCH = { dye: 0, by: 0, by2: 0 };
/** The stitch of ground `G`'s own yarn at (`x`, `y`): whose ground it is in, and whose ideas it is. */
function lay(S, x, y, G) {
  if (isBare(G)) return put(S, x, y, G.yarn.a, GUILD, MARK.bare);
  const st = stitchOf(yarnOf(S, G), x, y, STITCH), two = isShared(G);
  put(S, x, y, st.dye, two ? G.pair[0] : G.who, G.plied ? MARK.plied : 0, st.by, st.by2, two ? G.pair[1] : G.who);
}

/** The guard stripe up both sides, as the border has it. */
function guards(S, y) {
  const { W } = S.cloth, G = S.L.guard, [c0, c1] = S.band.dyes;
  for (let g = 0; g < G; g++) {
    const dye = g === 0 || g === G - 1 ? DARK : (g + (y >> 1)) % 2 ? c1 : c0;
    put(S, g, y, dye, GUILD, MARK.band); put(S, W - 1 - g, y, dye, GUILD, MARK.band);
  }
}

/** A band straight across the field, `h` rows of it: the border's pattern between two dark lines. */
function bandRows(S, h) {
  const [c0, c1, c2] = S.band.dyes, at = BANDS[S.band.kind].at;
  for (let r = 0; r < h; r++, S.y++) {
    for (let x = S.x0; x < S.x1; x++) put(S, x, S.y, r === 0 || r === h - 1 ? DARK : [c0, c1, c2][at(x - S.x0, r - 1, h - 2)], GUILD, MARK.band);
    guards(S, S.y); S.cloth.pass[S.y] = S.pass; S.cloth.rows = S.y + 1;
  }
}

/** A new ground opened at edge `e`, nothing wide yet, its two edges moving apart at `vl` and `vr` warps a row. */
function open(S, e, ground, vl, vr) {
  const i = S.edges.indexOf(e), fresh = v => ({ x: e.x, v, join: 'plain', knot: 0 });
  if (i === S.edges.length - 1) S.edges.splice(i, 0, fresh(vl));
  else { S.edges.splice(i + 1, 0, fresh(vr)); if (i > 0) e.v = vl; }
  S.grounds.splice(i, 0, ground);
}

/**
 * A ground opened at edge `e` for `a` (on the left) and `b` to hold together, in `yarn`, plied from both. It is a new
 * idea with two parents, and both its edges are agreed ones.
 */
function openShared(S, e, a, b, yarn, vl, vr) {
  const node = idea(S, [a, b], yarn, 'shared');
  open(S, e, { who: SHARED, pair: [a, b], yarn, node }, vl, vr);
  e.join = S.edges[S.edges.indexOf(e) + 1].join = 'dovetail';
  S.joins.shared++; S.tally[a].shared++; S.tally[b].shared++;
  S.entry.links.push({ from: a, to: b, how: 'shared', node });
}

/** Ground `i` has no warps left: it leaves the bench, and its two edges become one. */
function drop(S, i) {
  const g = S.grounds[i], last = S.grounds.length - 1;
  if (i === 0) S.edges.splice(1, 1); else if (i === last) S.edges.splice(i, 1);
  else S.edges.splice(i, 2, { x: (S.edges[i].x + S.edges[i + 1].x) / 2, v: 0, join: g.who >= 0 && !S.decider ? 'slit' : 'plain', knot: 0 });
  S.grounds.splice(i, 1);
  if (g.who >= 0) { S.tally[g.who].out++; S.joins.out++; say(S, g.who, 'out'); note(S, 'out', [g.who], `${nm(S, g.who)} was squeezed off the bench.`); }
  else if (isShared(g)) { S.joins.closed++; note(S, 'closed', g.pair, `The ground ${nm(S, g.pair[0])} and ${nm(S, g.pair[1])} held together closed again.`); }
  tidy(S);
}

/**
 * The bench put in order after a ground has gone: a ground held by two lies between those two, so one that has lost a
 * holder from its side goes to the other, or to nobody; and two strips of bare warp side by side are one.
 */
function tidy(S) {
  for (let i = 0; i < S.grounds.length; i++) {
    const g = S.grounds[i], a = S.grounds[i - 1], b = S.grounds[i + 1];
    if (isShared(g)) {
      const left = a && a.who >= 0 && g.pair.includes(a.who), right = b && b.who >= 0 && g.pair.includes(b.who) && !(left && b.who === a.who);
      if (left && right) continue;
      if (left || right) { S.edges.splice(left ? i : i + 1, 1); S.grounds.splice(i, 1); } else { g.who = GUILD; g.yarn = S.bare; delete g.pair; }
      i = -1;
    } else if (isBare(g) && b && isBare(b)) { S.grounds.splice(i + 1, 1); S.edges.splice(i + 1, 1); i = -1; }
  }
}

/** One row: the edges move, each ground is filled with its yarn, the joins are worked, the figures and knots go in. */
function weaveRow(S) {
  const { cloth, x0, x1 } = S, y = S.y, W = cloth.W;
  for (let i = 1; i < S.edges.length - 1; i++) S.edges[i].x = Math.max(x0, Math.min(x1, S.edges[i].x + S.edges[i].v));
  for (let i = 0; i < S.grounds.length && S.grounds.length > 1; i++) {
    const a = S.edges[i], b = S.edges[i + 1];
    if (b.x - a.x < 0.5 && b.v - a.v <= 0) { drop(S, i); i = -1; }
  }
  const xs = S.edges.map(e => Math.round(e.x));
  for (let g = 0; g < S.grounds.length; g++) {
    const G = S.grounds[g];
    G.plied = !isBare(G) && (isShared(G) || mindsOf(yarnOf(S, G)).size > 1);
    for (let x = xs[g]; x < xs[g + 1]; x++) lay(S, x, y, G);
  }
  for (let i = 1; i < S.edges.length - 1; i++) {
    const e = S.edges[i], xb = xs[i], A = S.grounds[i - 1], B = S.grounds[i];
    if (e.join === 'slit') { if (xb > xs[i - 1] && xb < xs[i + 1]) cloth.mark[y * W + xb] |= MARK.slit; }
    else if (e.join === 'dovetail') {
      if ((y >> 1) & 1) { if (xb < xs[i + 1] - 1) lay(S, xb, y, A); }
      else if (xb - 1 > xs[i - 1]) lay(S, xb - 1, y, B);
    } else if (e.join === 'hatch') {
      const G = y & 1 ? A : B, yarn = yarnOf(S, G), two = isShared(G);
      for (let x = Math.max(xs[i - 1], xb - 3); x < Math.min(xs[i + 1], xb + 3); x++) put(S, x, y, yarn.a, two ? G.pair[0] : G.who, MARK.hatch, yarn.aBy, yarn.aBy, two ? G.pair[1] : G.who);
    }
    if (e.knot > 0) { e.knot--; for (const x of [xb - 1, xb]) if (x >= x0 && x < x1) put(S, x, y, DARK, GUILD, MARK.knot); }
  }
  for (const f of S.figures) {
    const dy = y - f.y0;
    if (dy < -1 || dy > f.rows || y >= f.until) continue;
    for (let dx = -f.n - 1; dx <= f.n + 1; dx++) {
      const x = f.cx + dx; if (x < x0 || x >= x1 || cloth.own[y * W + x] !== f.host || cloth.own2[y * W + x] !== f.host) continue;
      const m = figureAt(f.kind, dx, dy, f.n), mark = MARK.figure | (f.by2 !== f.who ? MARK.plied : 0);
      if (m === 3) { if (f.rim !== null) put(S, x, y, f.rim, f.who, MARK.figure); }
      // A figure of two hands: the planter's shape, and inside it the host's own structure in the figure's two colours.
      else if (m) put(S, x, y, (f.tex && m === 1 ? FILLS[f.tex.fill].at(x, y, f.tex.s) : m === 2) ? f.b : f.a, f.who, mark, f.who, f.by2);
    }
  }
  for (const kn of S.knots) if (kn.rows > 0) { kn.rows--; for (const x of [kn.x - 1, kn.x]) if (x >= x0 && x < x1) put(S, x, y, DARK, GUILD, MARK.knot); }
  closeRow(S);
}

/** A row finished: its dyes counted, the guard stripe put up both sides of it, and the loom moved on a row. */
function closeRow(S) {
  const { cloth, x0, x1 } = S, y = S.y;
  for (let x = x0; x < x1; x++) { const i = y * cloth.W + x; S.used[cloth.dye[i]]++; if (cloth.mark[i] & MARK.bare) cloth.bare++; }
  guards(S, y); cloth.pass[y] = S.pass; cloth.rows = ++S.y;
}

/**
 * A figure of `w`'s goes into `host`'s ground: `n` its half-width, `a` and `b` its dyes, `rim` the dye of the line
 * round it (null for none). `more.tex` is a strand of the host's worked inside it, and `more.by2` whose colours it is in
 * when they are not the planter's own.
 */
function plantFigure(S, w, host, kind, n, a, b, rim, more = {}) {
  const k = groundOf(S, host), cx = Math.round((S.edges[k].x + S.edges[k + 1].x) / 2);
  S.figures.push({ who: w, host, kind, n, cx, y0: S.y + 1, rows: FIGURES[kind].rows(n), until: Infinity, a, b, rim, tex: null, by2: w, ...more });
  S.joins.figure++; S.tally[w].planted++;
}
/** The dyes a figure of `my` yarn's takes in a ground of `hy`: its own where they show against that ground, the dark or the pale where they would not. */
function figureDyes(my, hy) {
  const mb = my.strands.find(s => !s.counter)?.dye ?? my.a, clash = c => c === hy.a;
  const a = !clash(my.a) ? my.a : !clash(mb) ? mb : hy.a === DARK ? UNDYED : DARK;
  return [a, mb !== a && !clash(mb) ? mb : hy.a === UNDYED ? DARK : UNDYED];
}
/** How big a figure `amt` of boldness makes in a ground `wide` warps across, with what is left of the rug to finish it in. */
const figureSize = (S, amt, wide) => Math.max(2, Math.min(Math.round(2 + 5 * amt / 9), Math.floor((wide - 3) / 2), Math.floor(((S.L.passes - S.pass) * S.L.rows - 3) / 2)));

/** The bench as it must always stand, or an error saying how it does not: for the tests, and for anyone changing the loom. */
export function sound(S) {
  const bad = why => { throw Error(`passage ${S.pass}: ${why}`); };
  if (!S.grounds.length) return;
  if (S.edges.length !== S.grounds.length + 1) bad('an edge too many or too few');
  if (S.edges[0].x !== S.x0 || S.edges.at(-1).x !== S.x1) bad('a selvedge has moved');
  S.edges.forEach((e, i) => { if (i && e.x < S.edges[i - 1].x) bad('two edges have crossed'); });
  S.grounds.forEach((g, i) => {
    const a = S.grounds[i - 1], b = S.grounds[i + 1];
    if (!S.L.together && g.who >= 0 && S.grounds.filter(x => x.who === g.who).length > 1) bad(`${nm(S, g.who)} holds two grounds`);
    if (isShared(g) && !(a?.who >= 0 && b?.who >= 0 && a.who !== b.who && g.pair.includes(a.who) && g.pair.includes(b.who))) bad('a ground held by two does not lie between them');
    if (isBare(g) && b && isBare(b)) bad('two strips of bare warp side by side');
    const yarn = isBare(g) ? null : yarnOf(S, g);
    if (yarn && (yarn.strands.length > 2 || yarn.strands.some((s, k) => !FILLS[s.fill]?.two || !(s.s >= 1 && s.s <= 4) || (s.counter && k !== 1)))) bad(`an unweavable yarn: ${lookOf(yarn)}`);
  });
}

/* ---------------------------------------------------------------------------------------------------- one passage */

/**
 * A TALK is something one weaver did that another must answer: a press into their ground, an offer to hold ground
 * together, two reaching for one edge at once (`meet`), a figure planted in their ground. `asks` are who answers and
 * among what; `reply` is what the mover is then asked, when the answer was not simply yes; `outcome` and `text` are how
 * it ended. The answer to a press or a planting may be yes, no, or a third thing the answerer puts forward instead.
 */
function pressTalk(S, e, from, to, dir, amt) {
  const A = nm(S, from), side = dir > 0 ? 'L' : 'R', kf = groundOf(S, from), kt = groundOf(S, to), q = S.pair[from][to];
  const past = q.pressed > 1 ? `In this rug ${A} has pressed into {N} ${times(q.pressed - 1)} before${q.kept ? `, and kept it over {P} objection ${times(q.kept)}` : ''}. ` : '';
  const shares = S.L.combine ? shuffled(plied(S, from, to), rng(S.seed, 'ply', S.pass, from, to)).slice(0, 1) : [], g = S.L.combine && !S.L.simple ? graft(S, from, to) : null;
  const options = [
    ...(S.L.simple ? [] : [{ key: 'glad', text: `Welcome it, and step your own yarn into ${A}'s along the new edge: a dovetail where the two of you meet.` }]),
    { key: 'pass', text: `Let it pass and weave on without a word: a straight edge, ${warps(amt)} further into your ground.` },
    { key: 'refuse', text: `Refuse, and hold the edge where it is. If ${A} keeps to it anyway, the edge between you is left an open slit.` },
    ...shares.map(r => ({ key: r.key, kind: 'shared', yarn: r.yarn, text: `Offer to hold those warps together instead: a ground between you, woven as ${r.say(to)}.` })),
    ...(g ? [{ key: 'trade', kind: 'trade', yarn: g.yarn, text: `Let ${A} have the warps for a strand of yours: ${A} would weave ${g.say(to)} from now on, wherever ${her(S, from)} ground goes.` }] : []),
  ];
  return { what: 'press', from, to, e, dir, amt, shares, graft: g, base: S.yarn[from], reply: null, asks: [{ w: to, key: side, what: 'press', about: from, options,
    ask: `${past}${A}, on {N}'s ${SIDE[side]}, is pressing into {N}'s ground to take ${warps(amt)} of it, weaving ${yarnWords(S, S.yarn[from])}. ${A} holds ${width(S, kf)} warps${rank(S, kf)}; {N} holds ${width(S, kt)}${rank(S, kt)}, in ${yarnWords(S, S.yarn[to])}. How does {N} answer?` }] };
}

function offerTalk(S, e, from, to, dir, amt, shares) {
  const A = nm(S, from), side = dir > 0 ? 'L' : 'R';
  const options = [
    ...shuffled(shares, rng(S.seed, 'ply', S.pass, from, to)).slice(0, 1).map(r => ({ key: r.key, kind: 'shared', yarn: r.yarn, text: `Take ${A} up on it: a ground between you that you hold together, woven as ${r.say(to)}.` })),
    ...(S.L.simple ? [] : [{ key: 'mine', text: `Take the warps ${A} gives, but weave them your own way, in your own yarn: no ground is held together.` }]),
    { key: 'decline', text: `Thank ${A} and decline: the edge between you stays where it is, and each keeps to their own ground.` },
  ];
  return { what: 'offer', from, to, e, dir, amt, shares, reply: null, asks: [{ w: to, key: side, what: 'offer', about: from, options,
    ask: `${A}, on {N}'s ${SIDE[side]}, offers {N} a ground to hold together: ${A} gives ${warps(amt)} of ${her(S, from)} own to start it, and it is woven in a yarn plied from both. ${A} weaves ${yarnWords(S, S.yarn[from])}; {N} weaves ${yarnWords(S, S.yarn[to])}. What does {N} do?` }] };
}

function meetTalk(S, e, a, b, amtA, amtB) {
  const shares = S.L.combine ? plied(S, a, b).slice(0, 1) : [];
  const side = (me, them, key) => ({ w: me, key, what: 'meet', about: them, ask: `{N} and ${nm(S, them)} have reached for the same edge at once, each pressing into the other's ground. {N} holds ${width(S, groundOf(S, me))} warps${rank(S, groundOf(S, me))}; ${nm(S, them)} holds ${width(S, groundOf(S, them))}${rank(S, groundOf(S, them))}. What does {N} do?`, options: [
    { key: 'hold', text: `Hold hard and press on. If ${nm(S, them)} holds too, neither of you moves, and the edge is left an open slit.` },
    { key: 'give', text: `Give way, and let ${nm(S, them)} have the warps ${she(S, them)} reached for: the edge moves into your ground.` },
    { key: 'half', text: 'Stop where you both are, and weave the edge between you together in both your colours.' },
    ...shares.map(r => ({ key: 'share', kind: 'shared', yarn: r.yarn, text: `Offer to hold the edge together: a ground opening between you from both sides, woven as ${r.say(me)}.` }))] });
  return { what: 'meet', from: a, to: b, e, amt: amtA, amtB, shares, reply: null, asks: [side(a, b, 'R'), side(b, a, 'L')] };
}

function plantTalk(S, w, host, figure, amt) {
  const A = nm(S, w), hy = S.yarn[host], hp = hy.strands[0] ?? null, k = groundOf(S, host), ka = groundOf(S, w);
  const options = [
    { key: 'glad', text: `Welcome it: ${A}'s figure stands in the middle of your ground as ${A} made it, and you weave your own yarn close in round it.` },
    { key: 'pass', text: `Let it pass and weave on without a word: ${A}'s figure stands in the middle of your ground as ${A} made it.` },
    { key: 'refuse', text: `Refuse it. If ${A} keeps to it anyway, the figure stands in your ground fenced off with a dark line.` },
    ...(S.L.combine && hp ? [{ key: 'fill', kind: 'joint', text: `Let it stand, and fill it yourself: ${A}'s shape on the outside, your own ${fillWords(hp)} worked inside it.` }] : []),
    ...(S.L.combine && ka >= 0 && width(S, ka) >= 9 && !busy(S, w) ? [{ key: 'answer', kind: 'joint', text: `Let it stand, and answer it: plant the same figure in the middle of ${A}'s ground, in your own colours.` }] : []),
  ];
  return { what: 'plant', from: w, to: host, figure, amt, reply: null, asks: [{ w: host, key: 'fig', what: 'plant', about: w, options,
    ask: `${A} is planting ${FIGURES[figure].words} of ${her(S, w)} own in the middle of {N}'s ground: ${width(S, k)} warps${rank(S, k)}, in ${yarnWords(S, hy)}. How does {N} answer?` }] };
}

/** What the mover of a talk is asked once it has been answered, or null where the answer was a plain yes or no reply is called for. */
function replyOf(S, t) {
  const q = replyTo(S, t);
  return q && { ...q, what: `${t.what}:reply`, about: t.to };
}
function replyTo(S, t) {
  const B = nm(S, t.to), said = t.asks[0].chose, share = t.shares?.find(r => r.key === said);
  if (t.what === 'press') {
    const key = OTHER[t.asks[0].key], did = `{N} pressed into ${B}'s ground to take ${warps(t.amt)} of it.`, keep = `take the ${warps(t.amt)} anyway. The edge between you is left an open slit.`;
    const back = { key: 'back', text: 'Take it back and leave the edge where it was, with a small knot in the cloth to mark the place.' };
    if (said === 'refuse') return { w: t.from, key, ask: `${did} ${B} will not have it. What does {N} do?`, options: [
      { key: 'keep', text: `Keep to it over ${B}'s objection: ${keep}` }, back, { key: 'half', text: `Meet ${B} halfway: take half as many warps, and weave the new edge in both your colours.` }] };
    if (share) return { w: t.from, key, ask: `${did} ${B} offers instead to hold those warps together, in a yarn plied from both. What does {N} do?`, options: [
      { key: 'take', kind: 'shared', yarn: share.yarn, text: `Take ${B} up on it: hold the ${warps(t.amt)} together, woven as ${share.say(t.from)}.` }, { key: 'keep', text: `Keep to what you wanted: ${keep}` }, back] };
    if (said === 'trade') return { w: t.from, key, ask: `${did} ${B} will let them go for a strand of ${her(S, t.to)} own in {N}'s yarn. What does {N} do?`, options: [
      { key: 'take', kind: 'trade', yarn: t.graft.yarn, text: `Agree: take the ${warps(t.amt)}, and weave ${t.graft.say(t.from)} from now on: ${yarnWords(S, t.graft.yarn)}.` }, { key: 'keep', text: `Keep to what you wanted: ${keep}` }, back] };
  }
  if (t.what === 'plant') {
    const did = `{N} went to plant ${FIGURES[t.figure].words} in the middle of ${B}'s ground.`, back = { key: 'back', text: 'Take it back and plant nothing, with a small knot in the cloth to mark the place.' };
    const keep = how => ({ key: 'keep', text: `${how}: your own figure in your own colours, standing in ${B}'s ground fenced off with a dark line.` });
    if (said === 'refuse') return { w: t.from, key: 'fig', ask: `${did} ${B} will not have it. What does {N} do?`, options: [keep(`Keep to it over ${B}'s objection`), back, { key: 'half', text: `Meet ${B} halfway: a smaller figure, woven in ${B}'s own colours.` }] };
    if (said === 'fill') return { w: t.from, key: 'fig', ask: `${did} ${B} will let it stand if ${she(S, t.to)} may fill it with ${her(S, t.to)} own pattern. What does {N} do?`, options: [
      { key: 'take', kind: 'joint', text: `Gladly: your shape on the outside, with ${B}'s ${fillWords(S.yarn[t.to].strands[0])} worked inside it.` }, keep('Keep it as you meant it'), back] };
    if (said === 'answer') return { w: t.from, key: 'fig', ask: `${did} ${B} will let it stand if ${she(S, t.to)} may plant the same figure in {N}'s ground. What does {N} do?`, options: [
      { key: 'take', kind: 'joint', text: `Gladly: your figure in ${B}'s ground, and the same figure of ${B}'s in yours.` }, keep('Keep it as you meant it, and have none of theirs'), back] };
  }
  return null;
}

/** One beat of the talks: whoever is asked anything in it is asked all of it in one call, and the calls are made together. */
async function hear(S, asks, beat) {
  const by = new Map();
  for (const q of asks) by.set(q.w, [...(by.get(q.w) ?? []), q]);
  await Promise.all([...by].map(async ([w, mine]) => {
    const mem = memory(S, w), a = await mind(S, w, `p${S.pass}.${S.weavers[w].key}.${beat}`, Object.fromEntries(mine.map(q => [q.key, { ask: `${mem}${q.ask}`, options: q.options, what: q.what, about: q.about }])), stateFor(S, w));
    for (const q of mine) { q.chose = draw(a[q.key].p, temp(S, w), a[q.key].r); q.rec = { who: w, asked: a.asked[q.key], by: a.by, why: a.why, ms: a.ms, ...kept(q.options, a[q.key], q.chose) }; }
  }));
}

/** A talk's ending woven in: where the edge goes and how it is joined, what is planted, who now weaves what. */
function settle(S, t) {
  const { from, to, e } = t, rows = S.L.rows, A = nm(S, from), B = nm(S, to), said = t.asks[0].chose, re = t.reply?.chose ?? null, share = t.shares?.find(r => r.key === said);
  const end = (outcome, text) => { t.outcome = outcome; t.text = text; note(S, outcome, [from, to], text); };
  const go = (dir, n) => { e.v = dir * n / rows; };
  const overrules = (w, whom) => { S.tally[w].kept++; S.tally[whom].overruled++; S.pair[w][whom].kept++; say(S, w, 'keep'); };

  if (t.what === 'press') {
    const { dir, amt } = t, did = `${A} pressed into ${B}'s ground.`;
    const keep = why => { go(dir, amt); e.join = 'slit'; S.joins.slit++; overrules(from, to); end('slit', `${did} ${why}, and ${A} kept to it: the edge between them is an open slit.`); };
    const back = why => { e.knot = 2; S.joins.knot++; S.tally[from].gave++; say(S, from, 'back'); end('knot', `${did} ${why}, and ${A} took it back: a knot marks the place.`); };
    if (said === 'glad') { go(dir, amt); e.join = 'dovetail'; S.joins.dovetail++; say(S, to, 'welcome'); return end('dovetail', `${A} pressed into ${B}'s ground, and ${B} was glad of it.`); }
    if (said === 'pass') { go(dir, amt); e.join = 'plain'; S.joins.plain++; return end('plain', `${A} pressed into ${B}'s ground, and ${B} let it pass.`); }
    if (said === 'refuse') {
      S.tally[to].refused++; say(S, to, 'refuse');
      if (re === 'keep') return keep(`${B} would not have it`);
      if (re === 'back') return back(`${B} would not have it`);
      go(dir, Math.max(1, Math.round(amt / 2))); e.join = 'hatch'; S.joins.hatch++; S.tally[from].gave++; say(S, from, 'half');
      return end('hatch', `${did} ${B} would not have it, and they met halfway: the edge is woven in both their colours.`);
    }
    if (share) {
      say(S, to, 'share');
      if (re === 'keep') return keep(`${B} offered to hold the warps together instead`);
      if (re === 'back') return back(`${B} offered to hold the warps together instead`);
      // The warps asked for are the ones held together: the new ground opens at the edge and grows into what was B's.
      openShared(S, e, dir > 0 ? from : to, dir > 0 ? to : from, share.yarn, dir > 0 ? 0 : -amt / rows, dir > 0 ? amt / rows : 0); say(S, from, 'join');
      return end('shared', `${did} ${B} offered to hold the warps together instead, and ${A} took it up: a ground between them in ${yarnWords(S, share.yarn)}, plied from both.`);
    }
    say(S, to, 'trade');
    if (re === 'keep') return keep(`${B} asked a strand for it`);
    if (re === 'back') return back(`${B} asked a strand for it`);
    // Ground one way, a strand the other. If the mover's yarn has changed since it was said, the strand goes into the yarn as it now is.
    const g = sameLook(S.yarn[from], t.base) ? t.graft : graft(S, from, to);
    go(dir, amt); e.join = 'dovetail'; S.joins.trade++;
    if (g) setYarn(S, from, g.yarn, 'trade', to);
    return end('trade', `${did} ${B} let the warps go for a strand, and ${A} agreed: ${A} now weaves ${yarnWords(S, S.yarn[from])}${g ? `, with ${B}'s ${g.what} in it` : ''}.`);
  }

  if (t.what === 'offer') {
    const { dir, amt } = t, did = `${A} offered ${B} a ground to hold together`;
    if (said === 'decline') { S.joins.declined++; say(S, to, 'decline'); return end('declined', `${did}, and ${B} declined.`); }
    if (said === 'mine') { go(-dir, amt); e.join = 'dovetail'; S.joins.dovetail++; say(S, from, 'give'); return end('dovetail', `${did}. ${B} took the warps, but wove them ${her(S, to)} own way.`); }
    // The warps offered are the ones held together: the new ground grows into what was A's.
    openShared(S, e, dir > 0 ? from : to, dir > 0 ? to : from, share.yarn, dir > 0 ? -amt / rows : 0, dir > 0 ? 0 : amt / rows); say(S, from, 'share'); say(S, to, 'join');
    return end('shared', `${did}, and ${B} took it up: ${yarnWords(S, share.yarn)}, plied from both.`);
  }

  if (t.what === 'meet') {
    const [x, y] = t.asks.map(q => q.chose), did = `${A} and ${B} pressed into each other at the same edge`, half = n => Math.max(1, Math.round(n / 2));
    if (x === 'hold' && y === 'hold') { e.join = 'slit'; S.joins.standoff++; S.tally[from].refused++; S.tally[to].refused++; say(S, from, 'standoff'); return end('standoff', `${did} and neither gave way: it is an open slit.`); }
    if (x === 'hold' || y === 'hold') {
      const win = x === 'hold' ? from : to, lose = x === 'hold' ? to : from, o = x === 'hold' ? y : x, dir = win === from ? 1 : -1, amt = win === from ? t.amt : t.amtB;
      if (o === 'give') { go(dir, amt); e.join = 'plain'; S.joins.plain++; S.tally[lose].gave++; return end('plain', `${did}, and ${nm(S, lose)} gave way.`); }
      if (o === 'half') { go(dir, half(amt)); e.join = 'hatch'; S.joins.hatch++; S.tally[lose].gave++; say(S, lose, 'half'); return end('hatch', `${did}. ${nm(S, win)} held hard and ${nm(S, lose)} would go halfway: the edge moved a little, woven in both their colours.`); }
      go(dir, amt); e.join = 'slit'; S.joins.slit++; overrules(win, lose); return end('slit', `${did}. ${nm(S, lose)} offered to hold it together, and ${nm(S, win)} pressed on: it is an open slit.`);
    }
    if ((x === 'share' || y === 'share') && x !== 'half' && y !== 'half') {
      const r = t.shares[0], first = x === 'share' ? from : to;
      openShared(S, e, from, to, r.yarn, -half(t.amtB) / rows, half(t.amt) / rows); say(S, first, 'share'); say(S, first === from ? to : from, 'join');
      return end('shared', `${did}, and chose to hold it together: a ground between them in ${yarnWords(S, r.yarn)}, plied from both.`);
    }
    if (x === 'give' && y === 'give') { e.join = 'dovetail'; S.joins.dovetail++; return end('dovetail', `${did}, each gave way to the other, and it stayed where it was.`); }
    e.join = 'hatch'; S.joins.hatch++;
    return end('hatch', `${did}, and wove it together in both their colours.`);
  }

  // A figure planted.
  if (groundOf(S, to) < 0) return end('lost', `${A} went to plant a figure in ${B}'s ground, but ${B} had left the bench.`);
  const hy = S.yarn[to], my = S.yarn[from], fig = FIGURES[t.figure].words, n = figureSize(S, t.amt, width(S, groundOf(S, to))), [a, b] = figureDyes(my, hy);
  const hb = hy.strands.find(s => !s.counter && s.dye !== hy.a)?.dye ?? null, did = `${A} went to plant ${fig} in ${B}'s ground.`;
  const fenced = why => { plantFigure(S, from, to, t.figure, n, a, b, hy.a === DARK ? UNDYED : DARK); S.joins.fenced++; overrules(from, to); end('fenced', `${did} ${why}, and ${A} kept to it: it stands fenced with a dark line.`); };
  const back = why => { const k = groundOf(S, to); S.knots.push({ x: Math.round((S.edges[k].x + S.edges[k + 1].x) / 2), rows: 2 }); S.joins.knot++; S.tally[from].gave++; say(S, from, 'back'); end('knot', `${did} ${why}, and ${A} took it back: a knot marks the place.`); };
  if (said === 'glad') { plantFigure(S, from, to, t.figure, n, a, b, hb); say(S, from, 'plant'); say(S, to, 'welcome'); return end('figure', `${A} planted ${fig} in ${B}'s ground, and ${B} was glad of it.`); }
  if (said === 'pass') { plantFigure(S, from, to, t.figure, n, a, b, null); say(S, from, 'plant'); return end('figure', `${A} planted ${fig} in ${B}'s ground, and ${B} let it pass.`); }
  if (said === 'refuse') {
    S.tally[to].refused++; say(S, to, 'refuse');
    if (re === 'keep') return fenced(`${B} would not have it`);
    if (re === 'back') return back(`${B} would not have it`);
    plantFigure(S, from, to, t.figure, Math.max(2, n - 2), hb ?? (hy.a === UNDYED ? DARK : UNDYED), hy.a, null, { by2: to }); S.tally[from].gave++; say(S, from, 'half');
    return end('figure', `${did} ${B} would not have it, and they met halfway: a smaller one, in ${B}'s own colours.`);
  }
  const asked = said === 'fill' ? `${B} would let it stand if ${she(S, to)} might fill it` : `${B} would let it stand if ${she(S, to)} might answer it`;
  if (re === 'keep') return fenced(asked);
  if (re === 'back') return back(asked);
  S.joins.joint++;
  if (said === 'fill') {
    plantFigure(S, from, to, t.figure, n, a, b, null, { tex: hy.strands[0], by2: to }); say(S, to, 'share'); say(S, from, 'join');
    return end('joint', `${A} planted ${fig} in ${B}'s ground, and ${B} filled it: ${A}'s shape, with ${B}'s ${fillWords(hy.strands[0])} worked inside it.`);
  }
  plantFigure(S, from, to, t.figure, n, a, b, null); say(S, from, 'plant');
  const ka = groundOf(S, from);
  // The answering figure is the answerer's own weaving of the planter's idea.
  if (ka >= 0 && !busy(S, from)) { const [c, c2] = figureDyes(hy, my); plantFigure(S, to, from, t.figure, figureSize(S, t.amt, width(S, ka)), c, c2, null, { by2: from }); say(S, to, 'plant'); }
  return end('joint', `${A} planted ${fig} in ${B}'s ground, and ${B} answered it with the same figure in ${A}'s.`);
}

async function passage(S) {
  const L = S.L, p = S.pass, rows = L.rows, talking = !S.decider && S.n > 1, talks = [], N = w => nm(S, w);
  S.reach = L.combine && S.n > 1 && p > 2 ? reachOf(S.cloth, L.guard, S.n) : null;

  // BEAT 1. Every weaver's own turn, one call each, all at once, all asked of the cloth as it stands now.
  const turns = await Promise.all(S.weavers.map(async (me, w) => {
    const rnd = rng(S.seed, 'offer', p, me.key), moves = moveOffer(S, w, rnd), mem = memory(S, w);
    // A yarn only just taken up is woven on: a pattern needs more than one passage to show what it is.
    const yarns = S.yarn[w] && S.kept[w] < L.settle ? null : yarnOffer(S, w, rnd);
    const Q = {
      move: { ask: `${mem}The loom is ready for the next passage. What does {N} do with it? Each option says what it would do to the cloth. Choose as {S} would.`, options: moves },
      ...(yarns ? { yarn: { ask: `${mem}What yarn does {N} weave with now? ${yarns.some(o => o.from >= 0) ? 'Some of these take something from what another weaver is weaving. ' : ''}Each option says what the yarn would be. Choose as {S} would.`, options: yarns } } : {}),
      bold: { ask: 'When {N} moves an edge or plants a figure in this passage, how hard does {S} go at it?', anchors: BOLD.map(x => `{N} goes ${x}`) },
      fine: { ask: 'How fine is the pattern {N} wants in {P} own ground just now?', anchors: FINE.map(x => `{N} wants it ${x}`) },
    };
    return { w, moves, yarns, a: await mind(S, w, `p${p}.${me.key}`, Q, stateFor(S, w)) };
  }));

  // The draws, from each mind's own weights at that weaver's own temperature.
  const turn = turns.map(({ w, moves, yarns, a }) => {
    const T = temp(S, w), move = moves.find(o => o.key === draw(a.move.p, T, a.move.r)), yarn = yarns ? yarns.find(o => o.key === draw(a.yarn.p, T, a.yarn.r)) : null;
    const amt = Math.round(2 + 7 * a.bold.u), s = Math.round(4 - 3 * a.fine.u), sig = move.key.replace(/:.*/, '');
    S.same[w] = sig === S.lastMove[w] ? S.same[w] + 1 : 1; S.lastMove[w] = sig;
    S.record.push({ kind: 'turn', pass: p, who: w, id: a.id, by: a.by, why: a.why, ms: a.ms, state: a.state, asked: a.asked, move: kept(moves, a.move, move.key),
      yarn: yarns ? kept(yarns.map(o => ({ ...o, yarn: o.yarn ? sized(o.yarn, s) : S.yarn[w] })), a.yarn, yarn.key) : null, weaving: S.yarn[w], bold: a.bold.u, fine: a.fine.u });
    return { w, move, yarn, amt, s };
  });

  // The yarns. Everyone chose looking at the loom as it stood, so what was taken was taken from the yarns of a moment ago.
  const was = S.node.slice();
  for (const t of turn) {
    if (!t.yarn?.yarn) S.kept[t.w]++;
    else setYarn(S, t.w, sized(t.yarn.yarn, t.s), t.yarn.kind, t.yarn.from, t.yarn.told ? said(S.weavers[t.w], t.yarn.told) : '', was);
  }

  // What each wants of each of their edges.
  const want = S.weavers.map(() => ({ L: null, R: null }));
  for (const t of turn) {
    const k = groundOf(S, t.w), m = t.move; if (k < 0) continue;
    const mine = width(S, k), give = Math.max(1, Math.min(t.amt, mine - 3)), grow = Math.max(1, Math.min(t.amt, Math.floor(L.maxShare * S.field) - mine));
    if (m.kind === 'push') want[t.w][m.side] = { kind: 'push', amt: grow };
    else if (m.kind === 'yield' || m.kind === 'bare' || m.kind === 'offer') want[t.w][m.side] = { kind: m.kind, amt: give };
    else if (m.kind === 'swell') want[t.w].L = want[t.w].R = { kind: 'push', amt: Math.max(1, Math.ceil(grow * 0.6)) };
    else if (m.kind === 'gather') want[t.w].L = want[t.w].R = { kind: 'yield', amt: Math.max(1, Math.min(Math.ceil(t.amt * 0.6), Math.floor((mine - 3) / 2))) };
  }

  // Every edge: moved at once where nobody need be asked, or made a talk between the two who share it.
  if (S.spell) {
    // The bench is being put even: every weaver's ground walks to its place, and nobody presses.
    const left = S.spell.passes * rows, seats = S.grounds.filter(g => g.who >= 0).length;
    let seat = 0;
    for (let i = 1; i < S.edges.length - 1; i++) { if (S.grounds[i - 1].who >= 0) seat++; const e = S.edges[i]; e.v = (S.x0 + S.field * seat / seats - e.x) / left; e.join = 'plain'; }
    if (--S.spell.passes === 0) S.spell = null;
  } else {
    const tasks = [];
    for (let i = 0; i < S.edges.length; i++) {
      const e = S.edges[i], A = S.grounds[i - 1] ?? null, B = S.grounds[i] ?? null;
      const a = A && A.who >= 0 ? want[A.who].R : null, b = B && B.who >= 0 ? want[B.who].L : null;
      e.v = 0;
      if (a || b) tasks.push({ e, A, B, a, b });
    }
    const bare = () => ({ who: GUILD, yarn: S.bare });
    for (const { e, A, B, a, b } of tasks) {
      if (!A || !B) {
        const t = a ?? b, G = A ?? B;
        if (t.kind === 'bare') { open(S, e, bare(), A ? -t.amt / rows : 0, B ? t.amt / rows : 0); S.joins.bare++; note(S, 'bare', [G.who], `${N(G.who)} drew in from the selvedge and left bare warp there.`); }
        continue;
      }
      if (A.who < 0 || B.who < 0) {
        // Beside bare warp, or a ground held with another: a weaver's own edge of it is theirs to move, and nobody is asked.
        const t = a ?? b, mover = (a ? A : B).who, G = a ? B : A, out = t.kind === 'push';
        e.v = (a ? 1 : -1) * (out ? 1 : -1) * t.amt / rows;
        if (isBare(G)) { e.join = 'plain'; note(S, 'free', [mover], out ? `${N(mover)} wove out over bare warp.` : `${N(mover)} drew back and let the bare warp widen.`); }
        else { const o = partner(G, mover); note(S, out ? 'unfed' : 'fed', [mover, o], out ? `${N(mover)} took back some of the ground ${she(S, mover)} holds with ${N(o)}.` : `${N(mover)} gave more of ${her(S, mover)} own ground to the one ${she(S, mover)} holds with ${N(o)}.`); }
        continue;
      }
      const pa = a?.kind === 'push', pb = b?.kind === 'push';
      if (pa && pb) {
        // Head-on.
        for (const [x, y] of [[A.who, B.who], [B.who, A.who]]) { S.tally[x].pressed++; S.pair[x][y].pressed++; }
        if (talking) talks.push(meetTalk(S, e, A.who, B.who, a.amt, b.amt));
        else { e.join = 'plain'; note(S, 'plain', [A.who, B.who], `${S.decider.name} had ${N(A.who)} and ${N(B.who)} press at the same edge, so it stayed where it was.`); }
        continue;
      }
      if (pa || pb) {
        const from = (pa ? A : B).who, to = (pa ? B : A).who, t = pa ? a : b, dir = pa ? 1 : -1, o = pa ? b : a;
        if (o && o.kind !== 'offer') { e.v = dir * Math.max(t.amt, o.amt) / rows; e.join = 'dovetail'; S.joins.dovetail++; say(S, to, 'give');
          note(S, 'dovetail', [from, to], `${N(from)} pressed toward ${N(to)} just as ${N(to)} drew back: the edge moved with no argument.`); continue; }
        S.tally[from].pressed++; S.pair[from][to].pressed++;
        if (talking) talks.push(pressTalk(S, e, from, to, dir, t.amt));
        else { e.v = dir * t.amt / rows; e.join = 'plain'; S.joins.plain++; note(S, 'plain', [from, to], `${N(from)} took ground from ${N(to)}, as ${S.decider.name} directed.`); }
        continue;
      }
      // An offer made while the other draws back for reasons of their own comes to nothing: their drawing back stands.
      const x = a?.kind === 'offer' && b && b.kind !== 'offer' ? null : a, y = b?.kind === 'offer' && a && a.kind !== 'offer' ? null : b;
      if (x?.kind === 'offer' || y?.kind === 'offer') {
        const shares = plied(S, A.who, B.who);
        if (!shares.length) continue;
        if (x && y) { openShared(S, e, A.who, B.who, shares[0].yarn, -x.amt / rows, y.amt / rows); say(S, A.who, 'share'); say(S, B.who, 'join');
          note(S, 'shared', [A.who, B.who], `${N(A.who)} and ${N(B.who)} each offered the other a ground to hold together, and so they do: ${yarnWords(S, shares[0].yarn)}, plied from both.`); }
        else talks.push(offerTalk(S, e, (x ? A : B).who, (x ? B : A).who, x ? 1 : -1, (x ?? y).amt, shares));
      } else if (x && y && L.simple) {
        // In the plain game nothing is left unwoven: two who each give the other space leave the edge where it is.
        e.join = 'dovetail'; S.joins.dovetail++;
        note(S, 'dovetail', [A.who, B.who], `${N(A.who)} and ${N(B.who)} each gave the other space, and the edge stayed where it was.`);
      } else if (x && y) {
        open(S, e, bare(), -x.amt / rows, y.amt / rows); S.joins.bare++;
        note(S, 'bare', [A.who, B.who], `${N(A.who)} and ${N(B.who)} both drew back, and bare warp opened between them.`);
      } else {
        const from = (x ? A : B).who, to = (x ? B : A).who, t = x ?? y, dir = x ? -1 : 1;
        if (t.kind === 'bare') { open(S, e, bare(), x ? -t.amt / rows : 0, x ? 0 : t.amt / rows); S.joins.bare++; note(S, 'bare', [from, to], `${N(from)} drew back from ${N(to)} and left bare warp between them.`); }
        else { e.v = dir * t.amt / rows; e.join = 'dovetail'; S.joins.dovetail++; say(S, from, 'give'); note(S, 'dovetail', [from, to], `${N(from)} gave ${N(to)} ground, freely.`); }
      }
    }
  }

  // Figures planted in another's ground: one to a ground in a passage, whoever is first along the bench.
  const planted = new Set();
  for (const t of turn) {
    const m = t.move; if (m.kind !== 'plant' || groundOf(S, m.host) < 0) continue;
    if (planted.has(m.host)) { note(S, 'lost', [t.w], `${N(t.w)} went to plant a figure in ${N(m.host)}'s ground, but another was planted there first.`); continue; }
    planted.add(m.host);
    if (talking) { talks.push(plantTalk(S, t.w, m.host, m.figure, t.amt)); continue; }
    const hy = S.yarn[m.host], [a, b] = figureDyes(S.yarn[t.w], hy);
    plantFigure(S, t.w, m.host, m.figure, figureSize(S, t.amt, width(S, groundOf(S, m.host))), a, b, null); say(S, t.w, 'plant');
    note(S, 'figure', [t.w, m.host], `${N(t.w)} planted ${FIGURES[m.figure].words} in ${N(m.host)}'s ground${S.decider ? `, as ${S.decider.name} directed` : ''}.`);
  }

  // BEAT 2: whoever was pressed, offered to or planted in answers what was really done. BEAT 3: whoever was not simply told yes replies.
  await hear(S, talks.flatMap(t => t.asks), 'a');
  for (const t of talks) t.reply = replyOf(S, t);
  await hear(S, talks.map(t => t.reply).filter(Boolean), 'r');
  for (const t of talks) {
    settle(S, t);
    S.record.push({ kind: 'talk', pass: p, what: t.what, from: t.from, to: t.to, amt: t.amt, figure: t.figure ?? null, beats: [...t.asks, t.reply].filter(Boolean).map(q => q.rec), outcome: t.outcome, text: t.text });
  }

  // What needs nobody's leave: a figure in one's own ground, a figure woven shut, sitting down again.
  for (const t of turn) {
    const m = t.move, w = t.w;
    if (m.kind === 'own' && groundOf(S, w) >= 0) {
      const my = S.yarn[w], has = coloursOf(my);
      // In a colour that stands out: the least used in the cloth that is not already in this ground.
      const a = [...S.pot, DARK].filter(c => !has.includes(c)).sort((x, y) => S.used[x] - S.used[y])[0] ?? DARK;
      plantFigure(S, w, w, m.figure, figureSize(S, t.amt, width(S, groundOf(S, w))), a, a === DARK ? UNDYED : DARK, null);
      note(S, 'figure', [w], `${N(w)} wove ${FIGURES[m.figure].words} into ${her(S, w)} own ground.`);
    } else if (m.kind === 'shut') { m.figure.until = S.y; S.joins.shut++; say(S, w, 'shut'); note(S, 'shut', [w, m.figure.who], `${N(w)} wove shut the figure ${N(m.figure.who)} had planted in ${her(S, w)} ground.`); }
    else if (m.kind === 'rejoin' && S.edges.includes(m.edge)) {
      const half = Math.max(2, Math.round(t.amt / 2)) / rows;
      open(S, m.edge, { who: w }, -half, half); tidy(S); say(S, w, 'rejoin'); note(S, 'rejoin', [w], `${N(w)} sat down at the bench again.`);
    }
  }

  // The rows themselves.
  for (let r = 0; r < rows; r++) weaveRow(S);
  for (const e of S.edges) { e.v = 0; e.x = Math.round(e.x); }
  for (let i = 0; i < S.grounds.length && S.grounds.length > 1; i++) if (width(S, i) < 1) { drop(S, i); i = -1; }
  S.fresh = S.next; S.next = S.weavers.map(() => []);
}

/* ------------------------------------------------------------------------------------- one cloth, decided together */

/**
 * PLANS. A plan is a way of laying a rug out, said in words: it cuts the rug's blocks into a few parts and wants each
 * part in one design, unlike the part it lies against. `part(r, k, R, K)` is which part the block in row `r`, place `k`
 * belongs to, of `R` rows and `K` places. Whose designs fill the parts is not the plan's: that is settled as each part is
 * begun. The guild agrees a plan before the first row from the rugs its weavers want to make (`planning`), so every
 * weaver has a rug in mind, knows whether the plan is it, and is told at every block what the plan wants there.
 */
export const PLANS = Object.freeze({
  bands: { name: 'Three broad bands', text: 'three broad bands across the rug, one after another, each band in a single design and the middle one unlike the two it lies between', parts: ['the first band', 'the middle band', 'the last band'], part: (r, k, R) => (r < Math.round(R / 3) ? 0 : r < R - Math.round(R / 3) ? 1 : 2) },
  frame: { name: 'A field in a frame', text: 'a frame all the way round the edge in one design, and the field inside it in another', parts: ['the frame', 'the field'], part: (r, k, R, K) => (r === 0 || r === R - 1 || k === 0 || k === K - 1 ? 0 : 1) },
  medallion: { name: 'A medallion', text: 'one design all over the rug, and in the very middle of it a medallion in another', parts: ['the ground', 'the medallion'], part: (r, k, R, K) => (Math.abs(r - (R - 1) / 2) < R / 4 && Math.abs(k - (K - 1) / 2) < K / 4 + 0.01 ? 1 : 0) },
  checker: { name: 'A chessboard', text: 'two designs turn and turn about like a chessboard, no block next to another of its own kind', parts: ['the first squares', 'the other squares'], part: (r, k) => (r + k) % 2 },
  stairs: { name: 'Stairs', text: 'broad bands running aslant across the rug like stairs, three designs in turn', parts: ['the first stair', 'the second stair', 'the third stair'], part: (r, k) => Math.floor((r + k) / 2) % 3 },
  quarters: { name: 'Quarters', text: 'the rug in four quarters, each in the same design as the quarter cornerwise across from it', parts: ['the first and last quarters', 'the other two quarters'], part: (r, k, R, K) => ((r < R / 2) === (k < K / 2) ? 0 : 1) },
  halves: { name: 'Two halves', text: 'the first half of the rug in one design and the second half in another, meeting in a straight line across the middle', parts: ['the first half', 'the second half'], part: (r, k, R) => (r < R / 2 ? 0 : 1) },
  one: { name: 'One field', text: 'the whole rug in a single design, calm from edge to edge', parts: ['the whole field'], part: () => 0 },
});
/** A design's kind: its colours and structures, whatever their fineness. A plan is kept by a design of the same kind. */
const kindOf = y => [y.a, ...y.strands.map(s => `${s.fill}.${s.counter ? 'x' : s.dye}`)].join('/'), sameKind = (a, b) => !!a && !!b && kindOf(a) === kindOf(b);
const are = (name, one = 'is', many = 'are') => (/s$/.test(name) ? many : one);
const cut = (key, R, K) => Array.from({ length: R }, (_, r) => Array.from({ length: K }, (_, k) => PLANS[key].part(r, k, R, K)));
/** Whether two parts of a plan lie against each other anywhere. */
const touching = (cells, a, b) => cells.some((row, r) => row.some((c, k) => c.part === a && [[r, k + 1], [r + 1, k], [r, k - 1], [r - 1, k]].some(([y, x]) => cells[y]?.[x]?.part === b)));
/** Of the blocks woven so far, the design most of each part of plan `key` is in (a block of it), no two parts claiming the same design. */
function mains(S, key) {
  const parts = cut(key, S.L.passes, S.L.places), n = PLANS[key].parts.length, counts = Array.from({ length: n }, () => new Map());
  S.grid.forEach((row, r) => row.forEach((c, k) => { const m = counts[parts[r][k]], at = m.get(c.look) ?? { n: 0, cell: c }; at.n++; m.set(c.look, at); }));
  const main = counts.map(m => [...m.values()].sort((a, b) => b.n - a.n)[0] ?? null);
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (main[a] && main[b] && main[a].cell.look === main[b].cell.look) main[main[a].n >= main[b].n ? b : a] = null;
  return { parts, main };
}
/** How many of the blocks woven so far would suit plan `key` as they stand: those in the design most of their part is in. */
function fitOf(S, key) {
  const { parts, main } = mains(S, key);
  return S.grid.reduce((sum, row, r) => sum + row.filter((c, k) => main[parts[r][k]]?.cell.look === c.look).length, 0);
}
/** Plan `key` taken up now. Parts already partly woven (a plan changed half way) are in the design most of them is in. */
function newPlan(S, key, was = null) {
  const def = PLANS[key], { parts, main } = mains(S, key);
  const cells = parts.map((row, r) => row.map((part, k) => ({ part, fits: S.grid[r] ? main[part]?.cell.look === S.grid[r][k].look : null })));
  return { key, name: def.name, text: def.text, parts: def.parts, by: S.vision.map((v, w) => (v === key ? w : -1)).filter(w => w >= 0), was,
    designs: main.map(m => (m ? { who: m.cell.who, yarn: m.cell.yarn, node: m.cell.node } : null)), cells, kept: cells.flat().filter(c => c.fits).length, woven: S.grid.length * S.L.places, over: null };
}
const wovenBy = S => (S.n === 1 ? 'one weaver' : `${S.n} weavers together`);

/** Before the first row: every weaver says what rug they want this to be, and the guild agrees one of them as the plan. */
async function planning(S) {
  const L = S.L, N = w => nm(S, w);
  S.plans = shuffled(Object.keys(PLANS), rng(S.seed, 'plans')).slice(0, L.plansOffered);
  const options = S.plans.map(key => ({ key, text: `${cap(PLANS[key].text)}.`, short: `the plan "${PLANS[key].name.toLowerCase()}"` }));
  const state = { loom: `One rug on a shared loom, to be woven by ${wovenBy(S)}. Nobody has a section of their own: it is woven in ${L.passes} rows of ${L.places} blocks, and for every block the group decides whose design is woven there. Nothing is woven yet but the border.`,
    pot: `The dyes in the pot: ${S.pot.map(d => S.lot.dyes[d].name).join(', ')}.` };
  const opt = await council(S, 'plan', 'Before the first row, the guild agrees what rug this is to be. A plan says how the rug is laid out; whose designs fill it is settled as it is woven. Which rug does {N} want to make?', options, state);
  const minds = S.record.at(-1).minds;
  S.vision = S.weavers.map((_, w) => { const m = minds[S.decider ? 0 : w]; return m.top ?? topOf(m.p); });
  S.plan = newPlan(S, opt.key);
  const rest = S.weavers.map((_, w) => w).filter(w => S.vision[w] !== opt.key);
  note(S, 'plan', S.weavers.map((_, w) => w), `The plan: ${PLANS[opt.key].text}.${S.plan.by.length && !S.decider ? ` It is the rug ${list(S.plan.by.map(N))} wanted.` : ''}${rest.length && !S.decider ? ` ${list(rest.map(w => `${N(w)} wanted ${PLANS[S.vision[w]].name.toLowerCase()}`))}.` : ''}`);
}

/** Half way: the guild steps back and looks at the whole. The plan is kept, changed for a rug another weaver wanted, or let go. */
async function review(S) {
  const P = S.plan, woven = S.grid.length * S.L.places, N = w => nm(S, w), others = [...new Set(S.vision.filter(v => v && v !== P.key))];
  const options = [{ key: 'keep', text: `Keep to the plan: ${P.text}. ${P.kept} of the ${woven} blocks woven keep to it.`, short: 'to keep to the plan' },
    ...others.map(v => ({ key: v, text: `Change the plan to the rug ${list(S.vision.map((x, w) => (x === v ? N(w) : null)).filter(Boolean))} wanted: ${PLANS[v].text}. ${fitOf(S, v)} of the ${woven} blocks woven would suit it as they stand.`, short: `to change the plan to ${PLANS[v].name.toLowerCase()}` })),
    { key: 'none', text: 'Let the plan go, and decide each block as it comes.', short: 'to let the plan go' }];
  const opt = await council(S, 'review', 'Half the rug is woven, and the guild steps back to look at the whole of it. What does {N} want done about the plan?', options, tableState(S, -1));
  if (opt.key === 'none') { P.over = S.pass; note(S, 'plan', S.weavers.map((_, w) => w), 'Half way, the guild let the plan go: from here each block is decided as it comes.'); }
  else if (opt.key !== 'keep') { S.plan = newPlan(S, opt.key, P.key); note(S, 'plan', S.weavers.map((_, w) => w), `Half way, the guild changed the plan: ${S.plan.text}.`); }
}

/**
 * ONE CLOTH, DECIDED TOGETHER (`together: true`). Nobody has a ground of their own. The rug is woven in rows of blocks,
 * `places` of them side by side, and what goes in each is the guild's decision, made the guild's way.
 *
 * THE WHOLE IS IN VIEW. Before the first row the guild agrees a plan for the rug from the rugs its weavers want (`plan`,
 * `PLANS`), and looks at it again half way. Every weaver is told, before every question, the plan and whose wish it
 * was, the rug they themselves wanted and how far the cloth suits it, and the whole of what is woven so far, row by
 * row. And every option for a block says whether it keeps to the plan there or breaks it.
 *
 * A ROW IS THREE BEATS. Every weaver says what design they put forward for it: their yarn kept, made new, or made from
 * another's, the same choices as at a ground of their own. If a part of the plan begins in this row, the guild chooses
 * the design it is to be in. Then, for every place in the row at once, the guild chooses among the designs on the
 * table, what the plan wants, and what the row before has there (under `propose` each place has its own caller, who
 * moves along the bench with every row; a proposal stands unless someone will not have it, and then its caller keeps
 * to it or gives way). Then the row is woven. A block is in the ground of whoever's design it is, so the cloth read by
 * ground is the cloth read by whose proposal was woven there.
 */
/**
 * Something a weaver says aloud, in words: `speak({ id, who, name, persona, about })` is whoever can write a sentence
 * (a chat model: `tools/llm.mjs`), since Jev can only weigh options. It is kept on the tape with the answers, so a rug
 * woven again says the same things. With nobody to write it, or when that fails, the weaver says `fallback`, a plain
 * sentence of where they lean, and it is marked as the script's.
 */
async function speech(S, w, id, { about, fallback }) {
  const me = S.weavers[w];
  let text = null, by = 'script';
  if (S.replay) { text = S.replay[id]?.text ?? null; by = S.replay[id]?.by ?? 'script'; }
  else if (S.speak && S.minds !== 'chance') try { text = await S.speak({ id, who: w, name: me.name, persona: `${me.who} ${S.moods[w]}`.trim(), about }); by = 'model'; } catch { text = null; }
  if (!text) { text = fallback; by = 'script'; }
  text = String(text).replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 260);
  S.tape[id] = { text, by };
  S.record.push({ kind: 'speech', pass: S.pass, who: w, id, text, by });
  S.entry.said.push({ pass: S.pass, who: w, key: 'speech', text });
  return text;
}

function tableState(S, w) {
  const total = S.used.reduce((s, x) => s + x, 0), K = S.L.places, blocks = S.grid.length * K, P = S.plan && S.plan.over == null ? S.plan : null, out = {};
  out.loom = `One rug on a shared loom, woven by ${wovenBy(S)}. Nobody has a section of their own: the rug is woven in rows of ${K} blocks side by side, and for every block the group decides whose design is woven there. Row ${S.pass + 1} of ${S.L.passes}.`;
  if (P) out.plan = `The plan the guild agreed: ${P.text}.${P.by.length ? ` It is the rug ${list(P.by.map(x => (x === w ? 'you' : nm(S, x))))} wanted.` : ''} ${P.parts.map((name, i) => `${cap(name)} ${are(name)} ${P.designs[i] ? yarnWords(S, P.designs[i].yarn) : 'not begun'}`).join('. ')}.${blocks ? ` ${P.kept} of the ${blocks} blocks woven keep to it.` : ''}`;
  else if (S.plan) out.plan = 'There was a plan, and the guild let it go half way: each block is decided as it comes.';
  if (P && w >= 0 && S.vision[w] !== P.key) out.wish = `The rug you wanted: ${PLANS[S.vision[w]].text}.`;
  out.table = `The designs on the table: ${S.weavers.map((x, i) => (S.yarn[i] ? `${i === w ? 'yours' : `${x.name}'s`}, ${yarnWords(S, S.yarn[i])}` : null)).filter(Boolean).join('; ') || 'none yet'}.`;
  if (blocks) {
    // The whole of what is woven, a letter a design, the newest row first: enough to see the shapes that have been made.
    const looks = [...new Set(S.grid.flat().map(c => c.look))], letter = c => String.fromCharCode(65 + looks.indexOf(c.look) % 26), first = look => S.grid.flat().find(c => c.look === look);
    out.woven = `The rug so far, a letter for each design, the newest row first: ${S.grid.map((row, r) => `row ${r + 1}: ${row.map(letter).join(' ')}`).reverse().join(' | ')}. ${looks.map((look, i) => `${String.fromCharCode(65 + i % 26)} is ${nm(S, first(look).who)}'s ${yarnWords(S, first(look).yarn)}`).join('; ')}.`;
    out.share = `Of the ${blocks} blocks woven so far, in each weaver's design: ${S.weavers.map((x, i) => `${x.name} ${S.placed[i]}`).join(', ')}.`;
  } else out.woven = 'Nothing is woven yet but the border.';
  out.pot = `The dyes in the pot: ${S.pot.map(d => `${S.lot.dyes[d].name}${total ? ` ${Math.round(100 * S.used[d] / total)}%` : ''}`).join(', ')}.`;
  return out;
}

/**
 * THE FREE CUT (`cut: 'free'`). How a row of decisions is cut into cloth when the blocks are not all one square. Nothing
 * is asked that was not asked before: it is read from the weights the room has already given, and the rule is one.
 * WHAT THE ROOM WANTED MORE GETS MORE OF THE CLOTH. A row is as deep as the room was agreed on it. A block is as wide
 * as it was wanted beside the others of its row, and begins the sooner for it: where a design was wanted less, what is
 * below runs on a while first. Where the room, all told, wanted another design more than the one that was woven (a
 * caller kept to their own, or the draw fell the other way), that design stands inside the block as a figure, the
 * larger the more it was wanted, in the mark of the weaver whose design it is. The edge between two blocks walks from
 * where the row below had it to where this row puts it, so nothing is square. And the edges are joined as in the other
 * game (`JOINS`): dovetailed where neither block was refused, hatched where a caller gave way, a slit where one kept
 * to it over an objection; and there the figure, which is what the room wanted instead, has a dark line round it.
 */
const FREE = Object.freeze({
  floor: 0.25,              // Added to every weight before a row's width is shared out, so that nothing wanted a little is cut to nothing.
  shallow: 0.5, deep: 1.6,  // The shallowest and the deepest a row may be, in usual rows.
  steep: 1.5,               // Rows differ less in how wanted they were than blocks do: the power their weights are raised to before the depth is shared out.
  late: 0.45,               // The latest a block may begin, as a share of its row's depth.
  figure: [0.1, 0.4],       // The share of a block its figure fills: where the room wanted it as much as what was woven, and at the most.
});
/** Each weaver's mark, by their seat: the figure their design stands as inside another's block. */
const MARKS = Object.keys(FIGURES);
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
/** The straight slopes through the points (`xs`, `ys`), read at `x`; level beyond the first and the last. */
function sloped(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys.at(-1);
}

/** One row of the rug woven in the free cut: `cells` its places as the guild decided them, `blocks` the same with places of one design run together. */
function weaveFree(S, cells, blocks) {
  const L = S.L, K = L.places, { x0, x1, field, cloth } = S, C = S.cut ??= { lines: null, below: null, usual: [] }, rnd = rng(S.seed, 'cut', S.pass);
  for (const c of cells) {
    // Without minds the weights are the stream's own, as every choice is.
    const P = c.P, w = S.minds === 'chance' ? normalise(Object.fromEntries(P.keys.map(k => [k, rnd() ** 2 + 0.05]))) : P.sum;
    const next = P.options.filter(o => o.key !== P.chose && !sameKind(o.yarn, c.yarn)).reduce((a, o) => (!a || w[o.key] > w[a.key] ? o : a), null);
    c.want = w[P.chose]; c.next = next && { who: next.who, yarn: next.yarn, node: next.node, times: w[next.key] / c.want };
    c.join = P.answer ? (P.answer.chose === 'keep' ? 'slit' : 'hatch') : S.way === 'propose' && !S.decider && S.n > 1 && !P.refusers.length ? 'dovetail' : 'plain';
    c.pass = S.pass; c.ground = { who: c.who, yarn: c.yarn, node: c.node, plied: mindsOf(c.yarn).size > 1 };
  }
  // How deep: this row's share of what is left of the rug, were the rows to come wanted as the rows so far have been.
  const left = cloth.H - L.band - S.y, after = L.passes - 1 - S.pass, lo = Math.round(L.rows * FREE.shallow), hi = Math.round(L.rows * FREE.deep), weight = mean(cells.map(c => c.want)) ** FREE.steep;
  C.usual.push(weight);
  const depth = Math.max(lo, left - after * hi, Math.min(hi, left - after * lo, Math.round(left * weight / (weight + after * mean(C.usual)))));
  // How wide: the field shared out among the row's places by how much each was wanted.
  const parts = cells.map(c => FREE.floor + c.want), whole = parts.reduce((s, x) => s + x, 0), below = C.below, was = C.lines ?? null;
  let acc = 0;
  const to = [x0, ...parts.slice(0, -1).map(v => Math.round(x0 + field * (acc += v) / whole)), x1];
  // How soon: the most wanted block of the row begins at once, the rest later; between two blocks' middles the seam slopes.
  const best = Math.max(...cells.map(c => c.want)), most = Math.max(0, Math.min(depth - 4, Math.round(FREE.late * depth)));
  const late = cells.map(c => (below ? Math.round(most * (1 - c.want / best)) : 0)), mid = cells.map((c, k) => (to[k] + to[k + 1]) / 2);
  const seam = Array.from({ length: field }, (_, i) => Math.round(sloped(mid, late, x0 + i + 0.5)));
  // Every edge walks from where the row below left it to its place in this row, setting out when the new design reaches it.
  const lines = to.map((t, k) => {
    const f = was ? was[k] : t, start = f === t ? 0 : seam[Math.max(0, Math.min(field - 1, f - x0))], pace = Math.abs(t - f) / Math.max(1, depth - 1 - start);
    return j => Math.round(f + Math.sign(t - f) * Math.min(Math.abs(t - f), Math.max(0, j - start) * pace));
  });
  const place = (xs, x) => { let k = 0; while (k < K - 1 && x >= xs[k + 1]) k++; return k; };
  // The figures: where the room wanted another design more, that design set in the middle of what the block has to itself.
  for (const [k, c] of cells.entries()) {
    c.fig = null;
    if (L.simple || !c.next || c.next.times < 1) continue;
    const wait = Math.max(...seam.slice(to[k] - x0, to[k + 1] - x0), 0), tall = depth - wait, kind = MARKS[c.next.who % MARKS.length], fills = Math.min(FREE.figure[1], FREE.figure[0] * c.next.times);
    let n = Math.min(Math.floor(Math.sqrt(fills * (to[k + 1] - to[k]) * tall / 2)), Math.floor((tall - 3) / 2));
    const j0 = wait + Math.max(1, Math.floor((tall - FIGURES[kind].rows(Math.max(n, 0))) / 2)), jm = j0 + (FIGURES[kind].rows(Math.max(n, 0)) >> 1), a = lines[k](jm), b = lines[k + 1](jm);
    n = Math.min(n, Math.floor((b - a - 4) / 2));
    if (n < 2) continue;
    c.fig = { ...c.next, kind, n, cx: Math.round((a + b) / 2), j0, rows: FIGURES[kind].rows(n), rim: c.join === 'slit' ? DARK : null, plied: mindsOf(c.next.yarn).size > 1 };
    S.joins.figure++;
  }
  const figs = cells.filter(c => c.fig);
  // Said for the story and the page, and to no weaver: nothing they are asked changes with the cut but the cloth itself.
  if (figs.length) note(S, 'figure', [], `Row ${S.pass + 1}: the room wanted another design more than the one woven in ${list(figs.map(c => `place ${c.k + 1} (${nm(S, c.fig.who)}'s, in ${nm(S, c.who)}'s)`))}, and it stands there as a figure.`);
  const ref = new Array(field);
  for (let j = 0; j < depth; j++) {
    const y = S.y, at = lines.map(f => f(j)), runs = [];
    for (let x = x0; x < x1; x++) {
      const c = below && j < seam[x - x0] ? below[place(was, x)] : cells[place(at, x)], last = runs.at(-1);
      ref[x - x0] = c; lay(S, x, y, c.ground);
      if (last && last.node === c.node) last.to = x + 1; else runs.push({ node: c.node, from: x, to: x + 1 });
    }
    // Wherever two designs meet in this row, the edge is joined as their two blocks were decided.
    for (let i = 1; i < runs.length; i++) {
      const xb = runs[i].from, A = ref[xb - 1 - x0], B = ref[xb - x0], both = [A.join, B.join];
      const join = A.pass !== B.pass ? 'plain' : both.includes('slit') ? 'slit' : both.includes('hatch') ? 'hatch' : both.every(x => x === 'dovetail') ? 'dovetail' : 'plain';
      if (join === 'slit') cloth.mark[y * cloth.W + xb] |= MARK.slit;
      else if (join === 'dovetail') { if ((y >> 1) & 1) { if (xb < runs[i].to - 1) lay(S, xb, y, A.ground); } else if (xb - 1 > runs[i - 1].from) lay(S, xb - 1, y, B.ground); }
      else if (join === 'hatch') { const G = (y & 1 ? A : B).ground; for (let x = Math.max(runs[i - 1].from, xb - 3); x < Math.min(runs[i].to, xb + 3); x++) put(S, x, y, G.yarn.a, G.who, MARK.hatch, G.yarn.aBy, G.yarn.aBy, G.who); }
    }
    for (const c of cells) {
      const f = c.fig;
      if (!f || j < f.j0 - 1 || j > f.j0 + f.rows) continue;
      for (let dx = -f.n - 1; dx <= f.n + 1; dx++) {
        const x = f.cx + dx, m = x < x0 || x >= x1 || ref[x - x0] !== c ? 0 : figureAt(f.kind, dx, j - f.j0, f.n);
        if (m === 3) { if (f.rim !== null) put(S, x, y, f.rim, f.who, MARK.figure); }
        else if (m) { const st = stitchOf(f.yarn, x, y, STITCH); put(S, x, y, st.dye, f.who, MARK.figure | (f.plied ? MARK.plied : 0), st.by, st.by2); }
      }
    }
    closeRow(S);
  }
  C.lines = to; C.below = cells;
  // The bench as the row's last line of stitches has it.
  S.grounds = blocks.map(b => ({ who: b.who, yarn: b.yarn, node: b.node }));
  S.edges = [...blocks.map(b => to[b.from]), x1].map(x => ({ x, v: 0, join: 'plain', knot: 0 }));
}

async function together(S) {
  const L = S.L, p = S.pass, n = S.n, K = L.places, D = S.decider, N = w => nm(S, w), words = y => yarnWords(S, y), below = S.below;
  const span = (a, b) => (a === b ? `place ${a + 1}` : b === a + 1 ? `places ${a + 1} and ${b + 1}` : `places ${a + 1} to ${b + 1}`);
  S.reach = n > 1 && p > 0 ? reachOf(S.cloth, L.guard, n) : null;
  if (S.plan && S.plan.over == null && p === Math.floor(L.passes / 2)) await review(S);
  const plan = S.plan && S.plan.over == null ? S.plan : null, row = plan?.cells[p] ?? null;
  // What the plan wants of this row, said once to everyone before they put a design forward.
  const runs = row ? row.reduce((out, c, k) => { const last = out.at(-1); if (last && last.part === c.part && last.to === k - 1) last.to = k; else out.push({ part: c.part, from: k, to: k }); return out; }, []) : [];
  const wants = !plan || L.planSay === 'context' ? '' : `By the plan, in this row: ${runs.map(r => `${span(r.from, r.to)} ${r.from === r.to ? 'is' : 'are'} part of ${plan.parts[r.part]}, ${plan.designs[r.part] ? `which ${are(plan.parts[r.part])} ${words(plan.designs[r.part].yarn)}` : `which ${are(plan.parts[r.part], 'begins', 'begin')} here, in a design the guild will choose from those put forward now`}`).join('; ')}. `;

  // BEAT 1. What each weaver puts forward for this row: one call each, all at once.
  const turns = await Promise.all(S.weavers.map(async (me, w) => {
    const rnd = rng(S.seed, 'offer', p, me.key), yarns = S.yarn[w] && S.kept[w] < L.settle ? null : yarnOffer(S, w, rnd);
    if (!yarns) return { w, yarns, a: null };
    const Q = {
      yarn: { ask: `${memory(S, w)}The group is about to weave row ${p + 1}. ${wants}What design does {N} put forward for it? ${yarns.some(o => o.from >= 0) ? 'Some of these take something from another weaver\'s design. ' : ''}Each option says what the design would be. Choose as {S} would.`, options: yarns },
      fine: { ask: 'How fine is the pattern {N} wants just now?', anchors: FINE.map(x => `{N} wants it ${x}`) },
    };
    return { w, yarns, a: await mind(S, w, `p${p}.${me.key}`, Q, tableState(S, w)) };
  }));
  const was = S.node.slice();
  for (const { w, yarns, a } of turns) {
    if (!yarns) { S.kept[w]++; continue; }
    const yarn = yarns.find(o => o.key === draw(a.yarn.p, temp(S, w), a.yarn.r)), s = Math.round(4 - 3 * a.fine.u);
    S.record.push({ kind: 'turn', pass: p, who: w, id: a.id, by: a.by, why: a.why, ms: a.ms, state: a.state, asked: a.asked, move: null,
      yarn: kept(yarns.map(o => ({ ...o, yarn: o.yarn ? sized(o.yarn, s) : S.yarn[w] })), a.yarn, yarn.key), weaving: S.yarn[w], bold: 0, fine: a.fine.u });
    if (!yarn.yarn) S.kept[w]++;
    else setYarn(S, w, sized(yarn.yarn, s), yarn.kind, yarn.from, yarn.told ? said(S.weavers[w], yarn.told) : '', was);
  }
  const table = S.weavers.map((_, w) => w).filter(w => S.yarn[w]);

  // A part of the plan that begins in this row is given its design: one of those on the table, unlike the parts it lies against.
  if (plan) for (const part of [...new Set(row.map(c => c.part))].filter(i => !plan.designs[i])) {
    const beside = plan.designs.filter((d, i) => d && i !== part && touching(plan.cells, part, i)), free = table.filter(w => !beside.some(d => sameKind(d.yarn, S.yarn[w])));
    const options = (free.length > 1 || (free.length && table.length === 1) ? free : table).map(w => ({ key: `d${w}`, who: w, text: `${N(w)}'s design: ${words(S.yarn[w])}.`, short: `${N(w)}'s ${words(S.yarn[w])} for ${plan.parts[part]}` }));
    const opt = options.length > 1 ? await council(S, `part${part}`, `By the plan, ${plan.parts[part]} ${are(plan.parts[part], 'begins', 'begin')} in row ${p + 1}. ${beside.length ? `${are(plan.parts[part], 'It lies', 'They lie')} against ${list(beside.map(d => words(d.yarn)))}. ` : ''}Which design does {N} want ${are(plan.parts[part], 'it', 'them')} woven in, wherever the plan has ${are(plan.parts[part], 'it', 'them')}?`, options, tableState(S, -1), `${cap(plan.parts[part])} ${are(plan.parts[part], 'begins', 'begin')}`) : options[0];
    plan.designs[part] = { who: opt.who, yarn: S.yarn[opt.who], node: S.node[opt.who] };
    if (options.length === 1) note(S, 'council', [], `${cap(plan.parts[part])} ${are(plan.parts[part])} to be ${N(opt.who)}'s ${words(S.yarn[opt.who])}.`);
  }

  // BEAT 2. Every place in the row, decided at once: each design on the table, what the plan wants, or what the row before has.
  const where = k => `place ${k + 1} of ${K}${k === 0 ? ', at one edge' : k === K - 1 ? ', at the other edge' : ''}`;
  const fit = o => (o.fits == null || o.plan || L.planSay !== 'full' ? '' : o.fits ? ' That keeps to the plan.' : ' That breaks the plan here.');
  const text = (o, me, P) => (o.plan ? (L.planSay === 'context' ? `${N(o.who)}'s design as it was earlier: ${words(o.yarn)}.` : `Keep to the plan: ${words(o.yarn)}, ${N(o.who)}'s design as it was when ${plan.parts[P.part]} ${are(plan.parts[P.part], 'was', 'were')} begun.`)
    : o.on ? `Carry on what the row before has here: ${words(o.yarn)}, ${N(o.who)}'s design from an earlier row.${fit(o)}`
      : `${o.who === me ? 'Your own design' : `${N(o.who)}'s design`}: ${words(o.yarn)}.${o.runs ? ' It is what the row before has here, so the block would run on.' : ''}${fit(o)}`);
  const places = Array.from({ length: K }, (_, k) => {
    const b = below?.[k] ?? null, part = row ? row[k].part : -1, want = plan ? plan.designs[part] : null, fits = y => (want ? sameKind(y, want.yarn) : null);
    const options = table.map(w => ({ key: `d${w}`, who: w, yarn: S.yarn[w], node: S.node[w], runs: !!b && sameLook(b.yarn, S.yarn[w]), fits: fits(S.yarn[w]) }));
    if (want && !options.some(o => o.fits)) options.push({ key: 'plan', who: want.who, yarn: want.yarn, node: want.node, plan: true, fits: true });
    if (b && !options.some(o => sameLook(o.yarn, b.yarn))) options.push({ key: 'on', who: b.who, yarn: b.yarn, node: b.node, on: true, fits: fits(b.yarn) });
    return { k, b, part, want, options, keys: options.map(o => o.key), caller: L.fixedCaller ? S.caller : (S.caller + p + k) % n, sub: rng(S.seed, 'council', `c${p}.place${k}`) };
  });
  const about = P => `Row ${p + 1}, ${where(P.k)}. ${P.want && L.planSay !== 'context' ? `By the plan this is part of ${plan.parts[P.part]}, which ${are(plan.parts[P.part])} ${words(P.want.yarn)}. ` : ''}${P.b ? `The row before has ${words(P.b.yarn)} here. ` : ''}`;
  const spoken = [], heardBy = me => (spoken.length ? `Before deciding, each weaver said what they want of this row. ${spoken.filter(x => L.hearSelf || x.w !== me).map(x => `${x.w === me ? 'You' : N(x.w)}: “${x.text}”`).join(' ')} ` : '');
  const picks = me => Object.fromEntries(places.map(P => [`pick${P.k}`, { what: 'guild:place', options: P.options.map(o => ({ key: o.key, text: text(o, me, P), kind: o.plan ? 'plan' : o.on ? 'on' : 'design', from: o.who })),
    ask: `${P.k === 0 && me >= 0 ? memory(S, me) : ''}${heardBy(me)}${about(P)}Which design does {N} want the group to weave here?` }]));
  // DELIBERATION. Where each leans, asked alone; what each then says of the row, in the order the call moves along the bench; and then the question again.
  const talking = L.deliberate && !D && n > 1;
  let lean = null;
  if (talking) {
    lean = await Promise.all(S.weavers.map((me, w) => mind(S, w, `c${p}.lean.${me.key}`, picks(w), tableState(S, w))));
    const topOfPick = (w, P) => P.options.find(o => o.key === (lean[w][`pick${P.k}`].top ?? topOf(lean[w][`pick${P.k}`].p)));
    for (let i = 0; i < n && L.deliberate !== 'silent'; i++) {
      const w = (S.caller + p + i) % n, st = tableState(S, w), leans = places.map(P => `place ${P.k + 1}: ${text(topOfPick(w, P), w, P).replace(/ (That keeps to the plan|That breaks the plan here|It is what the row before has here, so the block would run on)\./g, '')}`).join(' ');
      const most = places.map(P => topOfPick(w, P)).reduce((m, o) => m.set(o.key, (m.get(o.key) ?? 0) + 1), new Map()), mine = [...most].sort((a, b) => b[1] - a[1])[0][0], first = places.map(P => topOfPick(w, P)).find(o => o.key === mine);
      spoken.push({ w, text: await speech(S, w, `d${p}.${S.weavers[w].key}`, {
        about: `${st.loom} ${st.plan ?? ''} ${st.table} ${st.woven} The group is about to decide row ${p + 1}. ${wants}Where ${N(w)} leans, place by place: ${leans} ${spoken.length ? `Said so far: ${spoken.map(x => `${N(x.w)}: “${x.text}”`).join(' ')}` : `${N(w)} speaks first.`} In one or two short sentences, say what ${N(w)} wants for this row and why, in ${her(S, w)} own voice, to the others. Do not go through the places one by one.`,
        fallback: `I want ${first.plan ? 'us to keep to the plan' : first.on ? 'to carry on what the row before has' : first.who === w ? 'my own design in this row' : `${N(first.who)}'s design in this row`}.` }) });
    }
  }
  const got = D ? [await mind(S, -1, `c${p}.place.${D.key}`, picks(-1), tableState(S, -1))] : await Promise.all(S.weavers.map((me, w) => mind(S, w, `c${p}.place.${me.key}`, picks(w), tableState(S, w))));
  for (const P of places) {
    const key = `pick${P.k}`, ps = P.ps = got.map(a => a[key].p);
    P.sum = normalise(Object.fromEntries(P.keys.map(k => [k, ps.reduce((s, q) => s + q[k], 0)])));
    P.product = normalise(Object.fromEntries(P.keys.map(k => [k, ps.reduce((s, q) => s * Math.max(q[k], 1e-4), 1)])));
    P.proposal = null; P.takes = null; P.refusers = []; P.answer = null;
    if (D) P.chose = draw(ps[0], temp(S, -1), got[0][key].r);
    else if (S.way === 'vote') P.chose = draw(P.sum, L.councilTemperature, P.sub());
    else if (S.way === 'consensus') P.chose = draw(P.product, L.councilTemperature, P.sub());
    else P.chose = P.proposal = draw(ps[P.caller], temp(S, P.caller), got[P.caller][key].r);
  }
  if (!D && S.way === 'propose' && n > 1) {
    // Everyone hears every proposal but their own, in one call; then each caller who was refused answers for theirs.
    const said1 = (P, key, me) => text(P.options.find(o => o.key === key), me, P);
    const heard = await Promise.all(S.weavers.map((me, w) => mind(S, w, `c${p}.take.${me.key}`, Object.fromEntries(places.filter(P => P.caller !== w).map(P => [`take${P.k}`,
      { ask: `${N(P.caller)} proposes, for ${where(P.k)}: "${said1(P, P.proposal, w)}" How does {N} take it?`, anchors: REACT.map(x => `{N} ${x}`), what: 'guild:take', about: P.caller }])), tableState(S, w))));
    for (const P of places) {
      const others = S.weavers.map((_, w) => w).filter(w => w !== P.caller);
      P.takes = Object.fromEntries(others.map(w => [w, heard[w][`take${P.k}`].u]));
      // A block is a small thing beside the dye lot or the border: minding it is not refusing it. Only "will not have it" is.
      P.refusers = others.filter(w => Math.round(P.takes[w] * (REACT.length - 1)) === REACT.length - 1);
      const rest = P.keys.filter(k => k !== P.proposal);
      if (P.refusers.length && rest.length) {
        const room = rest.reduce((a, k) => (P.sum[k] > P.sum[a] ? k : a), rest[0]), least = rest.reduce((a, k) => (P.product[k] > P.product[a] ? k : a), rest[0]);
        P.ways = [{ key: 'keep', text: `Keep to it over ${list(P.refusers.map(N))}'s objection: "${said1(P, P.proposal, P.caller)}"`, gives: P.proposal },
          { key: 'room', text: `Give way to what the room wants most: "${said1(P, room, P.caller)}"`, gives: room },
          ...(least !== room ? [{ key: 'least', text: `Take what nobody much minds: "${said1(P, least, P.caller)}"`, gives: least }] : [])];
      }
    }
    if (talking && L.deliberate !== 'silent') for (const P of places.filter(P => P.ways)) P.why = await Promise.all(P.refusers.slice(0, 2).map(w => speech(S, w, `d${p}.no${P.k}.${S.weavers[w].key}`, {
      about: `${tableState(S, w).loom} ${tableState(S, w).plan ?? ''} ${N(P.caller)} proposes, for ${where(P.k)} of row ${p + 1}: "${said1(P, P.proposal, w)}" ${N(w)} will not have it. In one short sentence, say why, in ${her(S, w)} own voice, to ${N(P.caller)}.`,
      fallback: 'I will not have it.' }).then(line => ({ w, text: line }))));
    const refused = S.weavers.map((_, w) => places.filter(P => P.caller === w && P.ways));
    const answers = await Promise.all(refused.map((mine, w) => (mine.length ? mind(S, w, `c${p}.answer.${S.weavers[w].key}`, Object.fromEntries(mine.map(P => [`answer${P.k}`,
      { ask: `{N} proposed, for ${where(P.k)}: "${said1(P, P.proposal, w)}" ${list(P.refusers.map(N))} will not have it. ${P.why ? `${P.why.map(x => `${N(x.w)}: “${x.text}”`).join(' ')} ` : ''}What does {N} do?`, options: P.ways, what: 'guild:answer' }])), tableState(S, w)) : null)));
    for (const P of places) {
      if (!P.ways) { S.joins[P.refusers.length ? 'plain' : 'dovetail']++; continue; }
      const a = answers[P.caller], q = a[`answer${P.k}`], k = draw(q.p, temp(S, P.caller), q.r);
      P.answer = { ...kept(P.ways, q, k), by: a.by };
      for (const w of P.refusers) { S.tally[w].refused++; if (k === 'keep') S.tally[w].overruled++; }
      if (k === 'keep') { S.tally[P.caller].kept++; S.joins.slit++; for (const w of P.refusers) S.pair[P.caller][w].kept++; } else { S.tally[P.caller].gave++; S.joins.hatch++; }
      P.chose = P.ways.find(o => o.key === k).gives;
    }
    say(S, places[0].caller, 'proposes');
    const loud = places.find(P => P.refusers.length);
    if (loud) { say(S, loud.refusers[0], 'objects'); if (loud.answer) say(S, loud.caller, loud.answer.chose === 'keep' ? 'keep' : 'back'); }
  }
  for (const P of places) {
    const key = `pick${P.k}`, ps = P.ps, o = P.options.find(x => x.key === P.chose);
    S.record.push({ kind: 'council', pass: p, what: `place${P.k}`, title: `Row ${p + 1}, place ${P.k + 1} of ${K}`, way: D ? 'decider' : S.way, ...(D ? { decider: D.name } : {}), caller: D ? -1 : P.caller, state: got[0].state,
      asked: `${about(P)}Which design does each of them want the group to weave here?`, ...(P.want ? { plan: { part: plan.parts[P.part], fits: o.fits } } : {}),
      options: P.options.map(x => ({ key: x.key, text: text(x, -1, P), yarn: x.yarn, from: x.who })), minds: got.map(a => ({ p: a[key].p, top: a[key].top, by: a.by, why: a.why, sure: a[key].sure, ms: a.ms })),
      sum: P.sum, product: P.product, proposal: P.proposal, takes: P.takes, refusers: P.refusers, answer: P.answer, chose: P.chose,
      ...(lean ? { lean: lean.map(a => a[key].top ?? topOf(a[key].p)), leanP: lean.map(a => a[key].p), why: P.why ?? null } : {}),
      content: D ? S.weavers.map(() => ps[0][P.chose] / Math.max(...Object.values(ps[0]))) : ps.map(q => q[P.chose] / Math.max(...Object.values(q))) });
  }

  // BEAT 3. The row: side by side, places of one design run together into one block.
  const cells = places.map(P => { const o = P.options.find(x => x.key === P.chose); return { who: o.who, yarn: o.yarn, node: o.node, look: kindOf(o.yarn), k: P.k, fits: o.fits, P }; });
  const blocks = cells.reduce((out, c) => { const last = out.at(-1); if (last && last.node === c.node) last.to = c.k; else out.push({ ...c, from: c.k, to: c.k }); return out; }, []);
  if (L.cut !== 'free') {
    S.grounds = blocks.map(b => ({ who: b.who, yarn: b.yarn, node: b.node }));
    S.edges = [...blocks.map(b => b.from), K].map(k => ({ x: Math.round(S.x0 + S.field * k / K), v: 0, join: 'plain', knot: 0 }));
  }
  for (const c of cells) S.placed[c.who]++;
  S.grid.push(cells.map(c => ({ who: c.who, yarn: c.yarn, node: c.node, look: c.look })));
  if (plan) { cells.forEach(c => { row[c.k].fits = !!c.fits; }); plan.woven += K; plan.kept += cells.filter(c => c.fits).length; }
  note(S, 'placed', table, `Row ${p + 1}: ${blocks.map(b => `${N(b.who)}'s ${words(b.yarn)} in ${span(b.from, b.to)}`).join('; ')}.`);
  const broke = plan ? cells.filter(c => !c.fits) : [];
  if (broke.length) note(S, 'broke', [...new Set(broke.map(c => c.who))], `Row ${p + 1} broke the plan in ${list(broke.map(c => `place ${c.k + 1} (${N(c.who)}'s ${words(c.yarn)}, where ${plan.parts[c.P.part]} ${are(plan.parts[c.P.part], 'was', 'were')} to be ${words(c.P.want.yarn)})`))}.`);
  for (const P of places) if (P.answer) {
    const o = P.options.find(x => x.key === P.proposal), what = o.plan ? `keeping to the plan (${words(o.yarn)})` : o.on ? `carrying on ${N(o.who)}'s ${words(o.yarn)}` : `${o.who === P.caller ? `${her(S, P.caller)} own design` : `${N(o.who)}'s design`}, ${words(o.yarn)},`;
    note(S, P.answer.chose === 'keep' ? 'slit' : 'hatch', [P.caller, ...P.refusers], `${N(P.caller)} proposed ${what} for place ${P.k + 1}. ${list(P.refusers.map(N))} would not have it, and ${N(P.caller)} ${P.answer.chose === 'keep' ? 'kept to it' : 'gave way'}.`);
  }
  for (const w of table) if (n > 1 && !cells.some(c => c.who === w)) note(S, 'left', [w], `Nothing of ${N(w)}'s design was woven in row ${p + 1}.`);
  if (L.cut === 'free') weaveFree(S, cells, blocks); else for (let r = 0; r < L.rows; r++) weaveRow(S);
  S.below = cells.map(c => ({ who: c.who, yarn: c.yarn, node: c.node }));
  S.fresh = S.next; S.next = S.weavers.map(() => []);
}

/** A passage in which everyone weaves one yarn, each in their own place: the guild's choice when it steps back. */
function unison(S) {
  S.unison = S.unisonNext.yarn; S.entry.unison = S.unisonNext.node; S.unisonNext = null; S.joins.unison++;
  for (const e of S.edges) e.v = 0;
  for (let r = 0; r < S.L.rows; r++) weaveRow(S);
  S.unison = null; S.fresh = S.next; S.next = S.weavers.map(() => []);
}

/* ----------------------------------------------------------------------------------------------------- the guild */

/**
 * Something decided for the whole rug: every weaver weighs the same options in their own mind (one call each, made
 * together), and the guild's way (`WAYS`) makes one choice of their five sets of weights. Returns the option chosen.
 */
async function council(S, what, ask, options, state, title = null) {
  const L = S.L, id = `c${S.pass}.${what}`, caller = S.caller, sub = rng(S.seed, 'council', id), N = w => S.weavers[w].name;
  if (S.decider) {
    const a = await mind(S, -1, `${id}.${S.decider.key}`, { pick: { ask, options, what: `guild:${what}` } }, state), chose = draw(a.pick.p, temp(S, -1), a.pick.r), opt = options.find(o => o.key === chose);
    S.record.push({ kind: 'council', pass: S.pass, what, ...(title ? { title } : {}), way: 'decider', decider: S.decider.name, caller: -1, asked: a.asked.pick, state, options: options.map(o => ({ key: o.key, text: o.text })),
      minds: [{ p: a.pick.p, top: a.pick.top, by: a.by, why: a.why, sure: a.pick.sure, ms: a.ms }], sum: a.pick.p, product: a.pick.p, proposal: null, takes: null, refusers: [], answer: null, chose,
      content: S.weavers.map(() => a.pick.p[chose] / Math.max(...Object.values(a.pick.p))) });
    if (what === 'lot') say(S, -1, 'proposes');
    note(S, 'council', [], `${S.decider.name} chose ${opt.short ?? `"${opt.text}"`}.`);
    return opt;
  }
  const got = await Promise.all(S.weavers.map((me, w) => mind(S, w, `${id}.${me.key}`, { pick: { ask, options, what: `guild:${what}` } }, state)));
  const ps = got.map(a => a.pick.p), keys = options.map(o => o.key), text = k => options.find(o => o.key === k).text;
  const sum = normalise(Object.fromEntries(keys.map(k => [k, ps.reduce((s, q) => s + q[k], 0)])));
  const product = normalise(Object.fromEntries(keys.map(k => [k, ps.reduce((s, q) => s * Math.max(q[k], 1e-4), 1)])));
  const rec = { kind: 'council', pass: S.pass, what, ...(title ? { title } : {}), way: S.way, caller, asked: got[0].asked.pick, state, options: options.map(o => ({ key: o.key, text: o.text })),
    minds: got.map(a => ({ p: a.pick.p, top: a.pick.top, by: a.by, why: a.why, sure: a.pick.sure, ms: a.ms })), sum, product, proposal: null, takes: null, refusers: [], answer: null };
  let chose;
  if (S.way === 'vote') chose = draw(sum, L.councilTemperature, sub());
  else if (S.way === 'consensus') chose = draw(product, L.councilTemperature, sub());
  else {
    chose = rec.proposal = draw(ps[caller], temp(S, caller), got[caller].pick.r);
    if (S.way === 'propose') {
      const others = S.weavers.map((_, w) => w).filter(w => w !== caller);
      const takes = await Promise.all(others.map(w => mind(S, w, `${id}.take.${S.weavers[w].key}`,
        { take: { ask: `${N(caller)} proposes, for the whole rug: "${text(chose)}" How does {N} take it?`, anchors: REACT.map(x => `{N} ${x}`), what: 'guild:take', about: caller } }, state)));
      rec.takes = Object.fromEntries(others.map((w, i) => [w, takes[i].take.u]));
      rec.refusers = others.filter(w => rec.takes[w] >= L.refuse);
      say(S, caller, 'proposes');
      if (rec.refusers.length) {
        say(S, rec.refusers[0], 'objects');
        const rest = keys.filter(k => k !== chose), room = rest.reduce((a, k) => (sum[k] > sum[a] ? k : a), rest[0]), least = rest.reduce((a, k) => (product[k] > product[a] ? k : a), rest[0]);
        const ways = [{ key: 'keep', text: `Keep to it over ${list(rec.refusers.map(N))}'s objection: "${text(chose)}"`, gives: chose },
          { key: 'room', text: `Give way to what the room wants most: "${text(room)}"`, gives: room },
          ...(least !== room ? [{ key: 'least', text: `Take what nobody much minds: "${text(least)}"`, gives: least }] : [])];
        const a = await mind(S, caller, `${id}.answer`, { answer: { ask: `{N} proposed, for the whole rug: "${text(chose)}" ${list(rec.refusers.map(N))} will not have it. What does {N} do?`, options: ways, what: 'guild:answer' } }, state);
        const k = draw(a.answer.p, temp(S, caller), a.answer.r);
        rec.answer = { ...kept(ways, a.answer, k), by: a.by };
        for (const w of rec.refusers) { S.tally[w].refused++; if (k === 'keep') S.tally[w].overruled++; }
        if (k === 'keep') S.tally[caller].kept++; else S.tally[caller].gave++;
        chose = ways.find(o => o.key === k).gives;
      }
    }
  }
  rec.chose = chose;
  rec.content = ps.map(q => q[chose] / Math.max(...Object.values(q)));
  S.record.push(rec);
  const opt = options.find(o => o.key === chose);
  note(S, 'council', [], `The guild chose ${opt.short ?? `"${opt.text}"`}${rec.refusers.length ? `, over ${list(rec.refusers.map(N))}'s objection to ${N(caller)}'s first proposal` : ''}.`);
  return opt;
}

/** The dye lot and the border, before a row is woven. */
async function begin(S) {
  const rnd = rng(S.seed, 'begin'), L = S.L;
  const lots = shuffled(DYE_LOTS, rnd).slice(0, L.lotsOffered).map(l => ({ key: l.key, text: l.words, short: l.name.toLowerCase(), lot: l }));
  const state = { loom: `A new rug on a shared loom, ${benchWords(S)}: ${list(S.weavers.map(w => w.name))}. Nothing is woven yet.` };
  // Given its lot, a rug asks nobody for one: every rug of a set is then woven from the same palette, and can be read against the others.
  if (S.given.lot && !DYE_LOTS.some(l => l.key === S.given.lot)) throw Error(`no dye lot called ${S.given.lot}`);
  S.lot = S.given.lot ? DYE_LOTS.find(l => l.key === S.given.lot) : (await council(S, 'lot', 'The guild is choosing the dye lot: every yarn in the whole rug will come from this one pot. Which lot does {N} want?', lots, state)).lot;
  S.pot = S.given.pot ? [...S.given.pot] : [UNDYED, 2, 3, 4, 5]; S.bare = { a: UNDYED, aBy: GUILD, strands: [] };
  const d = S.lot.dyes, kinds = shuffled(Object.keys(BANDS), rnd).slice(0, L.bandsOffered);
  const bands = kinds.map((kind, i) => {
    const c1 = 2 + Math.floor(rnd() * 4), c2 = pick([2, 3, 4, 5].filter(c => c !== c1), rnd);
    return { key: `b${i + 1}`, kind, dyes: [UNDYED, c1, c2], short: `a border of ${BANDS[kind].words}`, text: `${cap(BANDS[kind].words)} in ${d[c1].name} on undyed wool, touched with ${d[c2].name}.` };
  });
  S.band = await council(S, 'band', 'The guild is choosing the border: the band woven straight across at both ends of the rug, and the stripe up its two sides. Which does {N} want?', bands, { ...state, pot: `The dyes in the pot: ${S.pot.map(c => d[c].name).join(', ')}.` });
}

/** The guild steps back and looks at the whole: what code measured, and what could be done about it. */
async function stepBack(S) {
  const L = S.L, d = S.lot.dyes, total = S.used.reduce((s, x) => s + x, 0), N = w => S.weavers[w].name;
  const held = S.weavers.map((_, w) => { const k = groundOf(S, w); return k < 0 ? 0 : width(S, k); });
  const wide = held.indexOf(Math.max(...held)), thin = held.indexOf(Math.min(...held));
  const colours = S.pot.filter(c => c !== UNDYED), loud = colours.reduce((a, c) => (S.used[c] > S.used[a] ? c : a), colours[0]);
  // Whoever has given way most speaks first.
  const lost = S.tally.map(t => t.gave + t.overruled); S.caller = lost.indexOf(Math.max(...lost)) >= 0 && Math.max(...lost) > 0 ? lost.indexOf(Math.max(...lost)) : (S.caller + 1) % S.n;
  // The yarn on the loom that most minds have had a hand in, if any has had more than one: the nearest the rug has to a style of its own.
  const common = L.combine ? S.grounds.filter(g => !isBare(g)).map(g => ({ yarn: yarnOf(S, g), node: g.who >= 0 ? S.node[g.who] : g.node, minds: [...mindsOf(yarnOf(S, g))] }))
    .filter(c => c.minds.length > 1).sort((a, b) => b.minds.length - a.minds.length)[0] : null;
  const j = S.joins, options = [
    { key: 'on', short: 'to carry on as they were', text: `Carry on as you are. So far ${j.slit + j.standoff} edges stand as open slits, ${j.hatch} are woven in two colours, and ${j.figure} figures are planted.` },
    { key: 'truce', short: 'a truce band across the whole loom', text: 'Weave one band straight across the whole loom, everyone together in the border\'s pattern: a truce line, with every open slit closed.' },
    ...(common ? [{ key: 'unison', short: 'one passage all in one yarn', text: `Weave the next passage all in one yarn, each in their own place: ${yarnWords(S, common.yarn)}, which ${list(common.minds.map(N))} each had a hand in.` }] : []),
    ...(S.n > 1 ? [{ key: 'even', short: 'to put the bench even again', text: `Put the bench even again: over the next two passages every edge walks back until each weaver holds the same. ${N(wide)} holds ${held[wide]} warps now and ${N(thin)} holds ${held[thin]}.` }] : []),
    ...(S.pot.includes(KEPT_BACK) ? [] : [{ key: 'dye', short: `to bring out the ${d[KEPT_BACK].name}`, text: `Bring out the dye that was kept back, the ${d[KEPT_BACK].name}: nobody has had it yet, and from now on anyone may weave with it.` }]),
    ...(colours.length > 3 ? [{ key: 'retire', short: `to take the ${d[loud].name} out of the pot`, text: `Take the ${d[loud].name} out of the pot: it is ${Math.round(100 * S.used[loud] / total)}% of the cloth already, and nobody may start a new yarn with it.` }] : []),
  ];
  const state = { loom: `One rug on a shared loom, ${benchWords(S)}. ${S.pass} of ${L.passes} passages are woven, and the work has stopped to look at the whole.`,
    bench: `Left to right, in warps held: ${S.grounds.map((g, i) => `${holder(S, g)} ${width(S, i)}`).join(', ')}.`,
    pot: `The dyes in the pot, and how much of the cloth each is: ${S.pot.map(c => `${d[c].name} ${Math.round(100 * S.used[c] / total)}%`).join(', ')}.`, cloth: clothWords(S) };
  const first = S.decider || S.n < 2 ? '' : `${N(S.caller)}, who has given way most, speaks first. `;
  const k = (await council(S, 'step', `The work has stopped and everyone has stepped back from the loom to look at the whole rug. ${first}What does {N} want done?`, options, state)).key;
  if (k === 'truce') { S.truce = true; for (const e of S.edges) e.join = 'plain'; }
  else if (k === 'even') S.spell = { passes: 2 };
  else if (k === 'unison') S.unisonNext = common;
  else if (k === 'dye') S.pot.push(KEPT_BACK);
  else if (k === 'retire') S.pot = S.pot.filter(c => c !== loud);
}

/** Names for the rug, made by code out of what happened in it; the guild chooses one. */
async function nameIt(S) {
  const d = S.lot.dyes, j = S.joins, rnd = rng(S.seed, 'name'), N = w => S.weavers[w].name, names = new Set();
  const total = S.used.reduce((s, x) => s + x, 0), byUse = [2, 3, 4, 5, 6].filter(c => S.used[c] > 0).sort((a, b) => S.used[b] - S.used[a]);
  const shares = S.history.at(-1).shares, big = shares.indexOf(Math.max(...shares)), small = shares.reduce((a, s, w) => (s > 0 && s < shares[a] ? w : a), big);
  const slits = j.slit + j.standoff, fig = S.figures.find(f => f.who !== f.host), pairs = S.pair.flatMap((row, a) => row.map((q, b) => ({ a, b, n: q.kept }))).sort((x, y) => y.n - x.n)[0];
  if (byUse.length > 1 && slits > 1) names.add(`${d[byUse[0]].short} and ${d[byUse[1]].short}, Arguing`);
  if (slits > 1) names.add(`The ${cap(['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][slits] ?? 'Many')} Slits`);
  if (slits === 1) names.add('One Open Slit');
  if (shares[big] > 0.33) names.add(`${N(big)} Takes the Bench`);
  if (small !== big) names.add(`What ${N(small)} Kept`);
  if (S.n === 1) names.add(`${N(0)}, Alone at the Loom`);
  if (S.decider) names.add(`As ${S.decider.name} Would Have It`);
  if (fig) names.add(`${N(fig.who)}'s ${cap(fig.kind)} in ${N(fig.host)}'s Field`);
  if (pairs?.n > 1) names.add(`${N(pairs.a)} Would Not Ask ${N(pairs.b)}`);
  if (S.record.some(r => r.what === 'step' && r.chose === 'truce')) names.add(`Truce in ${d[S.band.dyes[1]].short}`);
  if (j.hatch > 1) names.add('Met Halfway');
  if (j.standoff > 1) names.add('Nobody Gave Way');
  if (S.cloth.bare / total > 0.04) names.add('Bare Warp Between');
  if (!S.pot.includes(KEPT_BACK)) names.add(`The ${d[KEPT_BACK].short} Kept Back`);
  if (S.L.combine && S.n > 1) {
    // What was made between them: a ground held together, a hand that reached further than its ground, a strand paid for.
    const ply = reachOf(S.cloth, S.L.guard, S.n), far = ply.reach.map((r, w) => r - ply.held[w]), most = far.indexOf(Math.max(...far)), held = S.ideas.findLast(i => i.how === 'shared');
    if (held && ply.shared > 0.03) names.add(`What ${N(held.who[0])} and ${N(held.who[1])} Held Together`);
    if (far[most] > 0.06) names.add(`${N(most)}'s Hand in Every Ground`);
    if (j.trade) names.add('Ground for a Strand');
    if (ply.plied > 0.4) names.add('Nobody\'s Pattern');
  }
  if (S.plan) { const kept = S.plan.kept / Math.max(1, S.plan.woven); names.add(S.plan.over != null ? 'The Plan, Let Go' : kept > 0.85 ? 'According to Plan' : kept < 0.6 ? 'So Much for the Plan' : `${S.plan.name}, More or Less`); if (S.plan.was) names.add('A Change of Plan'); }
  if (S.used[UNDYED] / total > 0.3) names.add('Rug for a Quiet Room'); else if (byUse.length) names.add(`Rug for a ${d[byUse[0]].short} Room`);
  names.add(`${S.L.passes} Passages, ${slits + j.hatch + j.knot} Quarrels`); names.add('The Long Edge');
  const options = shuffled([...names], rnd).slice(0, S.L.namesOffered).map((text, i) => ({ key: `n${i + 1}`, text, short: `the name "${text}"` }));
  const state = { loom: `The rug is finished and off the loom: ${S.L.passes} passages by ${S.n === 1 ? 'one weaver' : `${S.n} weavers`}.`, cloth: clothWords(S),
    bench: `How much of the last row each holds: ${S.weavers.map((w, i) => `${w.name} ${Math.round(100 * shares[i])}%`).join(', ')}.` };
  S.name = (await council(S, 'name', 'The rug is finished, and the guild is naming it. Each name was made from something that happened in it. Which name does {N} want?', options, state)).text;
}

/* -------------------------------------------------------------------------------------------------- the whole rug */

/**
 * Weave a rug. `weavers` is the bench, one weaver or many (`weavers.mjs`). `together: true` is one cloth decided
 * together: nobody has a ground, and the guild decides what goes in every place (`together`). `simple: true` is the plain game (`SIMPLE`):
 * a handful of choices anybody can picture. `combine: false` leaves them only arguing:
 * nobody takes from another's yarn but whole, and nothing is held together. `ask(body)` is one Jev call returning its
 * answers (`jev.mjs`); without it, or with `minds: 'chance'`, every decision is the stream's own. `minds: 'neutral'`
 * asks Jev as one tasteless mind in place of each weaver's. `decider` (a persona) makes the bench hands for one mind. `tape`
 * weaves again from a kept rug's answers. `onAsk({ id, who, body, asked })` is shown every question as it is put, asked
 * or replayed, for studying the minds (`tools/gender.mjs`). `onPass(entry, S)` is told of each stretch of rows as it is finished, and is
 * not waited for: weaving is as fast as the minds answer, and whoever is watching plays it back at their own speed.
 */
export async function weave(o = {}) {
  const S = setup(o), L = S.L, t0 = S.now();
  const stretch = async (kind, work) => {
    S.entry = { pass: S.pass, kind, y0: S.y, y1: S.y, events: [], said: [], links: [], shares: null };
    await work();
    S.entry.y1 = S.y;
    S.entry.shares = S.weavers.map((_, w) => S.grounds.reduce((sum, g, k) => sum + (g.who === w ? width(S, k) : 0), 0) / S.field);
    // What each weaves with now and which idea that is, and the bench from left to right: enough to draw how the ideas travelled.
    S.entry.yarns = S.yarn.map(y => (y ? copyYarn(y) : null)); S.entry.nodes = [...S.node];
    S.entry.bench = S.grounds.map((g, i) => ({ who: g.who, pair: g.pair ?? null, node: g.node ?? (g.who >= 0 ? S.node[g.who] : -1), wide: width(S, i) }));
    S.history.push(S.entry); S.onPass(S.entry, S);
  };
  await stretch('border', async () => { await begin(S); if (L.together && L.plan) await planning(S); bandRows(S, L.band); });
  // The bench: who sits beside whom is the seed's, and everyone starts with the same ground.
  const bench = shuffled(S.weavers.map((_, w) => w), rng(S.seed, 'bench'));
  S.grounds = bench.map(w => ({ who: w }));
  S.edges = Array.from({ length: S.n + 1 }, (_, i) => ({ x: Math.round(S.x0 + S.field * i / S.n), v: 0, join: 'plain', knot: 0 }));
  // Given starting yarns, each weaver begins with a design that can be told from the others' at a glance, and may change it like any other.
  if (S.given.starts) S.weavers.forEach((_, w) => { if (S.given.starts[w]) setYarn(S, w, sized(copyYarn(S.given.starts[w]), 2), 'new'); });
  for (S.pass = 0; S.pass < L.passes; S.pass++) {
    await stretch('passage', async () => {
      if (L.stepBacks.includes(S.pass)) await stepBack(S);
      if (S.truce) { S.truce = false; S.entry.kind = 'truce'; bandRows(S, L.rows); S.fresh = S.next; S.next = S.weavers.map(() => []); }
      else if (S.unisonNext) { S.entry.kind = 'unison'; unison(S); } else await (L.together ? together(S) : passage(S));
    });
  }
  await stretch('border', async () => { bandRows(S, L.band); await nameIt(S); });
  return finish(S, bench, Math.round(S.now() - t0));
}

/** The rug as it is kept: the cloth, everything decided in it, and the numbers. */
function finish(S, bench, ms) {
  const councils = S.record.filter(r => r.kind === 'council'), turns = S.record.filter(r => r.kind === 'turn'), n = S.n;
  const content = S.weavers.map((_, w) => councils.reduce((s, r) => s + r.content[w], 0) / Math.max(1, councils.length));
  const pairs = []; for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push([a, b]);
  // How far apart two minds are: the total variation between their weights, over every question both were asked alike.
  const asked = councils.filter(r => r.minds.length === n);
  const far = pairs.map(([a, b]) => asked.reduce((s, r) => s + apart(r.minds[a].p, r.minds[b].p), 0) / Math.max(1, asked.length));
  const rows = S.history.filter(h => h.kind !== 'border'), ply = reachOf(S.cloth, S.L.guard, n);
  return {
    seed: S.seed, way: S.way, minds: S.minds, decider: S.decider, deciderMood: S.deciderMood, model: S.model, loom: S.L, name: S.name, lot: S.lot, band: { kind: S.band.kind, dyes: S.band.dyes, text: S.band.text },
    weavers: S.weavers, bench, moods: S.moods, plan: S.plan, visions: S.vision, grid: S.grid, cloth: S.cloth, record: S.record, history: S.history, figures: S.figures, ideas: S.ideas, tape: S.tape, replayed: !!S.replay,
    stats: {
      ms, calls: S.calls, tokens: S.calls.tokens, dollars: S.calls.tokens * JEV.dollarsPerToken, joins: S.joins,
      // How far the designs combined: the cloth read by whose ideas are in it (`reachOf`), who took from whom, and how many different yarns were woven.
      ply: { ...ply, took: S.took, ideas: S.ideas.length, yarns: new Set(S.ideas.map(i => lookOf(i.yarn))).size },
      weavers: S.weavers.map((w, i) => {
        const mine = turns.filter(t => t.who === i), jevs = mine.filter(t => t.by === 'jev');
        return { key: w.key, name: w.name, ...S.tally[i], share: rows.reduce((s, h) => s + h.shares[i], 0) / Math.max(1, rows.length), last: S.history.at(-1).shares[i],
          content: content[i], topTaken: jevs.length ? jevs.filter(t => (t.move ?? t.yarn).chose === (t.move ?? t.yarn).top).length / jevs.length : null,
          sure: jevs.length ? jevs.reduce((s, t) => s + (t.move ?? t.yarn).sure, 0) / jevs.length : null,
          bold: mine.reduce((s, t) => s + t.bold, 0) / Math.max(1, mine.length), fine: mine.reduce((s, t) => s + t.fine, 0) / Math.max(1, mine.length),
          // How much of the cloth is in their ground, how much is of their devising, and how they came by each yarn they wove.
          cloth: ply.held[i], reach: ply.reach[i], ways: mine.reduce((m, t) => { const k = t.yarn ? t.yarn.options.find(o => o.key === t.yarn.chose).kind : 'on'; m[k] = (m[k] ?? 0) + 1; return m; }, {}),
          moves: mine.reduce((m, t) => { if (!t.move) return m; const k = t.move.chose.replace(/[LR]?(:.*)?$/, ''); m[k] = (m[k] ?? 0) + 1; return m; }, {}) };
      }),
      // The plan, where there was one: how much of the rug kept to it, and how well the finished rug would suit each rug that was wanted.
      plan: S.plan ? { key: S.plan.key, name: S.plan.name, by: S.plan.by, kept: S.plan.kept, woven: S.plan.woven, over: S.plan.over, was: S.plan.was, visions: S.vision, suits: Object.fromEntries(S.plans.map(k => [k, fitOf(S, k)])) } : null,
      guild: {
        decisions: councils.length, content,
        // Jain's index over how much of what each most wanted they got: 1 when all fared alike, 1/n when one had it all.
        fairness: content.reduce((s, c) => s + c, 0) ** 2 / (n * content.reduce((s, c) => s + c * c, 0) || 1),
        sameTop: n > 1 && asked.length ? asked.filter(r => new Set(r.minds.map(m => topOf(m.p))).size === 1).length / asked.length : null,
        apart: far.length && asked.length ? far.reduce((s, x) => s + x, 0) / far.length : null, pairs: pairs.map(([a, b], i) => ({ a, b, apart: far[i] })),
      },
    },
  };
}

/** The rug told in sentences, from its record: what the guild chose, and every argument in the order it happened. */
export function story(rug) {
  const out = [];
  for (const h of rug.history) {
    const at = h.pass < 0 ? 'Before the first row' : h.pass >= rug.loom.passes ? 'Off the loom' : `Passage ${h.pass + 1}`;
    for (const e of h.events) if (!['plain', 'free', 'fed', 'unfed', 'lost'].includes(e.kind)) out.push({ pass: h.pass, at, kind: e.kind, text: e.text });
  }
  return out;
}
