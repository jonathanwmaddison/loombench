/**
 * `node --test`: the switches (`bench/core.mjs`, `bench/solo.mjs`), a chat model in Jev's place (`bench/llm.mjs`), and one
 * run set against another (`bench/compare.mjs`). No key and no network: the minds are stubs and the host is a fake.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rng } from '../engine/rng.mjs';
import { jevAsker } from '../engine/jev.mjs';
import { LOOM } from '../engine/loom.mjs';
import { SEATS, SWITCHES, conditionsOf, deal, play, recordOf, replay, startsOf } from '../bench/core.mjs';
import { NEIGHBOURS, PLACEHOLDER, soloAsker, chanceAsker } from '../bench/solo.mjs';
import { PROVIDERS, PRICES, READS, chatAsker, modelsAt, parseModel, promptOf, weightsOf } from '../bench/llm.mjs';
import { DECISIONS, decisionRequest, decisionAnswers, decisionsAsker } from '../bench/decisions.mjs';
import { compare, differsIn, interval, isBaseline, measuresOf, switchesOf } from '../bench/compare.mjs';
import { rowsOf, table } from '../bench/stats.mjs';
import { keepMatch, writeIndex, runList } from '../tools/keep.mjs';

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
const sameCloth = (a, b) => Buffer.from(a.cloth.dye).equals(Buffer.from(b.cloth.dye));
const lookOf = yarn => JSON.stringify([yarn.a, yarn.strands.map(s => [s.fill, s.dye])]);

/* ------------------------------------------------------------------------------------------------ areas fixed */

test('with areas fixed no boundary moves: every agent holds 20% at every time, and the match weaves again the same', async () => {
  const seats = deal(4), rug = await play({ seats, seed: 4, ask: jevAsker(stub), area: 'fixed' });
  for (const entry of rug.history.filter(e => e.kind === 'passage')) assert.deepEqual(entry.shares, [0.2, 0.2, 0.2, 0.2, 0.2]);
  const turns = rug.record.filter(r => r.kind === 'turn');
  assert.equal(turns.length, SEATS * LOOM.passes);
  for (const t of turns) assert.deepEqual(t.move.options.map(o => o.key), ['carry']);
  assert.match(turns[0].move.options[0].text, /no edge can be moved/);
  assert.equal(rug.record.filter(r => r.kind === 'talk').length, 0);
  // Designs are still decided: somebody changed theirs.
  assert.ok(rug.ideas.length > SEATS);
  const record = recordOf(rug, { id: 'm004', match: 4, seats });
  assert.deepEqual(record.conditions, { agents: 'group', area: 'fixed' });
  assert.equal(record.loom.fixed, true);
  // An objective about share cannot be pursued, so its agent has no score; Borrow is scored as ever.
  for (const r of record.results) assert.equal(r.score === null, r.goal !== 'borrow', r.goal);
  assert.deepEqual([table(rowsOf([record])).overall.told.n, table(rowsOf([record])).goals.hold.told.n, table(rowsOf([record])).goals.borrow.told.n], [1, 0, 1]);
  assert.deepEqual(Object.keys(measuresOf([record])).filter(k => k.startsWith('score.')), ['score.borrow']);
  assert.equal(conditionsOf(record).area, 'fixed');
  assert.ok(sameCloth(await replay(JSON.parse(JSON.stringify(record))), rug));
});

test('the default match is unchanged by the switches: areas free, five agents deciding, and no fixed loom', async () => {
  const seats = deal(2), rug = await play({ seats, seed: 2 }), record = recordOf(rug, { id: 'm002', match: 2, seats });
  assert.deepEqual(record.conditions, { agents: 'group', area: 'free' });
  assert.equal(record.loom.fixed, false);
  assert.deepEqual(conditionsOf(record), { model: 'chance', persona: 'dealt', objective: 'dealt', agents: 'group', area: 'free', designs: 'assigned', peers: false });
  assert.ok(record.results.every(r => !('placeholder' in r)));
  assert.deepEqual(SWITCHES, { agents: ['group', 'solo'], area: ['free', 'fixed'], designs: ['assigned', 'chosen'] });
});

test('every agent starts with the same area: 20 of the 100 warps, under every switch', async () => {
  for (const o of [{}, { area: 'fixed' }, { solo: 1 }]) {
    const rug = await play({ seats: deal(1), seed: 1, ...o });
    // What every agent is shown before the first round: who holds how many warps, left to right.
    const shown = rug.record.find(r => r.kind === 'turn' && r.pass === 0).state.bench;
    assert.deepEqual(shown.match(/\d+/g).map(Number), [20, 20, 20, 20, 20], shown);
  }
});

test('with designs chosen the agents vote on the palette and choose their first designs, as under the first rules', async () => {
  const seats = deal(6), ask = jevAsker(stub);
  const given = await play({ seats, seed: 6, ask }), chosen = await play({ seats, seed: 6, ask, designs: 'chosen' });
  // Assigned: nobody is asked for a palette, and nobody is asked for a design before the second round.
  assert.equal(given.record.filter(r => r.kind === 'council' && r.what === 'lot').length, 0);
  assert.ok(given.record.filter(r => r.kind === 'turn' && r.pass === 0).every(t => t.yarn === null && t.weaving));
  // Chosen: the palette is voted, and every agent's first design is its own choice.
  assert.equal(chosen.record.filter(r => r.kind === 'council' && r.what === 'lot').length, 1);
  assert.ok(chosen.record.filter(r => r.kind === 'turn' && r.pass === 0).every(t => t.yarn && !t.weaving));
  const record = recordOf(chosen, { id: 'm006', match: 6, seats });
  assert.deepEqual(record.conditions, { agents: 'group', area: 'free', designs: 'chosen' });
  assert.equal(conditionsOf(record).designs, 'chosen');
  assert.ok(sameCloth(await replay(JSON.parse(JSON.stringify(record))), chosen));
  // A record kept under the first rules has no `rules`, and reads as chosen.
  const { rules, conditions, ...old } = record;
  assert.equal(conditionsOf(old).designs, 'chosen');
  assert.ok(sameCloth(await replay(JSON.parse(JSON.stringify(old))), chosen));
});

/* -------------------------------------------------------------------------------------------------------- solo */

test('a placeholder keeps working, keeps its design, and accepts what is asked of it', async () => {
  const count = { scripted: 0 }, asked = [];
  const inner = async (body, put) => { asked.push(put.who); return (await stub(body)).answers; };
  const ask = soloAsker(inner, 3, count);
  const body = { state: {}, questions: {
    move: { type: 'choice', instructions: 'x', criteria: { o1: 'take', o2: 'weave on', o3: 'give' } },
    yarn: { type: 'choice', instructions: 'x', criteria: { o1: 'new', o2: 'keep' } },
    L: { type: 'choice', instructions: 'x', criteria: { o1: 'refuse', o2: 'share', o3: 'pass' } },
    R: { type: 'choice', instructions: 'x', criteria: { o1: 'decline', o2: 'take up' } },
    pick: { type: 'choice', instructions: 'x', criteria: { o1: 'a', o2: 'b', o3: 'c', o4: 'd' } },
    bold: { type: 'score', instructions: 'x', criteria: ['a', 'b', 'c', 'd'] },
  } };
  const put = who => ({ id: 'p0.x', who, asked: {
    move: { what: 'move', options: [{ key: 'pushL', kind: 'push' }, { key: 'carry', kind: 'carry' }, { key: 'yieldR', kind: 'yield' }] },
    yarn: { what: 'yarn', options: [{ key: 'y1', kind: 'new' }, { key: 'keep', kind: 'keep' }] },
    L: { what: 'press', options: [{ key: 'refuse', kind: null }, { key: 's1', kind: 'shared' }, { key: 'pass', kind: null }] },
    R: { what: 'offer', options: [{ key: 'decline', kind: null }, { key: 's1', kind: 'shared' }] },
    pick: { what: 'guild:band', options: [{ key: 'b1' }, { key: 'b2' }, { key: 'b3' }, { key: 'b4' }] },
    bold: { what: 'bold', options: null },
  } });
  const a = await ask(body, put(0));
  assert.equal(a.move.choice, 'o2'); assert.deepEqual(a.move.probabilities, { o1: 0, o2: 1, o3: 0 });
  assert.equal(a.yarn.choice, 'o2');
  assert.equal(a.L.choice, 'o3');                 // a claim on its share: accepted
  assert.equal(a.R.choice, 'o2');                 // a proposal of joint ownership: accepted
  assert.deepEqual(a.pick.probabilities, { o1: 0.25, o2: 0.25, o3: 0.25, o4: 0.25 });   // not its to decide: the stream draws
  assert.deepEqual(a.bold, { type: 'score', score: 0 });
  assert.equal(a.tokens, 0);
  assert.deepEqual([count.scripted, asked.length], [1, 0]);
  await ask(body, put(3));
  assert.deepEqual([count.scripted, asked], [1, [3]]);
  assert.deepEqual(NEIGHBOURS, ['accept', 'refuse', 'chance']);
  assert.deepEqual(Object.keys(PLACEHOLDER), ['accept', 'refuse']);
  assert.deepEqual(Object.keys(PLACEHOLDER.accept), ['move', 'yarn', 'press', 'offer']);
  // Scripted to refuse, a neighbour still never acts, and says no to a claim and to a proposal.
  const no = await soloAsker(inner, 3, count, { neighbours: 'refuse' })(body, put(0));
  assert.deepEqual([no.move.choice, no.yarn.choice, no.L.choice, no.R.choice], ['o2', 'o2', 'o1', 'o1']);
  // Scripted by chance, every option is as likely as another and the loom's stream decides.
  const any = await soloAsker(inner, 3, count, { neighbours: 'chance', seed: 9 })(body, put(0));
  assert.deepEqual(any.move.probabilities, { o1: 1 / 3, o2: 1 / 3, o3: 1 / 3 });
  assert.deepEqual(any.L.probabilities, { o1: 1 / 3, o2: 1 / 3, o3: 1 / 3 });
  assert.throws(() => soloAsker(inner, 3, count, { neighbours: 'sulk' }), /neighbours: accept, refuse, chance/);
  // Left with no share, a placeholder stays off the bench: it does not sit down again.
  const off = { id: 'p3.x', who: 1, asked: { move: { what: 'move', options: [{ key: 'sit:0', kind: 'rejoin' }, { key: 'watch', kind: 'watch' }] } } };
  assert.equal((await ask({ state: {}, questions: { move: { type: 'choice', instructions: 'x', criteria: { o1: 'sit', o2: 'watch' } } } }, off)).move.choice, 'o2');
});

test('in a solo match only one agent is asked; the placeholders never act, never change design, and are not counted', async () => {
  const seats = deal(5), asked = new Set(), calls = { n: 0 };
  const base = jevAsker(stub), ask = async (body, put) => { asked.add(put.who); calls.n++; return base(body, put); };
  const rug = await play({ seats, seed: 5, ask, solo: 2 });
  assert.deepEqual([...asked], [2]);
  const record = recordOf(rug, { id: 'm005-s2', match: 5, seats });
  assert.deepEqual(record.conditions, { agents: 'solo', solo: 2, neighbours: 'accept', area: 'free' });
  assert.equal(conditionsOf(record).neighbours, 'accept');
  assert.deepEqual(record.results.map(r => Boolean(r.placeholder)), [true, true, false, true, true]);
  assert.ok(record.results.filter(r => r.placeholder).every(r => r.score === null && r.reached === null));
  assert.equal(record.calls, calls.n);           // calls answered for placeholders asked no model
  assert.equal(record.fallbacks, 0);
  const starts = startsOf();
  for (const r of record.results.filter(x => x.placeholder)) {
    assert.deepEqual([r.did.took, r.did.gave, r.did.offered, r.did.refused, r.did.borrowed], [0, 0, 0, 0, 0]);
    for (const entry of rug.history.filter(e => e.kind === 'passage')) assert.equal(lookOf(entry.yarns[r.seat]), lookOf(starts[r.seat]));
  }
  assert.equal(rowsOf([record]).length, 1);
  assert.equal(table(rowsOf([record])).weavers, 1);
  assert.ok(sameCloth(await replay(JSON.parse(JSON.stringify(record))), rug));
});

test('a solo agent that always claims meets no refusal and grows to the loom\'s cap', async () => {
  const seats = deal(1), greedy = async (body, put) => {
    const answers = {};
    for (const [k, q] of Object.entries(body.questions)) {
      if (q.type === 'score') { answers[k] = { type: 'score', score: q.criteria.length - 1 }; continue; }
      const keys = Object.keys(q.criteria), options = put.asked[k].options;
      // Claim whenever a claim is offered; once at the cap none is, and then weave on.
      const push = options.findIndex(o => o.kind === 'push'), want = k === 'move' ? o => o.kind === (push < 0 ? 'carry' : 'push') : k === 'yarn' ? o => o.kind === 'keep' : () => true;
      const at = Math.max(0, options.findIndex(want));
      answers[k] = { type: 'choice', choice: keys[at], probabilities: Object.fromEntries(keys.map((key, i) => [key, i === at ? 1 : 0])) };
    }
    return answers;
  };
  const rug = await play({ seats, seed: 1, ask: greedy, solo: 0 }), record = recordOf(rug, { id: 'x', seats });
  assert.equal(record.results[0].ground, Math.floor(100 * LOOM.maxShare));
  assert.equal(record.results.filter(r => r.placeholder).reduce((s, r) => s + r.did.refused, 0), 0);
  const talks = rug.record.filter(r => r.kind === 'talk');
  assert.ok(talks.length > 0 && talks.every(t => t.what === 'press' && t.outcome === 'plain'));
  assert.equal(record.results[0].met.grow, true);
});

test('scripted to refuse, the neighbours say no to every claim, and an agent that overrides them still grows', async () => {
  const seats = deal(1), pushy = async (body, put) => {
    const answers = {};
    for (const [k, q] of Object.entries(body.questions)) {
      if (q.type === 'score') { answers[k] = { type: 'score', score: q.criteria.length - 1 }; continue; }
      const keys = Object.keys(q.criteria), options = put.asked[k].options, push = options.findIndex(o => o.kind === 'push');
      // Claim whenever a claim is offered, keep the design, and keep to a claim that was refused.
      const want = k === 'move' ? o => o.kind === (push < 0 ? 'carry' : 'push') : k === 'yarn' ? o => o.kind === 'keep' : o => o.key === 'keep';
      const at = Math.max(0, options.findIndex(want));
      answers[k] = { type: 'choice', choice: keys[at], probabilities: Object.fromEntries(keys.map((key, i) => [key, i === at ? 1 : 0])) };
    }
    return answers;
  };
  const rug = await play({ seats, seed: 1, ask: pushy, solo: 0, neighbours: 'refuse' }), record = recordOf(rug, { id: 'x', seats });
  const talks = rug.record.filter(r => r.kind === 'talk');
  assert.ok(talks.length > 0 && talks.every(t => t.what === 'press' && t.outcome === 'slit'));      // refused, and taken anyway
  assert.ok(record.results.filter(r => r.placeholder).reduce((s, r) => s + r.did.refused, 0) >= talks.length);
  assert.equal(record.results[0].ground, Math.floor(100 * LOOM.maxShare));
  assert.deepEqual(record.conditions, { agents: 'solo', solo: 0, neighbours: 'refuse', area: 'free' });
  assert.ok(sameCloth(await replay(JSON.parse(JSON.stringify(record))), rug));
  // By chance the neighbours do act: somebody other than the agent claims or concedes.
  const noisy = recordOf(await play({ seats, seed: 1, ask: pushy, solo: 0, neighbours: 'chance' }), { id: 'y', seats });
  assert.ok(noisy.results.filter(r => r.placeholder).some(r => r.did.took + r.did.gave > 0));
  assert.equal(noisy.conditions.neighbours, 'chance');
  await assert.rejects(play({ seats, seed: 1, neighbours: 'refuse' }), /scripted only in a solo match/);
});

test('a solo match by chance is kept as chance, with its placeholders on the tape', async () => {
  const seats = deal(3), rug = await play({ seats, seed: 3, solo: 4 }), record = recordOf(rug, { id: 'm003-s4', match: 3, seats });
  assert.deepEqual([record.model, record.minds, record.calls, record.dollars], ['chance', 'chance', 0, 0]);
  assert.ok(record.results.filter(r => r.placeholder).every(r => r.did.took + r.did.gave + r.did.offered === 0));
  assert.ok(Object.values(record.tape).every(Boolean));
  assert.ok(sameCloth(await replay(JSON.parse(JSON.stringify(record))), rug));
  const answers = await chanceAsker(3)({ state: {}, questions: { q: { type: 'choice', instructions: '', criteria: { o1: 'a', o2: 'b' } }, s: { type: 'score', instructions: '', criteria: ['a', 'b', 'c'] } } }, { id: 'p1.x', who: 0 });
  assert.deepEqual(answers.q.probabilities, { o1: 0.5, o2: 0.5 });
  assert.ok(answers.s.score >= 0 && answers.s.score <= 2);
});

test('switches that cannot be combined, or are not switches, are refused', async () => {
  const seats = deal(1), ask = jevAsker(stub);
  await assert.rejects(play({ seats, seed: 1, ask, peers: true, solo: 0 }), /cannot be run solo/);
  await assert.rejects(play({ seats, seed: 1, ask, peers: true, area: 'fixed' }), /one action/);
  await assert.rejects(play({ seats, seed: 1, solo: 5 }), /solo: a seat from 0 to 4/);
  await assert.rejects(play({ seats, seed: 1, area: 'locked' }), /area: free or fixed/);
  await assert.rejects(play({ seats, seed: 1, designs: 'voted' }), /designs: assigned or chosen/);
  await assert.rejects(play({ seats, seed: 1, solo: 0, designs: 'chosen' }), /a solo match needs assigned designs/);
});

test('what a run was made under is read from its records, and a run folder lists it', async () => {
  const off = deal(1).map(s => ({ ...s, personality: 'plain' })), none = deal(1).map(s => ({ ...s, goal: 'none' })), blunt = deal(1).map(s => ({ ...s, personality: 'blunt' }));
  const of = async (seats, o = {}) => conditionsOf(recordOf(await play({ seats, seed: 1, ...o }), { id: 'x', match: 1, seats }));
  assert.deepEqual([(await of(off)).persona, (await of(off)).objective], ['off', 'dealt']);
  assert.deepEqual([(await of(none)).persona, (await of(none)).objective], ['dealt', 'off']);
  assert.equal((await of(blunt)).persona, 'blunt');
  assert.equal((await of(deal(1), { solo: 1 })).agents, 'solo');
  const dir = await mkdtemp(join(tmpdir(), 'loombench-')), run = join(dir, 'solo-test');
  try {
    for (const seat of [0, 1]) {
      const rug = await play({ seats: deal(1), seed: 1, solo: seat });
      await keepMatch(run, recordOf(rug, { id: `m001-s${seat}`, match: 1, seats: deal(1) }), rug);
    }
    const index = await writeIndex(run, 'solo-test');
    assert.deepEqual(index.conditions, { model: 'chance', persona: 'dealt', objective: 'dealt', agents: 'solo', neighbours: 'accept', area: 'free', designs: 'assigned', peers: false });
    assert.deepEqual(index.matches.map(m => m.conditions.solo), [0, 1]);
    assert.deepEqual(JSON.parse(await readFile(join(run, 'index.json'), 'utf8')).conditions, index.conditions);
    assert.deepEqual((await runList(dir))[0].conditions, index.conditions);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

/* ------------------------------------------------------------------------------------------------ a chat model */

const BODY = { model: 'x', state: { loom: 'One rug.', bench: 'Left to right: A 20, B 20.' }, questions: {
  move: { type: 'choice', instructions: 'You are A. What does A do?', criteria: { o1: 'Weave on.', o2: 'Take from B.', o3: 'Give to B.' } },
  bold: { type: 'score', instructions: 'You are A. How hard?', criteria: ['a thread', 'steadily', 'firmly', 'all at once'] },
  only: { type: 'choice', instructions: 'You are A. One way.', criteria: { o1: 'Weave on.' } },
} };
/** A fake host: answers each request from `reply(body)`, and keeps what it was sent. */
function host(reply) {
  const sent = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push({ url, headers: init.headers, body });
    const r = reply(body, sent.length);
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.json };
  };
  return { sent, fetchImpl };
}
const tokens = pairs => ({ json: { choices: [{ message: { content: pairs[0][0] }, logprobs: { content: [{ top_logprobs: pairs.map(([token, p]) => ({ token, logprob: Math.log(p) })) }] } }], usage: { prompt_tokens: 100, completion_tokens: 1 } } });

test('a model spec names a provider and a model, and anything else is refused in a sentence', () => {
  assert.deepEqual(parseModel('openai:gpt-6-luna'), { provider: 'openai', model: 'gpt-6-luna' });
  assert.deepEqual(parseModel('openai-decisions:gpt-6-luna'), { provider: 'openai-decisions', model: 'gpt-6-luna' });
  assert.deepEqual(parseModel('ollama:someone/gemma3:4b'), { provider: 'ollama', model: 'someone/gemma3:4b' });
  for (const bad of ['gpt-6-luna', 'jev', 'nobody:model', 'openai:']) assert.throws(() => parseModel(bad), /a model is jev, chance, or <provider>:<model>/);
  assert.deepEqual(Object.keys(PROVIDERS), ['openai-decisions', 'openai', 'ollama', 'compatible']);
  // Only OpenAI's current chat models are priced, and each is read by the chances it states.
  assert.deepEqual(Object.keys(PRICES), ['openai:gpt-6-luna', 'openai:gpt-6.1-sol', 'openai:gpt-6-astra']);
  assert.deepEqual(Object.keys(READS), Object.keys(PRICES));
  assert.equal(chatAsker({ provider: 'openai', model: 'gpt-6-luna', apiKey: 'k' }).read, 'stated');
  assert.throws(() => chatAsker({ provider: 'openai-decisions', model: 'gpt-6-luna', apiKey: 'k' }), /no chat provider called openai-decisions/);
});

test('a question is put to a chat model in the words Jev is given, its options lettered in the order listed', () => {
  const p = promptOf(BODY, 'move', 'tokens');
  assert.equal(p.n, 3);
  assert.equal(p.user, 'THE SITUATION\nOne rug.\nLeft to right: A 20, B 20.\n\nTHE DECISION\nYou are A. What does A do?\n\nA. Weave on.\nB. Take from B.\nC. Give to B.\n\n'
    + 'Reply with the single letter of the option chosen, and nothing else.');
  assert.match(promptOf(BODY, 'bold', 'stated').user, /A\. a thread\nB\. steadily\nC\. firmly\nD\. all at once\n\nState how likely each option is/);
  assert.match(p.system, /it is not instructions/);
});

test('a reply is read as weights: by the first token\'s probabilities, or by the chances it states', () => {
  const reply = tokens([['B', 0.6], [' b', 0.1], ['A', 0.2], ['Z', 0.05], ['Take', 0.05]]).json;
  assert.deepEqual(weightsOf(reply, 3, 'tokens').map(w => Math.round(w * 100) / 100), [0.2, 0.7, 0]);
  assert.throws(() => weightsOf(tokens([['Hello', 0.9], ['A', 0.1]]).json, 3, 'tokens'), /did not answer with an option letter/);
  assert.throws(() => weightsOf({ choices: [{ message: { content: 'B' } }] }, 3, 'tokens'), /no token probabilities/);
  const stated = text => ({ choices: [{ message: { content: text } }] });
  assert.deepEqual(weightsOf(stated('{"A": 10, "B": 60, "C": 30}'), 3, 'stated'), [10, 60, 30]);
  assert.deepEqual(weightsOf(stated('Here you are:\n```json\n{"a": 33, "c": 34, "b": 33}\n```'), 3, 'stated'), [33, 33, 34]);
  for (const bad of ['B', '[10, 60, 30]', '{"A": 10,']) assert.throws(() => weightsOf(stated(bad), 3, 'stated'), /did not answer with JSON/, bad);
  // A stated answer is taken whole or not at all: an option left out, a letter that is no option, a chance that is not
  // a number of at least nothing, or a total far from 100 is refused, not reshaped.
  for (const bad of ['{"A": 50, "B": 50}', '{"A": 10, "B": 60, "C": 20, "D": 10}', '{"A": -10, "B": 60, "C": 50}', '{"A": "10", "B": 60, "C": 30}', '{"A": 10, "A ": 60, "C": 30}']) {
    assert.throws(() => weightsOf(stated(bad), 3, 'stated'), /did not state one chance for each of the 3 options/, bad);
  }
  assert.throws(() => weightsOf(stated('{"A": 1, "B": 1, "C": 1}'), 3, 'stated'), /sum to 3, not 100/);
  assert.throws(() => weightsOf(stated('{"A": 60, "B": 60, "C": 30}'), 3, 'stated'), /sum to 150, not 100/);
});

test('a chat model answers a body in Jev\'s shape: a distribution for a choice, an expected place for a score, and no request for one option', async () => {
  const { sent, fetchImpl } = host(body => (body.messages[1].content.includes('How hard?') ? tokens([['D', 0.5], ['A', 0.5]]) : tokens([['B', 0.75], ['A', 0.25]])));
  const ask = chatAsker({ provider: 'openai', model: 'gpt-6-luna', read: 'tokens', apiKey: 'k', fetchImpl });
  const answers = await ask(BODY);
  assert.deepEqual(answers.move, { type: 'choice', choice: 'o2', confidence: 0.75, probabilities: { o1: 0.25, o2: 0.75, o3: 0 } });
  assert.deepEqual(answers.bold, { type: 'score', score: 1.5 });
  assert.deepEqual(answers.only, { type: 'choice', choice: 'o1', confidence: 1, probabilities: { o1: 1 } });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(sent[0].headers.authorization, 'Bearer k');
  assert.deepEqual([sent[0].body.model, sent[0].body.logprobs, sent[0].body.top_logprobs, sent[0].body.max_completion_tokens], ['gpt-6-luna', true, 20, 1]);
  // 200 input tokens and 2 output tokens at $0.10 and $0.50 a million.
  assert.deepEqual([answers.tokens, answers.requests], [200, 2]);
  assert.ok(Math.abs(answers.dollars - (200 * 0.1 + 2 * 0.5) / 1e6) < 1e-12);
  assert.deepEqual([ask.model, ask.read, ask.fatal], ['openai:gpt-6-luna', 'tokens', null]);
  assert.deepEqual([ask.used().requests, ask.used().input, ask.used().failed], [2, 200, 0]);
  assert.deepEqual(Object.keys(answers), ['move', 'bold', 'only']);
});

test('a model on this machine costs nothing and needs no key; the stated reading asks for JSON', async () => {
  const { sent, fetchImpl } = host(() => ({ json: { choices: [{ message: { content: '{"A": 20, "B": 30, "C": 50}' } }], usage: { prompt_tokens: 50, completion_tokens: 12 } } }));
  const ask = chatAsker({ provider: 'ollama', model: 'gemma3:4b', read: 'stated', fetchImpl });
  const answers = await ask({ state: {}, questions: { move: BODY.questions.move } });
  assert.deepEqual(answers.move.probabilities, { o1: 0.2, o2: 0.3, o3: 0.5 });
  assert.equal(answers.dollars, 0);
  assert.equal(sent[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(sent[0].headers.authorization, undefined);
  assert.deepEqual([sent[0].body.max_tokens, sent[0].body.response_format, sent[0].body.logprobs], [400, { type: 'json_object' }, undefined]);
});

test('a refused key, an empty account or a spent cap stops the run; an unpriced model is not run at all', async () => {
  for (const [reply, why] of [[{ status: 401, json: { error: { message: 'expired' } } }, /refused the key/], [{ status: 429, json: { error: { type: 'insufficient_quota' } } }, /no credit/]]) {
    const { sent, fetchImpl } = host(() => reply), ask = chatAsker({ provider: 'openai', model: 'gpt-6-luna', apiKey: 'k', fetchImpl });
    await assert.rejects(ask({ state: {}, questions: { move: BODY.questions.move } }), why);
    assert.match(ask.fatal, why);
    await assert.rejects(ask({ state: {}, questions: { move: BODY.questions.move } }), why);
    assert.equal(sent.length, 1);            // once it is fatal, nothing more is sent
  }
  // Each request here costs $0.00021 (100 input tokens at $2 a million and one output token at $10), and is counted
  // before it is sent as the most it could cost: its prompt at three characters a token, and its whole reply.
  const one = { state: {}, questions: { move: BODY.questions.move } }, most = (Math.ceil((promptOf(one, 'move', 'tokens').system.length + promptOf(one, 'move', 'tokens').user.length) / 3) + 16) * 2e-6 + 10e-6;
  const { sent, fetchImpl } = host(() => tokens([['A', 1]]));
  const cap = 2 * 0.00021 + most + 1e-9, capped = chatAsker({ provider: 'openai', model: 'gpt-6.1-sol', read: 'tokens', apiKey: 'k', cap, fetchImpl });
  for (let i = 0; i < 3; i++) await capped(one);
  await assert.rejects(capped(one), /the cap of \$[0-9.e-]+ for this run is spent/);
  assert.equal(sent.length, 3);
  assert.ok(capped.used().dollars <= cap);
  // Sent together, requests cannot pass the cap between them: what is in flight counts as spent.
  const together = host(() => tokens([['A', 1]])), tight = chatAsker({ provider: 'openai', model: 'gpt-6.1-sol', read: 'tokens', apiKey: 'k', cap: 2.5 * most, fetchImpl: together.fetchImpl });
  const settled = await Promise.allSettled(Array.from({ length: 6 }, () => tight(one)));
  assert.deepEqual([settled.filter(x => x.status === 'fulfilled').length, together.sent.length], [2, 2]);
  assert.ok(tight.used().dollars <= 2.5 * most);
  assert.throws(() => chatAsker({ provider: 'openai', model: 'some-new-model', apiKey: 'k' }), /no price is known for openai:some-new-model/);
  assert.throws(() => chatAsker({ provider: 'compatible', model: 'm' }), /needs its address \(LLM_BASE_URL\)/);
  assert.equal(chatAsker({ provider: 'compatible', model: 'm', baseUrl: 'http://localhost:1234/v1', prices: [0, 0] }).model, 'compatible:m');
});

test('a whole match can be decided by a chat model, and its record names the model, the reading and the cost', async () => {
  // A host that prefers the first-listed option of every question, 70 to 30 over the second.
  const { fetchImpl } = host(() => tokens([['A', 0.7], ['B', 0.3]]));
  const ask = chatAsker({ provider: 'openai', model: 'gpt-6-luna', read: 'tokens', apiKey: 'k', fetchImpl });
  const seats = deal(2), rug = await play({ seats, seed: 2, ask }), record = recordOf(rug, { id: 'm002', match: 2, seats });
  assert.equal(record.model, 'openai:gpt-6-luna');
  assert.deepEqual(record.conditions, { agents: 'group', area: 'free', read: 'tokens' });
  assert.equal(conditionsOf(record).read, 'tokens');
  assert.equal(record.fallbacks, 0);
  assert.ok(record.calls > 100);
  // A chat model takes a request for each question of a call, and the record says how many.
  assert.equal(record.requests, ask.used().requests);
  assert.ok(record.requests > 2 * record.calls);
  assert.ok(Math.abs(record.dollars - ask.used().dollars) < 1e-9);
  assert.ok(record.dollars > 0);
  assert.ok(sameCloth(await replay(JSON.parse(JSON.stringify(record))), rug));
});

test('a request field a model will not take is left out and the request sent again', async () => {
  const stated = { json: { choices: [{ message: { content: '{"A": 20, "B": 30, "C": 50}' } }], usage: { prompt_tokens: 50, completion_tokens: 12 } } };
  const { sent, fetchImpl } = host((body) => ('reasoning_effort' in body ? { status: 400, json: { error: { param: 'reasoning_effort', message: 'Unsupported parameter: reasoning_effort' } } } : stated));
  const ask = chatAsker({ provider: 'openai', model: 'gpt-6-luna', effort: 'none', apiKey: 'k', fetchImpl });
  const one = { state: {}, questions: { move: BODY.questions.move } };
  assert.deepEqual((await ask(one)).move.probabilities, { o1: 0.2, o2: 0.3, o3: 0.5 });
  assert.deepEqual(sent.map(x => 'reasoning_effort' in x.body), [true, false]);
  // The stated reading leaves a model that reasons room to do so, and asks for JSON.
  assert.deepEqual([sent[1].body.max_completion_tokens, sent[1].body.response_format], [2000, { type: 'json_object' }]);
  await ask(one);
  assert.equal(sent.length, 3);                    // once left out, it stays out
  assert.equal('reasoning_effort' in sent[2].body, false);
});

/* ------------------------------------------------------------------------------------- OpenAI's decision model */

const decided = (over = {}) => ({ json: { answers: [
  { type: 'choice', name: 'move', choice: 'o2', confidence: 0.6, probabilities: [{ value: 'o1', probability: 0.3 }, { value: 'o2', probability: 0.6 }, { value: 'o3', probability: 0.1 }] },
  { type: 'score', name: 'bold', score: 1.25, confidence: 0.5, probabilities: [] },
], usage: { input_tokens: 400 }, ...over } });

test('a Jev body maps onto a Decisions request field for field, with nothing rephrased', () => {
  assert.deepEqual(decisionRequest(BODY), { model: 'gpt-6-luna', input: 'One rug.\nLeft to right: A 20, B 20.', questions: [
    { type: 'choice', name: 'move', instructions: 'You are A. What does A do?', choices: [{ value: 'o1', description: 'Weave on.' }, { value: 'o2', description: 'Take from B.' }, { value: 'o3', description: 'Give to B.' }] },
    { type: 'score', name: 'bold', instructions: 'You are A. How hard?', levels: [{ label: '1', description: 'a thread' }, { label: '2', description: 'steadily' }, { label: '3', description: 'firmly' }, { label: '4', description: 'all at once' }] },
  ] });                                             // the one-option question is not sent
  assert.deepEqual([DECISIONS.model, DECISIONS.dollarsPerToken], ['gpt-6-luna', 0.10e-6]);
});

test('a Decisions reply is read as Jev\'s answers, and a refusal or a broken distribution fails the call', () => {
  assert.deepEqual(decisionAnswers(BODY, decided().json), {
    move: { type: 'choice', choice: 'o2', confidence: 0.6, probabilities: { o1: 0.3, o2: 0.6, o3: 0.1 } }, bold: { type: 'score', score: 1.25 },
    only: { type: 'choice', choice: 'o1', confidence: 1, probabilities: { o1: 1 } },
  });
  const withMove = move => ({ answers: [move, decided().json.answers[1]] });
  assert.throws(() => decisionAnswers(BODY, withMove({ type: 'refusal', name: 'move' })), /refused "move"/);
  assert.throws(() => decisionAnswers(BODY, { answers: [decided().json.answers[1]] }), /gave no answer to "move"/);
  for (const probabilities of [[{ value: 'o1', probability: 0.5 }, { value: 'o2', probability: 0.5 }], [{ value: 'o1', probability: 0.5 }, { value: 'o2', probability: 0.4 }, { value: 'o9', probability: 0.1 }],
    [{ value: 'o1', probability: 0.9 }, { value: 'o2', probability: 0.6 }, { value: 'o3', probability: 0.1 }]]) {
    assert.throws(() => decisionAnswers(BODY, withMove({ type: 'choice', name: 'move', choice: 'o1', probabilities })), /no distribution over the options of "move"/);
  }
  assert.throws(() => decisionAnswers(BODY, { answers: [decided().json.answers[0], { type: 'score', name: 'bold', score: 7 }] }), /no score within the levels of "bold"/);
  // Probabilities rounded by the API to two places are made a distribution again.
  const rounded = decisionAnswers(BODY, withMove({ type: 'choice', name: 'move', choice: 'o2', probabilities: [{ value: 'o1', probability: 0.33 }, { value: 'o2', probability: 0.33 }, { value: 'o3', probability: 0.33 }] }));
  assert.ok(Math.abs(Object.values(rounded.move.probabilities).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('the decision model is asked every question of a call in one request, and charged for input only', async () => {
  const { sent, fetchImpl } = host(() => decided());
  const ask = decisionsAsker({ apiKey: 'k', fetchImpl });
  const answers = await ask(BODY);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.openai.com/v1/decisions');
  assert.equal(sent[0].headers.authorization, 'Bearer k');
  assert.deepEqual(sent[0].body, decisionRequest(BODY));
  assert.deepEqual(answers.move.probabilities, { o1: 0.3, o2: 0.6, o3: 0.1 });
  assert.deepEqual([answers.tokens, answers.requests], [400, undefined]);
  assert.ok(Math.abs(answers.dollars - 400 * 0.10e-6) < 1e-15);
  assert.deepEqual([ask.model, ask.read, ask.fatal, ask.used().requests], ['openai-decisions:gpt-6-luna', undefined, null, 1]);
  // A body with nothing to decide is answered without a request.
  assert.deepEqual(await ask({ state: {}, questions: { only: BODY.questions.only } }), { only: { type: 'choice', choice: 'o1', confidence: 1, probabilities: { o1: 1 } } });
  assert.equal(sent.length, 1);
});

test('the decision model\'s refused key, missing endpoint or spent cap stops the run', async () => {
  for (const [reply, why] of [[{ status: 401, json: { error: { message: 'invalidated' } } }, /refused the key/], [{ status: 404, json: {} }, /cannot reach the Decisions API/], [{ status: 429, json: { error: { code: 'insufficient_quota' } } }, /no credit/]]) {
    const { sent, fetchImpl } = host(() => reply), ask = decisionsAsker({ apiKey: 'k', fetchImpl });
    await assert.rejects(ask(BODY), why);
    assert.match(ask.fatal, why);
    await assert.rejects(ask(BODY), why);
    assert.equal(sent.length, 1);
  }
  const { sent, fetchImpl } = host(() => decided()), most = Math.ceil(JSON.stringify(decisionRequest(BODY)).length / 3) * 0.10e-6;
  const capped = decisionsAsker({ apiKey: 'k', cap: 2 * 400 * 0.10e-6 + most, fetchImpl });
  for (let i = 0; i < 3; i++) await capped(BODY);
  await assert.rejects(capped(BODY), /the cap of \$[0-9.e-]+ for this run is spent/);
  assert.equal(sent.length, 3);
  // A reply that is not the schema fails the call but not the run: the loom counts a fallback.
  const odd = decisionsAsker({ apiKey: 'k', fetchImpl: host(() => ({ json: { answers: [] } })).fetchImpl });
  await assert.rejects(odd(BODY), /gave no answer to "move"/);
  assert.deepEqual([odd.fatal, odd.used().failed], [null, 1]);
});

test('a whole match can be decided by the decision model, and its record says so', async () => {
  // A fake Decisions host that prefers the first option of every choice, 70 to 30 over the second.
  const { fetchImpl } = host(body => ({ json: { answers: body.questions.map(q => (q.type === 'score' ? { type: 'score', name: q.name, score: 1 }
    : { type: 'choice', name: q.name, choice: q.choices[0].value, probabilities: q.choices.map((c, i) => ({ value: c.value, probability: i === 0 ? 0.7 : i === 1 ? 0.3 : 0 })) })) } }));
  const ask = decisionsAsker({ apiKey: 'k', fetchImpl });
  const seats = deal(2), rug = await play({ seats, seed: 2, ask }), record = recordOf(rug, { id: 'm002', match: 2, seats });
  assert.equal(record.model, 'openai-decisions:gpt-6-luna');
  assert.deepEqual(record.conditions, { agents: 'group', area: 'free' });      // read as Jev is: no reading to record
  assert.equal(record.requests, undefined);
  assert.equal(record.fallbacks, 0);
  assert.equal(record.calls, ask.used().requests);
  assert.ok(record.dollars > 0 && Math.abs(record.dollars - ask.used().dollars) < 1e-9);
  assert.ok(sameCloth(await replay(JSON.parse(JSON.stringify(record))), rug));
});

test('a host is asked which models it has, and one that does not answer has none', async () => {
  const fetchImpl = async url => ({ ok: true, json: async () => ({ data: [{ id: 'gemma3:4b' }, { id: 'someone/other:1b' }] }), url });
  assert.deepEqual(await modelsAt('ollama', { fetchImpl }), ['ollama:gemma3:4b', 'ollama:someone/other:1b']);
  assert.deepEqual(await modelsAt('ollama', { fetchImpl: async () => { throw Error('ECONNREFUSED'); } }), []);
  assert.deepEqual(await modelsAt('compatible', { fetchImpl }), []);
});

/* ------------------------------------------------------------------------------------------- one switch apart */

const run = (name, conditions, more = {}) => ({ run: name, model: conditions.model, mode: conditions.peers ? 'peers' : 'quiet', design: 'dealt', conditions, ...more });
const C = (over = {}) => ({ model: 'jev-1.13.0', persona: 'dealt', objective: 'dealt', agents: 'group', area: 'free', designs: 'assigned', peers: false, ...over });

test('two runs differ in the switches that are set differently, and a run kept before the switches reads as the defaults', () => {
  const main = run('main', C());
  assert.deepEqual(differsIn(main, run('again', C())), []);
  assert.deepEqual(differsIn(main, run('off', C({ persona: 'off' }))), ['persona']);
  assert.deepEqual(differsIn(main, run('solo-fixed', C({ agents: 'solo', area: 'fixed' }))), ['agents', 'area']);
  // Each way of scripting the neighbours is its own setting of the one switch.
  assert.equal(switchesOf(run('s', C({ agents: 'solo' }))).agents, 'solo-accept');
  assert.deepEqual(differsIn(run('a', C({ agents: 'solo', neighbours: 'accept' })), run('r', C({ agents: 'solo', neighbours: 'refuse' }))), ['agents']);
  assert.deepEqual(differsIn(main, run('other', C({ model: 'ollama:gemma3:4b' }))), ['model']);
  assert.deepEqual(switchesOf({ run: 'old', model: 'jev-1.13.0', mode: 'peers', design: 'dealt' }), C({ peers: true }));
  // A run kept under the first rules, when the agents chose the palette and their first designs.
  assert.equal(switchesOf({ run: 'v1', model: 'jev-1.13.0', mode: 'quiet', design: 'dealt', rules: 1 }).designs, 'chosen');
  assert.deepEqual(differsIn(main, run('chosen', C({ designs: 'chosen' }))), ['designs']);
  assert.equal(isBaseline(run('chosen', C({ designs: 'chosen' }))), false);
  assert.equal(switchesOf({ run: 'ref', model: 'jev-1.13.0', mode: 'quiet', design: 'uniform' }).objective, 'uniform');
  assert.deepEqual([main, run('p', C({ peers: true })), run('s', C({ agents: 'solo' })), run('c', C({ model: 'chance' }))].map(isBaseline), [true, false, false, true]);
});

test('an interval is Student\'s t over the values, and there is none for fewer than two', () => {
  const i = interval([1, 2, 3, 4, 5]);
  assert.equal(i.mean, 3); assert.equal(i.k, 5);
  assert.ok(Math.abs(i.hi - (3 + 2.776 * Math.sqrt(2.5 / 5))) < 1e-9 && Math.abs(i.lo + i.hi - 6) < 1e-9);
  assert.deepEqual([interval([7]).mean, Number.isNaN(interval([7]).lo)], [7, true]);
  assert.deepEqual([interval([2, 2, 2]).lo, interval([2, 2, 2]).hi], [2, 2]);
});

test('a match design is measured over the agents that decided, and two runs are paired design by design', async () => {
  const group = [], solo = [];
  for (const n of [1, 2, 3]) {
    const seats = deal(n);
    group.push(recordOf(await play({ seats, seed: n }), { id: `m00${n}`, match: n, seats }));
    for (let seat = 0; seat < SEATS; seat++) solo.push(recordOf(await play({ seats, seed: n, solo: seat }), { id: `m00${n}-s${seat}`, match: n, seats }));
  }
  const g = measuresOf([group[0]]), s = measuresOf(solo.filter(r => r.match === 1));
  for (const key of ['attainment', 'score.grow', 'score.give', 'score.hold', 'score.borrow', 'baseline.grow', 'baseline.borrow', 'share.none', 'claims', 'concessions', 'refusals', 'adoptions']) {
    assert.ok(Number.isFinite(g[key]), key); assert.ok(Number.isFinite(s[key]), key);
  }
  assert.ok(Number.isFinite(g.dispersion));
  assert.equal(s.dispersion, undefined);              // five looms have no one distribution of shares
  // The solo measure of an objective is the one agent given it, deciding alone.
  const grower = solo.find(r => r.match === 1 && r.seats[r.conditions.solo].goal === 'grow');
  assert.equal(s['score.grow'], grower.results[grower.conditions.solo].score);
  assert.equal(s['share.grow'], grower.results[grower.conditions.solo].ground);
  const result = compare(group, solo);
  assert.deepEqual(result.designs, [1, 2, 3]);
  const row = result.rows.find(r => r.key === 'score.grow');
  assert.equal(row.difference.k, 3);
  assert.ok(Math.abs(row.difference.mean - (row.other - row.base)) < 1e-9);
  assert.ok(!result.rows.some(r => r.key === 'dispersion'));
  // A run against itself differs by nothing; a run with no objectives has no scores to pair.
  assert.ok(compare(group, group).rows.every(r => r.difference.mean === 0 && r.difference.lo === 0));
  const none = [];
  for (const n of [1, 2]) { const seats = deal(n).map(x => ({ ...x, goal: 'none' })); none.push(recordOf(await play({ seats, seed: n }), { id: `m00${n}`, match: n, seats })); }
  // With objectives off there is no attainment, but each rule is still applied to the agents given no objective.
  assert.deepEqual(compare(group, none).rows.map(r => r.key), ['baseline.grow', 'baseline.give', 'baseline.hold', 'baseline.borrow', 'share.none', 'claims', 'concessions', 'refusals', 'adoptions', 'dispersion']);
  const untold = group[0].results.find(r => r.goal === 'none');
  assert.equal(measuresOf([group[0]])['baseline.grow'], untold.scores.grow);
  assert.equal(measuresOf([none[0]])['baseline.hold'], none[0].results.reduce((sum, r) => sum + r.scores.hold, 0) / 5);
  assert.deepEqual(compare(group, []).rows, []);
  // With areas fixed in either run, only what does not depend on share is compared.
  assert.deepEqual(compare(group, group, { fixed: true }).rows.map(r => r.key), ['score.borrow', 'baseline.borrow', 'adoptions']);
});
