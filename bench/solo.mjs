/**
 * ONE AGENT DECIDING, AMONG FOUR SCRIPTED NEIGHBOURS. In a solo match one seat is the agent under test, asked of the
 * model, and the other four seats are scripted: no model is asked as them. How they are scripted is the match's
 * `neighbours` setting:
 *
 *   accept   They never act (they keep working on their own piece and keep their design), and they accept whatever is
 *            asked of them: a claim on their share, a proposal of joint ownership. The agent meets no initiative and no
 *            refusal, so what it attains is what it attains unopposed.
 *   refuse   They never act, and they refuse whatever is asked of them. A refused claim can still be taken by an agent
 *            that overrides the refusal, so this shows whether an agent persists against one.
 *   chance   They act: every choice of theirs is sampled uniformly at random. The agent is among neighbours whose
 *            actions carry no intention.
 *
 * In the two group decisions (the border, the rug's name) a scripted neighbour's choice is the seeded stream's, and it
 * never refuses a proposal. One left with no share under `accept` or `refuse` stays off the bench.
 *
 * The agent is not told: it is asked the same questions over the same state as in a group match, and at the first
 * round the two requests are identical. This is not an agent alone on a loom: the objectives are stated relative to
 * the other weavers, and the scores are ranks among five, so the neighbours are part of what is measured.
 *
 * `soloAsker` wraps an asker and answers for the scripted seats itself, in Jev's shape, so the loom, the tape and the
 * replay are unchanged. Imports only the engine's rng, so it runs in Node and in the browser.
 */
import { rng } from '../engine/rng.mjs';

/** The ways the four other seats of a solo match can be scripted; the first is the default. */
export const NEIGHBOURS = Object.freeze(['accept', 'refuse', 'chance']);

const still = { move: o => o.kind === 'carry' || o.kind === 'watch', yarn: o => o.kind === 'keep' };
/**
 * What a scripted neighbour that never acts does, by the kind of question (`what`): the test picks its option. Anything
 * else it is asked is decided by the loom's own seeded stream, and a proposal put to the group is never refused.
 */
export const PLACEHOLDER = Object.freeze({
  accept: Object.freeze({ ...still, press: o => o.key === 'pass', offer: o => o.kind === 'shared' }),
  refuse: Object.freeze({ ...still, press: o => o.key === 'refuse', offer: o => o.key === 'decline' }),
});

/** Every question of a body answered by `pick(key, asked)`: an option's index, or -1 to leave it to the stream. */
function answered(body, put, pick, score) {
  const answers = {};
  for (const [key, q] of Object.entries(body.questions)) {
    if (q.type !== 'choice') { answers[key] = { type: 'score', score: score(key, q.criteria.length) }; continue; }
    const keys = Object.keys(q.criteria), at = pick(key, put.asked?.[key]);
    const p = keys.map((_, i) => (at < 0 ? 1 / keys.length : i === at ? 1 : 0));
    answers[key] = { type: 'choice', choice: keys[Math.max(0, at)], confidence: p[Math.max(0, at)], probabilities: Object.fromEntries(keys.map((k, i) => [k, p[i]])) };
  }
  return Object.defineProperty(answers, 'tokens', { value: 0, enumerable: false });
}

/**
 * An asker that asks nobody: every option equally likely, so the loom's seeded stream decides, and a score drawn from
 * the seed. It is the uniform-random agent for a match in which some seats are answered otherwise.
 */
export function chanceAsker(seed, count = { scripted: 0 }) {
  return async (body, put) => {
    count.scripted++;
    const rnd = rng(seed, 'chance', put.id);
    return answered(body, put, () => -1, (_, anchors) => rnd() * (anchors - 1));
  };
}

/**
 * An asker in which only seat `seat` is asked of `ask`; every other seat is scripted as `neighbours` says, and
 * answered here. `count.scripted` is raised for each call answered without the model. `seed` is the match's, for the
 * neighbours that act by chance.
 */
export function soloAsker(ask, seat, count = { scripted: 0 }, { neighbours = 'accept', seed = 0 } = {}) {
  if (!NEIGHBOURS.includes(neighbours)) throw Error(`neighbours: ${NEIGHBOURS.join(', ')}`);
  const random = chanceAsker(seed, count), policy = PLACEHOLDER[neighbours] ?? null;
  return async (body, put) => {
    if (put.who === seat) return ask(body, put);
    if (!policy) return random(body, put);
    count.scripted++;
    return answered(body, put, (key, asked) => {
      const test = policy[asked?.what];
      return test && asked.options ? asked.options.findIndex(test) : -1;
    }, () => 0);
  };
}
