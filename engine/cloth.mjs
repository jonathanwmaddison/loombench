/**
 * THE CLOTH: everything code owns about what can be woven. The dye lots, the weave structures a strand can be, how a
 * yarn is plied from strands that each remember whose they were, the figures that can be planted in a ground, the
 * border bands, and the grid of stitches itself. A weaver's mind only ever chooses among these, said in words
 * (`loom.mjs`); it never sees a coordinate or a colour value.
 */

/**
 * A stitch's marks, for the picture: an open slit at its left side, a knot, a shared (hatched) edge, a figure, a band,
 * bare warp, and `plied` for a stitch of a yarn or figure that more than one mind had a hand in.
 */
export const MARK = Object.freeze({ slit: 1, knot: 2, hatch: 4, figure: 8, band: 16, bare: 32, plied: 64 });
/** Who a stitch belongs to when it is nobody's: the guild's (bands, bare ground), or not woven yet. `SHARED` is a ground two weavers hold together. */
export const GUILD = -1, UNWOVEN = -2, SHARED = -3;

/**
 * A grid `W` warps wide and `H` rows tall, row 0 the first woven (the bottom of the rug). Each stitch keeps its dye,
 * whose ground it is in (`own`, and `own2` where two hold the ground together), and whose idea put it there (`by` the
 * structure's, `by2` the colour's): ground and idea are different things, and a cloth can be read by either.
 */
export function newCloth(W, H) {
  const whose = () => new Int8Array(W * H).fill(UNWOVEN);
  return { W, H, rows: 0, bare: 0, dye: new Uint8Array(W * H).fill(255), own: whose(), own2: whose(), by: whose(), by2: whose(), mark: new Uint8Array(W * H), pass: new Int16Array(H).fill(-99) };
}

/**
 * The dye lots. In each: 0 is undyed wool, 1 the dark that outlines and shows in a slit, 2 to 5 the four dyes in the
 * pot, 6 the one kept back (the guild may bring it out when it steps back). `words` are written to one length and
 * care: a lot described more vividly than the rest is chosen for its sentence, not its colours.
 */
const lot = (key, name, words, dyes) => Object.freeze({ key, name, words, dyes: Object.freeze(dyes.map(([n, short, hex]) => Object.freeze({ name: n, short, hex }))) });
export const DYE_LOTS = Object.freeze([
  lot('madder', 'The old lot', 'The old lot: madder red, indigo, weld gold and walnut brown, with a verdigris green kept back.', [
    ['undyed wool', 'Undyed', '#e9dfc8'], ['soot black', 'Soot', '#2a2320'], ['madder red', 'Madder', '#a9332a'], ['indigo', 'Indigo', '#27406b'],
    ['weld gold', 'Gold', '#d3a23a'], ['walnut brown', 'Walnut', '#6c4a33'], ['verdigris green', 'Verdigris', '#4d8069']]),
  lot('fjord', 'The cold lot', 'The cold lot: deep fjord blue, ice blue, slate grey and lichen green, with a rust red kept back.', [
    ['undyed wool', 'Undyed', '#e6e4d9'], ['pitch black', 'Pitch', '#1f2428'], ['fjord blue', 'Fjord Blue', '#1f3d63'], ['ice blue', 'Ice', '#84abbb'],
    ['slate grey', 'Slate', '#515e68'], ['lichen green', 'Lichen', '#8c9c5c'], ['rust red', 'Rust', '#b5532f']]),
  lot('heather', 'The moor lot', 'The moor lot: heather purple, dark plum, faded rose and moss green, with a saffron yellow kept back.', [
    ['undyed wool', 'Undyed', '#ebe2d6'], ['peat black', 'Peat', '#2b2228'], ['heather purple', 'Heather', '#8e5a86'], ['dark plum', 'Plum', '#4b2a4c'],
    ['faded rose', 'Rose', '#d08c8a'], ['moss green', 'Moss', '#6f7c4a'], ['saffron yellow', 'Saffron', '#e0a526']]),
  lot('harvest', 'The warm lot', 'The warm lot: rust orange, ochre yellow, olive green and oxblood red, with a sky blue kept back.', [
    ['undyed wool', 'Undyed', '#eadfc4'], ['bark black', 'Bark', '#2c2118'], ['rust orange', 'Rust', '#b9562a'], ['ochre yellow', 'Ochre', '#cf9a2e'],
    ['olive green', 'Olive', '#6f6b34'], ['oxblood red', 'Oxblood', '#6e1f1c'], ['sky blue', 'Sky', '#6a97b1']]),
  lot('birch', 'The pale lot', 'The pale lot: birch grey, bark brown, straw gold and leaf green, with a lingonberry red kept back.', [
    ['undyed wool', 'Undyed', '#eee9dc'], ['charcoal', 'Charcoal', '#2d2a26'], ['birch grey', 'Birch', '#9c988b'], ['bark brown', 'Bark', '#5d4737'],
    ['straw gold', 'Straw', '#d9c07a'], ['leaf green', 'Leaf', '#7d9161'], ['lingonberry red', 'Lingon', '#a12d3d']]),
  lot('midsummer', 'The bright lot', 'The bright lot: vermilion red, cobalt blue, sun yellow and sea green, with a clover pink kept back.', [
    ['undyed wool', 'Undyed', '#efe6d0'], ['ink black', 'Ink', '#1e1e22'], ['vermilion red', 'Vermilion', '#d8462c'], ['cobalt blue', 'Cobalt', '#2d50a0'],
    ['sun yellow', 'Yellow', '#e8ba2e'], ['sea green', 'Sea Green', '#2f8079'], ['clover pink', 'Pink', '#d98ba9']]),
]);
export const UNDYED = 0, DARK = 1, KEPT_BACK = 6;

/**
 * The weave structures a strand can be. `at(x, y, s)` is 1 where the strand shows and 0 where what lies under it does,
 * at loom position `x`, row `y`, scale `s` (1 the finest, 4 the broadest). `thin` is the same structure drawn as lines,
 * for a strand laid over another pattern, so that the one beneath still reads. They are counted from the loom's own
 * corner, never a ground's, so a pattern holds still while the edges of its ground move.
 */
export const FILLS = Object.freeze({
  plain: { words: 'plain weave', two: false, at: () => 0 },
  bands: { words: 'weft bands', two: true, at: (x, y, s) => Math.floor(y / s) % 2, thin: (x, y, s) => (y % (2 * s + 2) === 0 ? 1 : 0) },
  pins: { words: 'pinstripes', two: true, at: (x, y, s) => Math.floor(x / s) % 2, thin: (x, y, s) => (x % (2 * s + 2) === 0 ? 1 : 0) },
  checks: { words: 'checks', two: true, at: (x, y, s) => (Math.floor(x / s) + Math.floor(y / s)) % 2, thin: (x, y, s) => (x % (2 * s + 2) < s && y % (2 * s + 2) < s ? 1 : 0) },
  twill: { words: 'twill lines', two: true, at: (x, y, s) => (Math.floor((x + y) / s) % 3 === 0 ? 1 : 0), thin: (x, y, s) => ((x + y) % (3 * s + 1) === 0 ? 1 : 0) },
  dots: { words: 'seed dots', two: true, at: (x, y, s) => { const q = s + 2, row = Math.floor(y / q); return y % q === 0 && (x + (row % 2) * (q >> 1)) % q === 0 ? 1 : 0; } },
  zigzag: { words: 'zigzag lines', two: true, at: (x, y, s) => { const m = 2 + s * 2; return Math.floor((y + Math.abs((x % (2 * m)) - m)) / s) % 3 === 0 ? 1 : 0; } },
  combs: { words: 'combs', two: true, at: (x, y, s) => { const q = s + 2; return y % (2 * q) < q && x % 2 === 0 ? 1 : 0; } },
});
/** The structures that are patterns: every one but plain weave. */
export const PATTERNS = Object.freeze(Object.keys(FILLS).filter(k => FILLS[k].two));

/**
 * A YARN is what a ground is woven with, and it is plied: a ground colour (`a`) and up to two strands laid over it,
 * lowest first. A strand is a structure (`fill`, at scale `s`) in a colour (`dye`); `thin` draws it as lines, and
 * `counter` makes it change the places of the two colours beneath it instead of bringing one of its own, which is how
 * two structures make a third that neither is (weft bands worked against pinstripes are checks).
 *
 * Every part says whose it was first: `aBy` the ground colour's, a strand's `by` its structure's and `dyeBy` its
 * colour's. A weaver who takes another's pattern into their own colours weaves a yarn of two minds, and it shows.
 */
export const strand = (fill, dye, by, dyeBy = by, more = {}) => ({ fill, dye, s: 0, by, dyeBy, thin: false, counter: false, ...more });
export const copyYarn = y => ({ a: y.a, aBy: y.aBy, strands: y.strands.map(s => ({ ...s })) });
/** Every strand that has no scale yet given `s`: a structure is taken as an idea, and the hand that weaves it sets how fine. */
export const sized = (y, s) => ({ a: y.a, aBy: y.aBy, strands: y.strands.map(t => ({ ...t, s: t.s || s })) });
/** The dyes that show in a yarn. */
export const coloursOf = y => [...new Set([y.a, ...y.strands.filter(s => !s.counter).map(s => s.dye)])];
/** Whoever had a hand in a yarn. */
export const mindsOf = y => new Set([y.aBy, ...y.strands.flatMap(s => [s.by, s.dyeBy])].filter(w => w >= 0));
/** A yarn's look as one string: two yarns that weave the same cloth have the same one, whoever's ideas they are. */
export const lookOf = y => [y.a, ...y.strands.map(s => `${s.fill}.${s.counter ? 'x' : s.dye}.${s.s}${s.thin && FILLS[s.fill].thin ? 't' : ''}`)].join('/');
export const sameLook = (a, b) => !!a && !!b && lookOf(a) === lookOf(b);

const shows = (s, x, y) => (s.thin && FILLS[s.fill].thin ? FILLS[s.fill].thin : FILLS[s.fill].at)(x, y, s.s);
/** The stitch `yarn` puts at loom position (`x`, `y`), written into `out`: its dye, and whose structure and whose colour it is. */
export function stitchOf(yarn, x, y, out) {
  const p = yarn.strands[0], q = yarn.strands[1];
  let dye = yarn.a, by = yarn.aBy, by2 = yarn.aBy, on = false;
  if (p && shows(p, x, y)) { on = true; dye = p.dye; by = p.by; by2 = p.dyeBy; }
  if (q && shows(q, x, y)) {
    if (q.counter) { dye = on ? yarn.a : p.dye; by = q.by; by2 = on ? yarn.aBy : p.dyeBy; } else { dye = q.dye; by = q.by; by2 = q.dyeBy; }
  }
  out.dye = dye; out.by = by; out.by2 = by2;
  return out;
}
const SCRATCH = { dye: 0, by: 0, by2: 0 };
export const dyeAt = (yarn, x, y) => stitchOf(yarn, x, y, SCRATCH).dye;

/** A yarn in words: its structures, how fine, and its dyes by name. A strand with no scale yet is named without one. */
const SCALE = ['', 'the finest ', 'fine ', '', 'broad '];
export function yarnName(dyes, y) {
  if (!y) return 'no yarn yet';
  const [p, q] = y.strands, name = s => `${s.thin && FILLS[s.fill].thin ? 'thin ' : ''}${FILLS[s.fill].words}`;
  if (!p) return `plain ${dyes[y.a].name}`;
  const base = `${SCALE[p.s] ?? ''}${name(p)}`;
  if (!q) return `${base} of ${dyes[p.dye].name} on ${dyes[y.a].name}`;
  if (q.counter) return `${base} and ${FILLS[q.fill].words} worked against each other in ${dyes[y.a].name} and ${dyes[p.dye].name}`;
  return `${name(q)} of ${dyes[q.dye].name} over ${base} of ${dyes[p.dye].name} on ${dyes[y.a].name}`;
}

/**
 * How far the ideas in a cloth have travelled, over its first `rows` rows, counted stitch by stitch in the field (not
 * the borders, the bare warp or the knots): how much each of `n` weavers holds and how much is of their devising
 * (`held`, `reach`), and the shares woven in a yarn of more than one mind (`plied`), in a ground two hold together
 * (`shared`), and from an idea that is not the holder's own (`foreign`).
 */
export function reachOf(cloth, guard, n, rows = cloth.rows) {
  const reach = new Float64Array(n), held = new Float64Array(n);
  let field = 0, plied = 0, shared = 0, foreign = 0;
  for (let y = 0; y < Math.min(rows, cloth.rows); y++) for (let x = guard; x < cloth.W - guard; x++) {
    const i = y * cloth.W + x, m = cloth.mark[i], o = cloth.own[i], o2 = cloth.own2[i], b = cloth.by[i], b2 = cloth.by2[i];
    if (m & (MARK.band | MARK.bare) || o < 0) continue;
    field++; held[o] += 0.5; held[o2] += 0.5;
    if (b >= 0) reach[b] += 0.5;
    if (b2 >= 0) reach[b2] += 0.5;
    if (m & MARK.plied) plied++;
    if (o !== o2) shared++;
    if ((b >= 0 && b !== o && b !== o2) || (b2 >= 0 && b2 !== o && b2 !== o2)) foreign++;
  }
  const of = x => (field ? x / field : 0);
  return { field, plied: of(plied), shared: of(shared), foreign: of(foreign), reach: Array.from(reach, of), held: Array.from(held, of) };
}

/**
 * The figures. `in(dx, dy, n)` is 0 outside, 1 the figure's body, 2 its heart, for a figure of half-width `n` whose
 * lowest row is `dy` 0 and whose middle is `dx` 0; `rows(n)` is how tall it stands.
 */
export const FIGURES = Object.freeze({
  diamond: { words: 'a diamond', rows: n => 2 * n + 1, in: (dx, dy, n) => { const d = Math.abs(dx) + Math.abs(dy - n); return d > n ? 0 : n >= 4 && d <= n - 3 ? 2 : 1; } },
  eye: { words: 'an eye, one diamond inside another', rows: n => 2 * n + 1, in: (dx, dy, n) => { const d = Math.abs(dx) + Math.abs(dy - n); return d > n ? 0 : (n - d) % 4 < 2 ? 1 : 2; } },
  star: { words: 'an eight-pointed star', rows: n => 2 * n + 1, in: (dx, dy, n) => { const ax = Math.abs(dx), ay = Math.abs(dy - n), k = Math.round(n * 0.62); return ax + ay <= n || Math.max(ax, ay) <= k ? (ax + ay <= Math.max(1, n - 4) ? 2 : 1) : 0; } },
  cross: { words: 'a cross', rows: n => 2 * n + 1, in: (dx, dy, n) => { const ax = Math.abs(dx), ay = Math.abs(dy - n), t = Math.max(0, Math.floor(n / 3)); return ax > n || ay > n || (ax > t && ay > t) ? 0 : ax <= t && ay <= t ? 2 : 1; } },
  mountain: { words: 'a stepped mountain', rows: n => n + 1, in: (dx, dy, n) => (dy < 0 || dy > n || Math.abs(dx) > n - dy ? 0 : dy % 3 === 2 ? 2 : 1) },
  hourglass: { words: 'an hourglass, two triangles tip to tip', rows: n => 2 * n + 1, in: (dx, dy, n) => (dy < 0 || dy > 2 * n || Math.abs(dx) > Math.abs(dy - n) ? 0 : 1) },
});
/** A figure's stitch at (`dx`, `dy`): its body or heart, or 3 for the line round it (a stitch outside that touches it). */
export function figureAt(kind, dx, dy, n) {
  const f = FIGURES[kind], inside = (a, b) => (b < 0 || b >= f.rows(n) ? 0 : f.in(a, b, n));
  const m = inside(dx, dy);
  return m || (inside(dx - 1, dy) || inside(dx + 1, dy) || inside(dx, dy - 1) || inside(dx, dy + 1) ? 3 : 0);
}

/**
 * The bands woven straight across by everyone: the border at each end, and a truce line. `at(x, r, h)` is 0, 1 or 2
 * (the band's three colours) in row `r` of `h`.
 */
export const BANDS = Object.freeze({
  teeth: { words: 'sawteeth', at: (x, r) => { const t = x % 6, k = r % 3; return t >= k && t <= 5 - k ? 1 : 0; } },
  checker: { words: 'a checker', at: (x, r) => ((x >> 1) + (r >> 1)) % 2 },
  running: { words: 'running water, one zigzag line', at: (x, r, h) => { const t = Math.abs((x % 8) - 4) * (h - 3) / 4; return r >= t && r < t + 3 ? (r - t < 1 ? 2 : 1) : 0; } },
  stripes: { words: 'fine stripes', at: (x, r, h) => (r === (h >> 1) ? 2 : r % 2) },
  chain: { words: 'a chain of small diamonds', at: (x, r, h) => { const d = Math.abs((x % 8) - 4) + Math.abs(r - (h >> 1)); return d <= 1 ? 2 : d <= 3 ? 1 : 0; } },
  bars: { words: 'upright bars', at: (x, r, h) => (r === 0 || r === h - 1 ? 2 : Math.floor(x / 3) % 2) },
});
