// The shared browser helpers for the LoomBench pages: building elements, showing numbers, chips, tracks, bars and tips.
import { paint } from '/engine/render.mjs';
import { HUES, personality, goal } from '/bench/core.mjs';

const SVG_TAGS = new Set(['svg', 'g', 'path', 'polyline', 'polygon', 'line', 'circle', 'rect', 'text']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const PROPERTIES = new Set(['value', 'checked', 'disabled', 'selected']);
const PARTS = [['goal', 'the goal'], ['personality', 'the personality'], ['both', 'the two together'], ['rest', 'everything else']];

const isNumber = x => typeof x === 'number' && Number.isFinite(x);

// Children as DOM nodes: arrays flattened, strings and numbers as text, null, undefined and booleans skipped.
function nodesOf(list) {
  const out = [];
  for (const c of list) {
    if (c === null || c === undefined || typeof c === 'boolean') continue;
    if (Array.isArray(c)) out.push(...nodesOf(c));
    else if (c instanceof Node) out.push(c);
    else out.push(document.createTextNode(String(c)));
  }
  return out;
}

/** A DOM element, built without innerHTML. Attributes: class, style, dataset, on* listeners, value/checked/disabled/selected. */
export function h(tag, attrs, ...children) {
  const svg = SVG_TAGS.has(tag);
  const el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  const properties = [];
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') {
      if (svg) el.setAttribute('class', value);
      else el.className = value;
    } else if (key === 'style') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on')) {
      el.addEventListener(key.slice(2), value);
    } else if (PROPERTIES.has(key)) {
      properties.push([key, value]);
    } else {
      el.setAttribute(key, value === true ? '' : value);
    }
  }
  el.append(...nodesOf(children));
  // Set after the children exist, so a select's value can pick one of its options.
  for (const [key, value] of properties) el[key] = value;
  return el;
}

/** Fetches a URL and parses the JSON; throws an Error with the status when the answer is not ok. */
export async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

/** A number rounded for showing, with no minus on zero; '–' for NaN, null or undefined. */
export function fmt(x, digits = 0) {
  if (!isNumber(x)) return '–';
  const s = x.toFixed(digits);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

/** A number with its sign: '+12', '−3' (a true minus), '0'; '–' for NaN. */
export function signed(x, digits = 0) {
  if (!isNumber(x)) return '–';
  const r = Number(x.toFixed(digits));
  const sign = r > 0 ? '+' : r < 0 ? '−' : '';
  return sign + Math.abs(r).toFixed(digits);
}

/** A share shown as a percent: 0.62 becomes '62%'; '–' for NaN. */
export function pct(x) {
  return isNumber(x) ? `${fmt(x * 100)}%` : '–';
}

/** A query-string value from the page address, or null when it is absent or empty. */
export function qs(name) {
  return new URLSearchParams(window.location.search).get(name) || null;
}

/** The top bar; `active` is 'results', 'play' or null, and marks that link as the current page. */
export function topbar(active) {
  const link = (href, label, key) => h('a', {
    href,
    class: active === key ? 'on' : false,
    'aria-current': active === key ? 'page' : false,
  }, label);
  return h('header', { class: 'topbar' },
    h('div', { class: 'who' },
      h('a', { class: 'brand', href: '/' }, 'LoomBench'),
      h('span', { class: 'tag' }, 'a multi-agent benchmark')),
    h('nav', null, link('/', 'Results', 'results'), link('/play', 'Play', 'play')));
}

/** A chip with a personality's name. */
export function chipPersonality(key) {
  return h('span', { class: 'chip' }, personality(key).name);
}

/** A chip with a goal's name: a told goal is blue; 'none' is a plain chip. */
export function chipGoal(key) {
  return h('span', { class: key === 'none' ? 'chip' : 'chip goal' }, goal(key).name);
}

/** The coloured dot for a seat (0 to 4). Decorative: the name sits beside it. */
export function dot(seat) {
  return h('span', { class: `dot seat-${seat}`, 'aria-hidden': 'true' });
}

/**
 * The mark for a goal: '✓ reached', '✗ not reached', or nothing (an empty text node) for null. `short` shows the sign
 * alone, for a tight line; the word is still there for a screen reader and on hover.
 */
export function mark(reached, { short = false } = {}) {
  if (reached === null || reached === undefined) return document.createTextNode('');
  const word = reached ? 'reached' : 'not reached', sym = h('span', { class: 'sym', 'aria-hidden': 'true' }, reached ? '✓' : '✗');
  return h('span', { class: reached ? 'reached' : 'missed', title: short ? word : false, 'aria-label': short ? word : false }, sym, short ? null : word);
}

/** A 0 to 100 scale with a hollow dot at `from` and a filled dot at `to`, joined by a line when both are given. */
export function track({ from, to, title } = {}) {
  const clamp = x => (isNumber(x) ? Math.min(100, Math.max(0, x)) : null);
  const a = clamp(from);
  const b = clamp(to);
  const parts = [];
  if (a !== null && b !== null) {
    parts.push(h('span', { class: 'link', style: { left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%` } }));
  }
  if (a !== null) parts.push(h('span', { class: 'from', style: { left: `${a}%` } }));
  if (b !== null) parts.push(h('span', { class: 'to', style: { left: `${b}%` } }));
  return h('div', { class: 'track', title }, parts);
}

/** The four shares of a score's spread as one stacked bar, each segment with its name and percent on hover. */
export function splitbar(split) {
  if (!split) return h('div', { class: 'splitbar none' }, 'not enough matches');
  const segments = [];
  for (const [key, label] of PARTS) {
    const share = isNumber(split[key]) ? split[key] : 0;
    if (share < 0.005) continue;
    const text = `${label}: ${pct(share)}`;
    segments.push(h('span', {
      class: `seg ${key}`,
      style: { flexGrow: share },
      title: text,
      onpointermove: e => tip.show(e, text),
      onpointerleave: () => tip.hide(),
    }));
  }
  return h('div', { class: 'splitbar' }, segments);
}

/** The legend for splitbar: a swatch and a name for each of the four segments. */
export function splitLegend() {
  return h('div', { class: 'legend' },
    PARTS.map(([key, label]) => h('span', { class: 'key' }, h('span', { class: `sw ${key}`, 'aria-hidden': 'true' }), label)));
}

let tipBox = null;

/** One tooltip that follows the pointer: show(event, content) and hide(). Content is a node or a string. */
export const tip = {
  show(event, content) {
    if (!tipBox) {
      tipBox = h('div', { class: 'tooltip', role: 'tooltip', hidden: true });
      document.body.append(tipBox);
    }
    tipBox.replaceChildren(...nodesOf([content]));
    tipBox.hidden = false;
    const gap = 12;
    const w = tipBox.offsetWidth;
    const hgt = tipBox.offsetHeight;
    let x = event.clientX + gap;
    let y = event.clientY + gap;
    if (x + w > window.innerWidth) x = event.clientX - gap - w;
    if (y + hgt > window.innerHeight) y = event.clientY - gap - hgt;
    tipBox.style.left = `${Math.max(0, x)}px`;
    tipBox.style.top = `${Math.max(0, y)}px`;
  },
  hide() {
    if (tipBox) tipBox.hidden = true;
  },
};

/** Paints a rug into a canvas at the given scale; `view` is 'cloth' or 'who', `shown` the rows woven so far. */
export function drawRug(canvas, rug, { view = 'cloth', shown, scale = 3 } = {}) {
  const img = paint(rug.cloth, rug.lot.dyes, { scale, view, hues: HUES, shown: shown ?? rug.cloth.rows });
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.style.maxWidth = '100%';
  canvas.style.height = 'auto';
  canvas.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
}
