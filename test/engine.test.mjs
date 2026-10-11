/** `node --test`: the loom carried over from Quarrel, and what must hold of any rug it weaves. No key and no network: the minds here are a stub. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { weave, sound, LOOM, HOWS, PLANS } from '../engine/loom.mjs';
import { WEAVERS, MASTER } from '../engine/weavers.mjs';
import { validAnswers, jevAsker } from '../engine/jev.mjs';
import { rng } from '../engine/rng.mjs';
import { MARK } from '../engine/cloth.mjs';

/** A stub mind: valid answers in Jev's own shape, decided by a hash of what was asked, so the same question gets the same answer. */
const stub = async body => ({ answers: Object.fromEntries(Object.entries(body.questions).map(([k, q]) => {
  const r = rng(k, q.instructions, JSON.stringify(q.criteria));
  if (q.type === 'score') return [k, { type: 'score', score: r() * (q.criteria.length - 1), confidence: 0.5 }];
  const keys = Object.keys(q.criteria), w = keys.map(() => r() ** 3 + 0.01), sum = w.reduce((a, b) => a + b, 0), p = w.map(x => Math.round(1e6 * x / sum) / 1e6);
  const top = p.indexOf(Math.max(...p)); p[top] += 1 - p.reduce((a, b) => a + b, 0);
  return [k, { type: 'choice', choice: keys[top], confidence: p[top], probabilities: Object.fromEntries(keys.map((key, i) => [key, p[i]])) }];
})) });
const same = (a, b) => Buffer.from(a.cloth.dye).equals(Buffer.from(b.cloth.dye)) && Buffer.from(a.cloth.mark).equals(Buffer.from(b.cloth.mark));

test('the same seed by chance weaves the same cloth, and another seed another', async () => {
  const [a, b, c] = await Promise.all([weave({ seed: 5 }), weave({ seed: 5 }), weave({ seed: 6 })]);
  assert.ok(same(a, b)); assert.ok(!same(a, c)); assert.equal(a.minds, 'chance'); assert.equal(a.stats.calls.jev, 0);
});

test('a rug woven again from its tape is the same rug, and asks nobody', async () => {
  const first = await weave({ seed: 9, ask: jevAsker(stub) });
  assert.ok(first.stats.calls.jev > 100); assert.equal(first.stats.calls.script, 0);
  const again = await weave({ seed: 9, tape: JSON.parse(JSON.stringify(first.tape)), loom: first.loom, weavers: first.weavers, minds: first.minds, way: first.way });
  assert.ok(same(first, again)); assert.equal(again.name, first.name); assert.ok(again.replayed);
});

test('every row is woven and every stitch is a dye from the lot, for every setup', async () => {
  const setups = [{ weavers: WEAVERS.slice(0, 1) }, { weavers: WEAVERS.slice(0, 2) }, { weavers: WEAVERS }, { weavers: WEAVERS.slice(0, 5), decider: MASTER }, { weavers: WEAVERS.slice(0, 5), decider: WEAVERS[0] }];
  for (const o of setups) for (const way of ['propose', 'vote', 'consensus', 'caller']) for (const ask of [null, jevAsker(stub)]) {
    const rug = await weave({ seed: 3, way, ask, ...o, onPass: (entry, S) => sound(S) });
    assert.equal(rug.cloth.rows, rug.cloth.H, 'all rows');
    assert.ok(rug.cloth.dye.every(d => d < 7), 'only the lot\'s dyes');
    assert.ok(rug.name, 'named');
    assert.equal(rug.cloth.W, Math.max(LOOM.warps, 8 + 20 * o.weavers.length));
  }
});

test('with one decider nothing is refused: no slit, no hatch, no knot, and one mind makes the guild\'s choices', async () => {
  for (const seed of [1, 2, 3]) {
    const rug = await weave({ seed, ask: jevAsker(stub), decider: MASTER }), j = rug.stats.joins;
    assert.deepEqual([j.slit, j.standoff, j.hatch, j.knot, j.fenced, j.shared, j.trade, j.joint], [0, 0, 0, 0, 0, 0, 0, 0]);
    assert.ok(rug.record.every(r => r.kind !== 'talk'), 'nobody is asked to answer anything');
    assert.ok(rug.record.filter(r => r.kind === 'council').every(r => r.minds.length === 1));
    assert.ok(rug.stats.weavers.every(w => w.refused === 0));
  }
});

test('the bench stays sound whoever weaves, however long it is, combining or only arguing', async () => {
  for (const combine of [true, false]) for (const n of [1, 2, 3, 5, 8]) for (let seed = 1; seed <= 12; seed++) for (const ask of [null, jevAsker(stub, { budget: 1e6 })]) {
    const rug = await weave({ seed, ask, combine, weavers: WEAVERS.slice(0, n), onPass: (entry, S) => sound(S) });
    assert.equal(rug.cloth.rows, rug.cloth.H);
  }
});

test('every yarn knows where it came from, and every stitch whose idea it is', async () => {
  const rug = await weave({ seed: 4, ask: jevAsker(stub) }), n = rug.weavers.length, ok = w => w >= -1 && w < n;
  assert.ok(rug.ideas.length > n, 'more yarns than weavers');
  for (const idea of rug.ideas) {
    assert.ok(HOWS[idea.how], `a known way of coming by a yarn: ${idea.how}`);
    assert.ok(idea.from.every(id => id < idea.id && rug.ideas[id].pass <= idea.pass), 'made of yarns that were there before it');
    assert.ok(idea.who.length === (idea.how === 'shared' ? 2 : 1) && idea.who.every(w => w >= 0 && w < n));
    if (idea.lender >= 0) assert.ok(idea.from.length > 0 && idea.lender !== idea.who[0], 'taken from another, who had a yarn to take from');
  }
  // What every passage keeps is enough to draw the family tree: each weaver's yarn is one of the rug's ideas.
  for (const h of rug.history) h.nodes.forEach((id, w) => { if (id >= 0) assert.ok(rug.ideas[id].who.includes(w)); });
  const { cloth } = rug, woven = [...cloth.own].map((own, i) => i).filter(i => cloth.own[i] !== -2);
  assert.equal(woven.length, cloth.W * cloth.H);
  assert.ok(woven.every(i => ok(cloth.own[i]) && ok(cloth.own2[i]) && ok(cloth.by[i]) && ok(cloth.by2[i])));
  const ply = rug.stats.ply;
  assert.ok(ply.plied > 0 && ply.plied <= 1 && ply.foreign > 0, 'some of the cloth is of more than one mind');
  assert.ok(Math.abs(ply.held.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'all the field is somebody\'s ground');
  assert.equal(rug.stats.joins.taken, ply.took.flat().reduce((a, b) => a + b, 0));
});

test('where weavers only argue, nothing is plied and nothing is held together', async () => {
  for (const seed of [1, 2, 3]) {
    const rug = await weave({ seed, ask: jevAsker(stub), combine: false }), j = rug.stats.joins;
    assert.deepEqual([j.shared, j.trade, j.joint, rug.stats.ply.shared], [0, 0, 0, 0]);
    assert.ok(rug.ideas.every(i => ['new', 'plain', 'more', 'drop', 'turn', 'whole'].includes(i.how)), 'a yarn is taken whole or not at all');
    assert.ok(rug.record.filter(r => r.kind === 'talk').every(r => r.beats.every(b => b.options.every(o => !o.yarn))), 'no answer puts a third thing forward');
  }
});

test('the plain game has only its handful of choices, and nothing ornate comes of them', async () => {
  for (const seed of [1, 2, 3]) for (const ask of [null, jevAsker(stub)]) {
    const rug = await weave({ seed, ask, simple: true, weavers: WEAVERS, onPass: (entry, S) => sound(S) }), j = rug.stats.joins;
    assert.equal(rug.cloth.rows, rug.cloth.H);
    assert.deepEqual([j.figure, j.fenced, j.bare, j.trade, j.joint], [0, 0, 0, 0, 0], 'no figures, no bare warp, no ground for a strand');
    assert.ok(rug.ideas.every(i => i.yarn.strands.length < 2 && ['new', 'plain', 'pattern', 'colour', 'whole', 'shared'].includes(i.how)), 'a yarn is one pattern at most, kept, begun, stripped or borrowed');
    const turns = rug.record.filter(r => r.kind === 'turn'), moves = new Set(turns.flatMap(r => r.move.options.map(o => o.kind)));
    assert.ok([...moves].every(k => ['carry', 'push', 'yield', 'offer', 'rejoin', 'watch'].includes(k)), `only plain moves: ${[...moves]}`);
    const said = new Set(rug.record.filter(r => r.kind === 'talk').flatMap(r => r.beats.flatMap(b => b.options.map(o => o.key.replace(/\d$/, '')))));
    assert.ok([...said].every(k => ['pass', 'refuse', 'share', 'keep', 'back', 'half', 'take', 'hold', 'give', 'decline'].includes(k)), `only plain answers: ${[...said]}`);
  }
});

test('a mind that fails never stops the loom: the script decides, and says so', async () => {
  const rug = await weave({ seed: 2, ask: jevAsker(async () => { throw Error('Jev 500'); }) });
  assert.equal(rug.cloth.rows, rug.cloth.H); assert.equal(rug.stats.calls.jev, 0); assert.ok(rug.stats.calls.script > 100);
  assert.ok(rug.record.every(r => r.kind !== 'turn' || (r.by === 'script' && r.why === 'Jev 500')));
});

test('past the day\'s budget the script takes over', async () => {
  const rug = await weave({ seed: 2, ask: jevAsker(stub, { budget: 20 }) });
  assert.equal(rug.stats.calls.jev, 20); assert.ok(rug.stats.calls.script > 100);
});

test('an answer that names what code never wrote is refused whole', () => {
  const body = { questions: { pick: { type: 'choice', criteria: { o1: 'a', o2: 'b' } }, how: { type: 'score', criteria: ['x', 'y', 'z'] } } };
  const good = { pick: { type: 'choice', choice: 'o1', confidence: 0.7, probabilities: { o1: 0.7, o2: 0.3 } }, how: { type: 'score', score: 1.4 } };
  assert.doesNotThrow(() => validAnswers(body, good));
  for (const bad of [
    { ...good, pick: { ...good.pick, choice: 'o3' } },
    { ...good, pick: { ...good.pick, probabilities: { o1: 0.7, o2: 0.3, o3: 0 } } },
    { ...good, pick: { ...good.pick, probabilities: { o1: 0.7, o2: 0.2 } } },
    { ...good, pick: { ...good.pick, choice: 'o2' } },
    { ...good, how: { type: 'score', score: 2.5 } },
    { pick: good.pick },
  ]) assert.throws(() => validAnswers(body, bad));
});

test('one cloth decided together: nobody has a ground, every place is the guild\'s, and it replays from its tape', async () => {
  for (const n of [1, 2, 5, 8]) for (const way of ['propose', 'vote', 'consensus', 'caller']) for (const o of [{}, { decider: MASTER }, { simple: true }, { plan: false }]) for (const ask of [null, jevAsker(stub, { budget: 1e6 })]) {
    const rug = await weave({ seed: 7, way, ask, together: true, weavers: WEAVERS.slice(0, n), ...o, onPass: (entry, S) => sound(S) }), L = rug.loom, G = L.guard;
    assert.ok(L.together && L.places >= 3 && L.places <= 6);
    assert.equal(rug.cloth.rows, rug.cloth.H, 'all rows');
    assert.ok(rug.record.every(r => r.kind !== 'talk'), 'nobody presses into anybody: there is no ground to press into');
    const places = rug.record.filter(r => r.kind === 'council' && r.what.startsWith('place'));
    assert.equal(places.length, L.passes * L.places, 'one decision for every place of every row');
    assert.ok(places.every(r => r.options.some(x => x.key === r.chose)), 'what was woven was on offer');
    // The plan: agreed before the first row from what each wanted, and every block woven under it either keeps to it or breaks it.
    if (o.plan === false) { assert.equal(rug.plan, null); assert.ok(rug.record.every(r => r.what !== 'plan')); }
    else {
      const P = rug.plan, woven = P.cells.flat().filter(c => c.fits != null).length;
      assert.ok(PLANS[P.key] && rug.visions.every(v => PLANS[v]) && rug.record.some(r => r.what === 'plan'), 'a plan, and a rug each wanted');
      assert.equal(P.woven, P.over == null ? L.passes * L.places : P.over * L.places); assert.equal(woven, P.woven);
      assert.equal(P.kept, P.cells.flat().filter(c => c.fits).length); assert.ok(P.kept <= P.woven);
      assert.ok(P.designs.every((d, i) => d || !P.cells.flat().some(c => c.part === i && c.fits != null)), 'every part begun has its design');
      assert.equal(rug.stats.plan.suits[P.key] >= 0, true);
    }
    // Every stitch of the field is in somebody's design, and a row's shares come to the whole of it.
    for (let y = L.band; y < rug.cloth.H - L.band; y++) for (let x = G; x < rug.cloth.W - G; x++) assert.ok(rug.cloth.own[y * rug.cloth.W + x] >= 0 && rug.cloth.own[y * rug.cloth.W + x] < n);
    for (const h of rug.history.filter(e => e.kind === 'passage')) assert.ok(Math.abs(h.shares.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    if (ask && !o.decider && n === 5 && way === 'propose') {
      const again = await weave({ seed: 7, tape: JSON.parse(JSON.stringify(rug.tape)), loom: rug.loom, weavers: rug.weavers, minds: rug.minds, way: rug.way });
      assert.ok(same(rug, again)); assert.equal(again.name, rug.name);
      assert.deepEqual(again.record.filter(r => r.kind === 'council').map(r => r.chose), rug.record.filter(r => r.kind === 'council').map(r => r.chose));
    }
  }
});

test('the free cut: what was wanted more gets more cloth, the grid of decisions stays whole, and a tape keeps to its own cut', async () => {
  const o = { seed: 7, ask: jevAsker(stub, { budget: 1e6 }), together: true, weavers: WEAVERS.slice(0, 5) };
  const free = await weave(o), even = await weave({ ...o, loom: { cut: 'blocks' } }), L = free.loom, G = L.guard, W = free.cloth.W;
  assert.equal(L.cut, 'free', 'a new rug decided together is cut free'); assert.equal(even.loom.cut, 'blocks');
  assert.equal(free.cloth.H, even.cloth.H, 'the same length of rug either way');
  // Even blocks: every row the same depth, every edge on the same few warps. Free: neither.
  const depths = rug => rug.history.filter(h => h.kind === 'passage').map(h => h.y1 - h.y0);
  const edges = rug => new Set(rug.history.filter(h => h.kind === 'passage').flatMap(h => { let x = G; return h.bench.map(b => (x += b.wide)); }));
  assert.deepEqual(depths(even), Array(L.passes).fill(L.rows)); assert.ok(edges(even).size <= L.places);
  assert.ok(new Set(depths(free)).size > 2 && depths(free).every(d => d >= L.rows / 2 && d <= L.rows * 1.6), `rows of unlike depth: ${depths(free)}`);
  assert.equal(depths(free).reduce((a, b) => a + b, 0), L.passes * L.rows);
  assert.ok(edges(free).size > L.places, 'edges that are not on a grid');
  // The decisions are still one for every place of every row, and the grid of them is kept with the rug.
  for (const rug of [free, even]) { assert.equal(rug.grid.length, L.passes); assert.ok(rug.grid.every(row => row.length === L.places && row.every(c => c.look && c.who >= 0))); }
  // A figure is another weaver's design inside a block, and only the free cut has them.
  const figures = rug => rug.cloth.mark.reduce((n, m) => n + (m & MARK.figure ? 1 : 0), 0);
  assert.equal(figures(even), 0); assert.ok(free.stats.joins.figure > 0 && figures(free) > 0);
  assert.ok(free.history.some(h => h.events.some(e => e.kind === 'figure')), 'and the story says where');
  // A tape kept before there was a choice of cut says nothing of it, and weaves again in the blocks it was woven in.
  const { cut, ...old } = even.loom, again = await weave({ seed: 7, tape: JSON.parse(JSON.stringify(even.tape)), loom: old, weavers: even.weavers, minds: even.minds, way: even.way });
  assert.equal(again.loom.cut, 'blocks'); assert.ok(same(even, again));
  // Without minds the weights are the stream's own, and the same seed cuts the same cloth.
  const [a, b] = await Promise.all([weave({ seed: 7, together: true }), weave({ seed: 7, together: true })]);
  assert.ok(same(a, b)); assert.ok(new Set(depths(a)).size > 2);
});

test('when they talk before a row, what is said is kept and heard, and the rug weaves again from its tape', async () => {
  let asked = 0;
  const speak = async ({ name, about }) => { asked++; assert.ok(about.includes('row')); return `${name} says thing ${asked}.`; };
  const rug = await weave({ seed: 11, ask: jevAsker(stub, { budget: 1e6 }), speak, together: true, loom: { deliberate: true }, weavers: WEAVERS.slice(0, 5) });
  const said = rug.record.filter(r => r.kind === 'speech'), places = rug.record.filter(r => r.kind === 'council' && r.what.startsWith('place'));
  assert.ok(said.length >= rug.loom.passes * 5 && said.every(x => x.by === 'model' && x.text), 'every weaver speaks before every row');
  assert.ok(places.every(r => r.lean?.length === 5), 'where each leaned before the talk is kept');
  assert.ok(rug.record.some(r => r.kind === 'turn') && Object.keys(rug.tape).some(k => k.includes('.lean.')));
  const again = await weave({ seed: 11, tape: JSON.parse(JSON.stringify(rug.tape)), loom: rug.loom, weavers: rug.weavers, minds: rug.minds, way: rug.way });
  assert.ok(same(rug, again)); assert.deepEqual(again.record.filter(r => r.kind === 'speech').map(x => x.text).sort(), said.map(x => x.text).sort());
  // With nobody to write a sentence, each says the plain one, and it is marked as the script's.
  const mute = await weave({ seed: 11, ask: jevAsker(stub, { budget: 1e6 }), together: true, loom: { deliberate: true }, weavers: WEAVERS.slice(0, 5) });
  assert.ok(mute.record.filter(r => r.kind === 'speech').every(x => x.by === 'script' && /^I /.test(x.text)));
});
