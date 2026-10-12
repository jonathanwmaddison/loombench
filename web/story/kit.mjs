// The Overview's drawing kit: what every scene of the landing page (web/story/<scene>.mjs) draws and moves with. SVG
// elements, a frame sized to the stage, axes, marks, one way to move anything (`to`), and the loom itself as a figure.
//
// MOTION. A scene never animates by hand. It says where each element should be (`to(el, { cx: 120, opacity: 1 })`) and
// the kit moves it there from wherever it is now, so a step can be reached from any other step. When motion is off
// (the reader prefers reduced motion, the tab is in the background, the address has ?still, or the call is inside
// `instant`), the same call sets the end state at once: nothing a page needs in order to show itself waits for a frame.
import { h, fmt, signed, tip } from '../ui.mjs';

const NS = 'http://www.w3.org/2000/svg';

/** A number for showing (`fmt(42.63, 1)` is '42.6') and a number with its sign (`signed(23, 1)` is '+23.0'), as every page writes them. */
export { fmt, signed };

/** The page's colours, for a scene's marks and text: CSS variables of web/app.css, and the neutral for a jointly held share. */
export const COLOR = Object.freeze({
  ink: 'var(--ink)', ink2: 'var(--ink-2)', muted: 'var(--muted)', hairline: 'var(--hairline)', axis: 'var(--axis)',
  surface: 'var(--surface)', page: 'var(--page)', accent: 'var(--told)', accentSoft: 'var(--untold)', joint: '#cfcdc2', bare: '#e6e3d9',
});

/** How each decision system is drawn wherever systems are set side by side: a colour and a shape, so neither is read alone. */
export const SYSTEM_MARKS = Object.freeze({
  jev: { hue: '#0b0b0b', shape: 'circle' }, gptd: { hue: '#2a78d6', shape: 'square' }, gptc: { hue: '#eb6834', shape: 'diamond' },
  local: { hue: '#1baf7a', shape: 'triangle' }, chance: { hue: '#898781', shape: 'ring' },
});

/**
 * An SVG element. Attributes are set as given (null, false and undefined are skipped); `opacity` is set as a style, so
 * `to` reads it back; `on*` keys are listeners. Children are appended, strings as text.
 */
export function svg(tag, attrs, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === false || value === undefined) continue;
    if (key === 'opacity') el.style.opacity = String(value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value);
  }
  el.append(...children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false));
  return el;
}

/** A line of text: `text(words, { x, y, class: 't strong', 'text-anchor': 'end' })`. Classes are in web/story.css (t, strong, small, big, mute). */
export const text = (words, attrs) => svg('text', { class: 't', ...attrs }, String(words));

/** A linear scale: `scale([0, 100], [left, right])` maps a value in the first range to a position in the second. */
export function scale([d0, d1], [r0, r1]) {
  return v => r0 + (r1 - r0) * (v - d0) / (d1 - d0 || 1);
}

/** An estimate in words: '+23.0 [16.4, 29.6]'; without its sign when `plus` is false; the mean alone where there is no interval. */
export function est(d, { digits = 1, plus = true } = {}) {
  const m = plus ? signed(d.mean, digits) : fmt(d.mean, digits);
  return Number.isFinite(d.lo) && d.lo !== null ? `${m} [${fmt(d.lo, digits)}, ${fmt(d.hi, digits)}]` : m;
}

// ---- motion ---------------------------------------------------------------------------------------------------------

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Whether motion is off for the whole page: the reader asked for less of it, or the address has `?still`. */
export const still = reduced || new URLSearchParams(window.location.search).has('still');
let instants = 0;
const immediate = () => still || instants > 0 || document.hidden;

/** Runs `fn` with motion off: every `to`, `count` and `show` inside it sets its end state at once. */
export function instant(fn) {
  instants++;
  try { return fn(); } finally { instants--; }
}

/** Easings for `to`: `EASE.inOut` (the default), `EASE.out`, `EASE.linear`. */
export const EASE = Object.freeze({
  linear: p => p, out: p => 1 - (1 - p) ** 3, inOut: p => (p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2),
});

// Every tween in flight, driven by one frame loop. A tween belongs to an owner and a key; starting another on the same
// pair stops the first where it is.
const owners = new WeakMap(), flying = new Set();
let frameId = 0;
function tick(now) {
  frameId = 0;
  for (const t of [...flying]) {
    if (now < t.start) continue;
    const p = t.duration > 0 ? Math.min(1, (now - t.start) / t.duration) : 1;
    t.frame(t.ease(p));
    if (p >= 1) { flying.delete(t); t.keys.delete(t.key); }
  }
  if (flying.size) frameId = requestAnimationFrame(tick);
}

/**
 * Drives `frame(p)` with p from 0 to 1 over `duration` milliseconds after `delay`, as the tween of `owner` called `key`
 * (it replaces a tween of the same owner and key). With motion off, `frame(1)` is called at once.
 */
export function drive(owner, key, frame, { duration = 600, delay = 0, ease = EASE.inOut } = {}) {
  const keys = owners.get(owner) ?? owners.set(owner, new Map()).get(owner), old = keys.get(key);
  if (old) flying.delete(old);
  keys.delete(key);
  if (immediate()) { frame(1); return; }
  const t = { start: performance.now() + delay, duration, ease, frame, key, keys };
  keys.set(key, t);
  flying.add(t);
  if (!frameId) frameId = requestAnimationFrame(tick);
}

const moved = new WeakMap(), MOVES = new Set(['translateX', 'translateY', 'scale']), NEVER_NEGATIVE = new Set(['width', 'height', 'r', 'rx']);
const placeOf = el => moved.get(el) ?? moved.set(el, { translateX: 0, translateY: 0, scale: 1 }).get(el);
const round = v => Math.round(v * 100) / 100;

function read(el, key) {
  if (key === 'opacity') return el.style.opacity === '' ? 1 : Number(el.style.opacity);
  if (MOVES.has(key)) return placeOf(el)[key];
  return Number(el.getAttribute(key));
}

function write(el, key, value) {
  if (key === 'opacity') {
    el.style.opacity = String(round(value));
    // An element that cannot be seen is not there for the pointer either.
    el.style.pointerEvents = value < 0.05 ? 'none' : '';
  } else if (MOVES.has(key)) {
    const p = placeOf(el);
    p[key] = value;
    if (el instanceof SVGElement) el.setAttribute('transform', `translate(${round(p.translateX)} ${round(p.translateY)})${p.scale === 1 ? '' : ` scale(${round(p.scale)})`}`);
    else el.style.transform = `translate(${round(p.translateX)}px, ${round(p.translateY)}px)${p.scale === 1 ? '' : ` scale(${round(p.scale)})`}`;
  } else el.setAttribute(key, typeof value === 'number' ? round(NEVER_NEGATIVE.has(key) ? Math.max(0, value) : value) : value);
}

/**
 * Moves an element to a state: `to(dot, { cx: 240, opacity: 1 }, { duration: 700, delay: 80 })`. Each key is a numeric
 * attribute (x, y, width, height, cx, cy, r, x1, x2, y1, y2, stroke-dashoffset ...), `opacity`, or `translateX`,
 * `translateY`, `scale` (which together are the element's transform). It starts from the value the element has now. A
 * value that is not a number (a fill, a class) is set when the move begins.
 */
export function to(el, target, options = {}) {
  for (const [key, value] of Object.entries(target)) {
    if (typeof value !== 'number') { drive(el, key, p => { if (p >= 0) write(el, key, value); }, { ...options, duration: 0 }); continue; }
    const from = read(el, key);
    if (!Number.isFinite(from) || from === value) { drive(el, key, () => write(el, key, value), { duration: 0, delay: 0 }); continue; }
    drive(el, key, p => write(el, key, from + (value - from) * p), options);
  }
  return el;
}

/** Shows or hides an element by its opacity: `fade(label, i >= 2)`. */
export const fade = (el, on, options) => to(el, { opacity: on ? 1 : 0 }, options);

const counted = new WeakMap();
/**
 * Sets a text element to a number, counting to it from the number it showed before:
 * `count(label, 42.6, { digits: 1, suffix: '%' })`; `plus` writes the sign of a positive number.
 */
export function count(el, value, { digits = 0, prefix = '', suffix = '', plus = false, ...options } = {}) {
  const from = counted.get(el), say = v => { counted.set(el, v); el.textContent = `${prefix}${plus ? signed(v, digits) : fmt(v, digits)}${suffix}`; };
  if (!Number.isFinite(from) || from === value) { drive(el, 'count', () => say(value), { duration: 0 }); return el; }
  drive(el, 'count', p => say(from + (value - from) * p), options);
  return el;
}

/**
 * Draws a line or path in, or takes it out: `draw(path, i >= 1)`. The first call measures it, so the path must be in
 * the document by then. A path drawn in this way must have no `stroke-dasharray` of its own.
 */
export function draw(path, on, options) {
  if (!path.dataset.length) {
    const length = Math.ceil(path.getTotalLength()) + 1;
    path.dataset.length = String(length);
    path.setAttribute('stroke-dasharray', `${length} ${length}`);
    if (!path.hasAttribute('stroke-dashoffset')) path.setAttribute('stroke-dashoffset', String(length));
  }
  return to(path, { 'stroke-dashoffset': on ? 0 : Number(path.dataset.length) }, options);
}

// ---- the frame, axes and marks ----------------------------------------------------------------------------------------

/**
 * The figure's SVG, sized to the stage it is given: `const { root, W, H, narrow } = chart(stage, { height: W => W * 0.7 })`.
 * W is the stage's width in CSS pixels (300 to 680) and H the height asked for, held between 260 and the tallest the
 * stage allows; `narrow` is true under 440 wide (a phone), where a scene uses shorter labels. Everything a scene draws
 * is placed from W and H, never from fixed numbers. `label` is what a screen reader is told the figure shows. Whatever
 * a scene sets above its chart (a legend, a note) is appended to the stage first, and its height is taken off the tallest.
 */
export function chart(stage, { height = W => W * 0.72, label = '' } = {}) {
  const W = Math.round(Math.min(680, Math.max(300, stage.clientWidth || 640))), above = [...stage.children].reduce((sum, el) => sum + el.offsetHeight + 8, 0);
  const tallest = Math.max(240, (Number(stage.dataset.tallest) || 560) - above);
  const H = Math.round(Math.min(tallest, Math.max(260, typeof height === 'function' ? height(W, tallest) : height)));
  const root = svg('svg', { class: 'story-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': label });
  stage.append(root);
  return { root, W, H, narrow: W < 440 };
}

/**
 * A horizontal axis into `g`: a label under `y` at each of `ticks` and, with `grid: [top, bottom]`, a hairline up the
 * plot at each. `x` is the scale; `format` writes a tick.
 */
export function axisX(g, x, ticks, { y, format = String, grid = null } = {}) {
  for (const v of ticks) {
    if (grid) g.append(svg('line', { x1: x(v), x2: x(v), y1: grid[0], y2: grid[1], stroke: COLOR.hairline, 'stroke-width': 1 }));
    g.append(text(format(v), { x: x(v), y: y + 16, 'text-anchor': 'middle', class: 't small' }));
  }
  return g;
}

/** A vertical axis into `g`: a label left of `x` at each of `ticks` and, with `grid: [left, right]`, a hairline across the plot at each. */
export function axisY(g, y, ticks, { x, format = String, grid = null } = {}) {
  for (const v of ticks) {
    if (grid) g.append(svg('line', { x1: grid[0], x2: grid[1], y1: y(v), y2: y(v), stroke: COLOR.hairline, 'stroke-width': 1 }));
    g.append(text(format(v), { x: x - 8, y: y(v) + 4, 'text-anchor': 'end', class: 't small' }));
  }
  return g;
}

/**
 * A mark centred on (0, 0) inside a group, to be placed and moved with `translateX` and `translateY`:
 * `const m = mark('circle', { r: 5, fill: hue }); place(m, x, y);`. Shapes: circle, ring (hollow), square, diamond,
 * triangle. Every mark carries a 2px ring in the surface colour, so it stays legible where it crosses a line.
 */
export function mark(shape, { r = 5, fill = COLOR.ink, ...attrs } = {}) {
  const ring = { stroke: COLOR.surface, 'stroke-width': 2, 'paint-order': 'stroke' };
  const body = shape === 'ring' ? svg('circle', { r: r - 1, fill: COLOR.surface, stroke: fill, 'stroke-width': 2 })
    : shape === 'square' ? svg('rect', { x: -r * 0.9, y: -r * 0.9, width: r * 1.8, height: r * 1.8, rx: 1, fill, ...ring })
      : shape === 'diamond' ? svg('path', { d: `M0 ${-r * 1.25}L${r * 1.25} 0L0 ${r * 1.25}L${-r * 1.25} 0Z`, fill, ...ring })
        : shape === 'triangle' ? svg('path', { d: `M0 ${-r * 1.2}L${r * 1.15} ${r * 0.9}L${-r * 1.15} ${r * 0.9}Z`, fill, ...ring })
          : svg('circle', { r, fill, ...ring });
  return svg('g', attrs, body);
}

/** Puts an element at (x, y) at once, by its transform: where it starts, before any `to`. */
export function place(el, x, y) {
  write(el, 'translateX', x);
  write(el, 'translateY', y);
  return el;
}

/**
 * An estimate drawn on a horizontal scale: its interval as a line and its mean as a mark, in a group placed at row `y`.
 * Returns { g, move(d, options) }: `move` slides the interval and the mark to another estimate. `x` is the scale.
 */
export function interval(d, { x, y, shape = 'circle', fill = COLOR.ink, r = 5 } = {}) {
  const has = e => Number.isFinite(e.lo) && e.lo !== null;
  const bar = svg('line', { x1: x(has(d) ? d.lo : d.mean), x2: x(has(d) ? d.hi : d.mean), y1: 0, y2: 0, stroke: fill, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.55 });
  const dot = place(mark(shape, { fill, r }), x(d.mean), 0), g = place(svg('g', null, bar, dot), 0, y);
  return { g, move(e, options) { to(bar, { x1: x(has(e) ? e.lo : e.mean), x2: x(has(e) ? e.hi : e.mean) }, options); to(dot, { translateX: x(e.mean) }, options); } };
}

/**
 * For a strip of marks on one line: the vertical offset of each, so that marks of radius `r` at these x positions do
 * not sit on one another. `dodge([120, 122, 300])` is [0, 11, 0]: the second is set below the first.
 */
export function dodge(xs, r = 5) {
  const placed = [], gap = 2 * r + 1;
  return xs.map(x => {
    for (let k = 0; ; k++) {
      const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * gap;
      if (!placed.some(p => p.dy === dy && Math.abs(p.x - x) < gap)) { placed.push({ x, dy }); return dy; }
    }
  });
}

/** Says `words` (a string, or a function that returns one) beside the pointer while it is over `el`. */
export function hint(el, words) {
  el.addEventListener('pointermove', e => tip.show(e, typeof words === 'function' ? words() : words));
  el.addEventListener('pointerleave', () => tip.hide());
  return el;
}

/**
 * A legend above the figure: `legend([{ label: 'no objective', shape: 'ring', hue }, ...])`, each a small mark and its
 * name. Shapes are those of `mark`, and 'line'. Returns the element (append it to the stage before the chart); its
 * `.items` are the entries in order, for a scene that shows one only from some step on (`fade(lg.items[2], i >= 2)`).
 */
export function legend(entries) {
  const items = entries.map(({ label, shape = 'circle', hue = COLOR.ink }) => {
    const key = svg('svg', { width: 18, height: 12, viewBox: '-9 -6 18 12', 'aria-hidden': 'true' },
      shape === 'line' ? svg('line', { x1: -8, x2: 8, y1: 0, y2: 0, stroke: hue, 'stroke-width': 2, 'stroke-linecap': 'round' }) : mark(shape, { r: 4.5, fill: hue }));
    return h('span', { class: 'key' }, key, label);
  });
  const el = h('div', { class: 'legend story-legend' }, items);
  el.items = items;
  return el;
}

// ---- the loom ---------------------------------------------------------------------------------------------------------

/**
 * A match as the cloth it wove, drawn into `g` inside the box { x, y, w, h }. One row a round, the first at the bottom,
 * each row divided left to right as the loom was held in that round: a segment in its holder's colour, a segment two
 * agents hold jointly in two bands of their colours. Above the cloth, a bar gives the allocation at the round shown,
 * agent by agent in their starting order, with each agent's name and share when `labels` is 'full' (or the share alone,
 * 'share'; or nothing, 'none'). `timeline` is one of the overview's (`bench/overview.mjs`, `timelineOf`).
 *
 * Returns { show(n, options), rounds }: `show(n)` weaves or unweaves to round n (0 is the start, before anything is
 * woven; `rounds` is the last), moving the bar through every round on the way. `options.duration` is for the whole move.
 */
export function loom(g, timeline, { x, y, w, h, labels = 'full', emphasis = null } = {}) {
  const N = timeline.rounds.length, seats = timeline.order, hue = seat => timeline.seats.find(s => s.seat === seat).hue;
  const nameOf = seat => timeline.seats.find(s => s.seat === seat).name;
  const barH = 14, head = labels === 'none' ? barH + 8 : labels === 'share' ? barH + 24 : barH + 40, top = y + head, rowH = (h - head) / N;
  // The allocation at each point of the match: every agent's own share in starting order, then what is held jointly.
  const start = seats.map(() => 100 / seats.length);
  const states = [start, ...timeline.shares.map(s => seats.map(seat => s[seat]))].map(own => [...own, Math.max(0, 100 - own.reduce((a, b) => a + b, 0))]);
  const px = v => (w * v) / 100;

  const rows = timeline.rounds.map((segments, r) => {
    const row = svg('g', { opacity: 0 });
    let at = 0;
    for (const s of segments) {
      const x0 = x + px(at), wide = Math.max(0, px(s.wide) - 1), y0 = top + (N - 1 - r) * rowH, tall = Math.max(1, rowH - 1);
      if (s.seats.length === 2) {
        row.append(svg('rect', { x: x0, y: y0, width: wide, height: tall / 2, fill: hue(s.seats[0]) }), svg('rect', { x: x0, y: y0 + tall / 2, width: wide, height: tall / 2, fill: hue(s.seats[1]) }));
      } else row.append(svg('rect', { x: x0, y: y0, width: wide, height: tall, fill: s.seats.length ? hue(s.seats[0]) : COLOR.bare }));
      at += s.wide;
    }
    g.append(row);
    return row;
  });
  g.append(svg('rect', { x, y: top, width: w, height: h - head, fill: 'none', stroke: COLOR.hairline, 'stroke-width': 1 }));

  const parts = states[0].map((_, i) => {
    const joint = i === seats.length, seat = joint ? null : seats[i];
    const rect = svg('rect', { y: y + head - barH - 6, height: barH, rx: 2, fill: joint ? COLOR.joint : hue(seat), x, width: 0 });
    const strong = seat !== null && seat === emphasis;
    const name = labels === 'full' ? text(joint ? 'joint' : nameOf(seat), { y: y + 12, 'text-anchor': 'middle', class: strong ? 't small strong' : 't small' }) : null;
    const share = labels === 'none' ? null : text('', { y: y + (labels === 'full' ? 28 : 12), 'text-anchor': 'middle', class: strong ? 't strong' : 't' });
    g.append(rect, ...[name, share].filter(Boolean));
    if (seat !== null) hint(rect, () => `${nameOf(seat)}: ${fmt(shown[i], 0)}% of the loom`);
    return { rect, name, share };
  });
  // The least width, in pixels, a segment needs to carry a label above it.
  const room = labels === 'full' ? 44 : 30;
  let at = 0, shown = states[0];
  function render(p) {
    at = p;
    const a = Math.min(N, Math.floor(p)), b = Math.min(N, a + 1), f = p - a;
    shown = states[a].map((v, i) => v + (states[b][i] - v) * f);
    rows.forEach((row, r) => { row.style.opacity = String(round(Math.min(1, Math.max(0, p - r)))); });
    let left = 0;
    parts.forEach((part, i) => {
      const wide = px(shown[i]), mid = x + px(left) + wide / 2, fits = wide >= room;
      part.rect.setAttribute('x', round(x + px(left)));
      part.rect.setAttribute('width', round(Math.max(0, wide - 1)));
      for (const label of [part.name, part.share]) if (label) { label.setAttribute('x', round(mid)); label.style.opacity = fits ? '1' : '0'; }
      if (part.share) part.share.textContent = `${fmt(shown[i], 0)}%`;
      left += shown[i];
    });
  }
  render(0);
  return {
    rounds: N,
    show(n, { duration = 2400, delay = 0, ease = EASE.inOut } = {}) {
      const from = at, goal = Math.min(N, Math.max(0, n));
      drive(g, 'loom', p => render(from + (goal - from) * p), { duration: from === goal ? 0 : duration, delay, ease });
    },
  };
}
