// The shared browser helpers for the LoomBench pages: building elements, showing numbers, chips, tracks, bars and tips.
// Every address a page uses is relative to the page (pages sit side by side at one depth), so the same files work under
// the local server and under a base path such as GitHub Pages' /loombench/.
import { paint } from '../engine/render.mjs';
import { HUES, NAMES, personality, goal, startStitch, startWords } from '../bench/core.mjs';
import { heededCloth } from '../bench/peers.mjs';

const SVG_TAGS = new Set(['svg', 'g', 'path', 'polyline', 'polygon', 'line', 'circle', 'rect', 'text']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const PROPERTIES = new Set(['value', 'checked', 'disabled', 'selected']);
const PARTS = [['goal', 'objective'], ['personality', 'persona'], ['both', 'objective × persona'], ['rest', 'residual']];

/** Where the code and the data live. */
export const REPO = 'https://github.com/jonathanwmaddison/loombench';

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

/** The top bar; `active` is 'results', 'controls', 'mix', 'peers', 'report', 'design', 'play' or null, and marks that link as the current page. */
export function topbar(active) {
  const link = (href, label, key) => h('a', {
    href,
    class: active === key ? 'on' : false,
    'aria-current': active === key ? 'page' : false,
  }, label);
  return h('header', { class: 'topbar' },
    h('div', { class: 'who' },
      h('a', { class: 'brand', href: './' }, 'LoomBench'),
      h('span', { class: 'tag' }, 'a multi-agent benchmark')),
    h('nav', null,
      link('./', 'Results', 'results'), link('controls', 'Controls', 'controls'), link('mix', 'Composition', 'mix'), link('peers', 'Peer influence', 'peers'), link('report', 'Report', 'report'),
      link('design', 'Design', 'design'), link('play', 'Play', 'play'), h('a', { class: 'source', href: REPO }, 'Source')));
}

/** The pictures of a match a page can show: [key, button label, file suffix]. */
export const PICTURES = Object.freeze([['flat', 'Flat colours', '-flat'], ['cloth', 'Woven output', ''], ['who', 'Ownership map', '-who']]);
/** How to read the flat picture. */
export const FLAT_NOTE = 'Each colour is one agent\'s share. Thin diagonal lines of a second colour mark a design taken from that agent; '
  + 'broad bands of two colours mark a share the two hold jointly.';

/** Whether a match (a record, or its summary in an index) was made with the agents choosing their own first designs. */
export const choseDesigns = m => !(m.rules >= 2) || m.conditions?.designs === 'chosen';

/**
 * An agent's mark beside its name: a swatch of its starting design, or, in a match where the agents chose their own
 * designs (`chosen`), a dot in its colour, since it has no starting design to show.
 */
export function seatMark(seat, chosen = false, cells = 12, px = 2) {
  return chosen ? dot(seat) : startSwatch(seat, cells, px);
}

/**
 * A model as a page names it: 'uniform random' for chance; else its name without the provider and the publisher
 * ('ollama:someone/gemma:4b' is 'gemma:4b'), with which of OpenAI's two interfaces it was asked through, since one
 * model answers both ('gpt-6-luna (Decisions API)', 'gpt-6-luna (chat)').
 */
export function modelName(model) {
  if (!model) return 'no model';
  if (model === 'chance') return 'uniform random';
  const m = /^([a-z-]+):(.+)$/.exec(String(model));
  if (!m) return String(model);
  const name = m[2].replace(/^.*\//, '');
  return m[1] === 'openai-decisions' ? `${name} (Decisions API)` : m[1] === 'openai' ? `${name} (chat)` : name;
}

/** Whether a run's model is a chat model, asked through a chat prompt and read as probabilities (`bench/llm.mjs`). */
export const isChatModel = model => /^(openai|ollama|compatible):/.test(String(model));
/** Whether a run's model is OpenAI's decision model, asked as Jev is (`bench/decisions.mjs`). */
export const isDecisionModel = model => String(model).startsWith('openai-decisions:');

/**
 * The switches of a run or a match (`conditionsOf`) in words, leaving out every default: an empty list when it was run
 * as the benchmark is by default.
 */
export function switchWords(c) {
  if (!c) return [];
  return [
    c.size ? `${c.size} agents` : null,
    c.threshold ? `claim threshold ${c.threshold}%` : null,
    c.mix ? `a group of ${c.mix}` : null,
    c.persona === 'off' ? 'personas off' : c.persona && c.persona !== 'dealt' && c.persona !== 'mixed' ? `every persona ${personality(c.persona).name.toLowerCase()}` : null,
    c.objective === 'off' ? 'objectives off' : c.objective === 'uniform' ? 'one objective for all' : c.objective && c.objective !== 'dealt' && c.objective !== 'mixed' ? `every objective ${goal(c.objective).name}` : null,
    c.agents === 'solo' ? `solo${{ refuse: ', neighbours refuse', chance: ', neighbours by chance' }[c.neighbours] ?? ''}` : null,
    c.area === 'fixed' ? 'areas fixed' : null, c.designs === 'chosen' ? 'designs chosen by the agents' : null,
    c.peers ? 'peer communication' : null,
  ].filter(Boolean);
}

// The sequential ramp for heatmaps: one hue, light to dark, from a neutral grey at zero.
const RAMP = ['#f0efec', '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']
  .map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));

/** The style of a heatmap cell holding `value` on a scale from 0 to `top`: its background on the ramp, and the ink that reads on it. */
export function heat(value, top) {
  if (!isNumber(value)) return {};
  const t = Math.min(1, Math.max(0, value / top)) * (RAMP.length - 1), i = Math.min(Math.floor(t), RAMP.length - 2), f = t - i;
  const rgb = RAMP[i].map((a, k) => Math.round(a + (RAMP[i + 1][k] - a) * f));
  const lin = c => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  return { background: `rgb(${rgb.join(', ')})`, color: 1.05 / (luminance + 0.05) >= 4.5 ? '#ffffff' : '#0b0b0b' };
}

/** A chip with a personality's name. */
export function chipPersonality(key) {
  return h('span', { class: 'chip' }, personality(key).name);
}

/** A chip with a goal's name: a told goal is blue; 'none' is a plain chip. */
export function chipGoal(key) {
  return h('span', { class: key === 'none' ? 'chip' : 'chip goal' }, goal(key).name);
}

/**
 * A small swatch of the design a seat starts the match with, drawn stitch by stitch as the loom would weave it. It is
 * the key to the woven output: an area in this colour and pattern is that agent's own design.
 */
export function startSwatch(seat, cells = 12, px = 2) {
  const canvas = h('canvas', { class: 'swatch', width: cells * px, height: cells * px, role: 'img',
    title: `${NAMES[seat]} starts with ${startWords(seat)}`, 'aria-label': `${NAMES[seat]}'s starting design: ${startWords(seat)}` });
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) { ctx.fillStyle = startStitch(seat, x, y); ctx.fillRect(x * px, (cells - 1 - y) * px, px, px); }
  return canvas;
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
  const word = reached ? 'attained' : 'not attained', sym = h('span', { class: 'sym', 'aria-hidden': 'true' }, reached ? '✓' : '✗');
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

/**
 * Paints a rug into a canvas at the given scale; `view` is 'cloth', 'who', or 'heard' (the rug by who was heeded, from the
 * record's `peers`), `shown` the rows woven so far.
 */
export function drawRug(canvas, rug, { view = 'cloth', shown, scale = 3, peers } = {}) {
  const heard = view === 'heard';
  const cloth = heard ? heededCloth(rug.cloth, peers ?? []) : rug.cloth;
  const img = paint(cloth, rug.lot.dyes, { scale, view: heard ? 'who' : view, hues: HUES, shown: shown ?? rug.cloth.rows });
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.style.maxWidth = '100%';
  canvas.style.height = 'auto';
  canvas.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
}
