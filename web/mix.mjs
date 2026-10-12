// The Composition page: a group of one type of agent, and the same matches with one, two ... of its seats given to a
// second type. The pictures side by side, the final share of an agent of each type, and what changing one seat does
// to that seat and to the seats left as they were (bench/mix.mjs).
import { h, getJSON, fmt, signed, qs, topbar, modelName, PICTURES, FLAT_NOTE } from './ui.mjs';
import { NAMES, HUES, personality, goal, sentenceOf, typeOf } from '../bench/core.mjs';
import { compositions, levelOf, shift, seatTypes } from '../bench/mix.mjs';

const main = document.querySelector('main.page');
const LEDE = 'How a group\'s results differ when one or more of its agents are given another type. A group is first made of five agents of one type; then the same matches are run again '
  + 'with one of its seats given to a second type, then two, and so on. The match number fixes the seed, the palette, each agent\'s starting design '
  + 'and the order on the bench, so within a row only the types differ.';
const cap = text => text[0].toUpperCase() + text.slice(1);

/** A type as the page names it, and the seat spec ({ personality, goal }) of one seat that holds it. */
function typeInfo(set, type) {
  for (const { run } of set.levels) for (const m of run.matches) {
    const seat = seatTypes(m).indexOf(type);
    if (seat >= 0) return { type, name: cap(type), spec: m.seats[seat] };
  }
  return { type, name: cap(type), spec: null };
}

/** The sentences an agent of a type is told, as seat 0 would be. */
function typeCard(info, role) {
  const lines = info.spec ? [sentenceOf(0, info.spec.personality, 'personality'), sentenceOf(0, info.spec.goal, 'goal')].filter(Boolean) : [];
  return h('div', { class: 'card type-card' },
    h('div', { class: 'small muted' }, role),
    h('h3', null, info.name),
    lines.length ? lines.map(line => h('p', { class: 'said' }, `“${line}”`)) : h('p', { class: 'said muted' }, 'No persona and no objective: the agent is told neither.'),
    lines.length ? h('p', { class: 'small muted' }, `As told to ${NAMES[0]}; each agent hears it with its own name.`
      + (info.spec?.goal === 'none' ? ' No objective is given.' : info.spec?.personality === 'plain' ? ' No persona is given.' : '')) : null);
}

/** The five agents of a match left to right as seated: a square in each agent's colour, ringed where it is of the second type. */
function benchStrip(m, second) {
  const order = m.bench ?? m.results.map(r => r.seat), types = seatTypes(m);
  const odd = order.filter(s => types[s] === second);
  return h('div', { class: 'strip' },
    h('div', { class: 'strip-row', role: 'img', 'aria-label': `Left to right: ${order.map(s => `${NAMES[s]} (${types[s]}, ${fmt(m.results.find(r => r.seat === s).ground)}%)`).join(', ')}` },
      order.map(s => h('span', { class: types[s] === second ? 'sq odd' : 'sq', style: { background: HUES[s] },
        title: `${NAMES[s]}: ${types[s]}, final share ${fmt(m.results.find(r => r.seat === s).ground)}%` }))),
    h('div', { class: 'strip-who small' }, odd.length === 0 ? '' : odd.length === 5 ? `all ${second}` : odd.map(s => `${NAMES[s]} ${fmt(m.results.find(r => r.seat === s).ground)}%`).join(', ')));
}

/** The pictures: a row a match number, a column a composition. */
function pictures(set, second) {
  const numbers = [...new Set(set.levels.flatMap(l => l.run.matches.map(m => m.match)))].sort((a, b) => a - b);
  let view = 'flat', shown = numbers.slice(0, 5);
  const suffix = () => PICTURES.find(([key]) => key === view)[2], label = () => PICTURES.find(([key]) => key === view)[1];
  const note = h('p', { class: 'small muted', style: { margin: '8px 0 0' } }, FLAT_NOTE);
  const box = h('div', { class: 'scroll' });
  const cell = (level, n) => {
    const m = level.run.matches.find(x => x.match === n);
    if (!m) return h('td', null, h('span', { class: 'muted small' }, 'not run'));
    return h('td', null,
      h('a', { class: 'pic', href: `match?run=${encodeURIComponent(level.run.run)}&id=${encodeURIComponent(m.id)}`, title: `${level.run.run}, match ${n}` },
        h('img', { src: `runs/${encodeURIComponent(level.run.run)}/thumbs/${encodeURIComponent(m.id)}${suffix()}.png`, loading: 'lazy', width: 232, height: 384,
          alt: `${label()}, match ${n}, ${level.count} ${second}` })),
      benchStrip(m, second));
  };
  const draw = () => box.replaceChildren(h('table', { class: 'grid pictures' },
    h('thead', null, h('tr', null, h('th', null, 'Match'), set.levels.map(l => h('th', { title: `Run ${l.run.run}` }, `${l.count} ${second}`)))),
    h('tbody', null, shown.map(n => h('tr', null, h('td', null, `Match ${n}`), set.levels.map(l => cell(l, n)))))));
  const buttons = PICTURES.map(([key, text]) => h('button', {
    type: 'button', class: key === view ? 'btn' : 'btn quiet', 'aria-pressed': String(key === view), dataset: { view: key },
    onclick: () => {
      view = key;
      for (const b of buttons) { const on = b.dataset.view === key; b.className = on ? 'btn' : 'btn quiet'; b.setAttribute('aria-pressed', String(on)); }
      note.hidden = key !== 'flat';
      draw();
    },
  }, text));
  const more = numbers.length > shown.length ? h('button', { type: 'button', class: 'btn quiet', onclick: () => { shown = numbers; more.remove(); draw(); } },
    `Show all ${numbers.length} matches`) : null;
  draw();
  return [h('div', { class: 'row', style: { margin: '12px 0 0' } }, buttons), note, box, more];
}

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs, ...children) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) if (v !== null && v !== false && v !== undefined) el.setAttribute(k, v);
  el.append(...children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false));
  return el;
};

/** The final share of an agent of each type against how many seats hold the second: two lines on one axis, intervals over matches. */
function chart(levels, first, second) {
  const W = 780, H = 320, L = 52, R = 190, T = 18, B = 44, counts = levels.map(l => l.count);
  const all = levels.flatMap(l => [first, second].map(t => l.level.types[t]?.share).filter(Boolean)).flatMap(d => [d.mean, d.hi, d.lo].filter(Number.isFinite));
  const top = Math.max(40, 10 * Math.ceil(Math.max(...all) / 10));
  const x = c => L + (W - L - R) * (counts.length > 1 ? (c - counts[0]) / (counts.at(-1) - counts[0]) : 0.5), y = v => T + (H - T - B) * (1 - Math.max(0, v) / top);
  const series = [[second, 'var(--ink)', true], [first, 'var(--muted)', false]];
  const ticks = Array.from({ length: top / 10 + 1 }, (_, i) => 10 * i);
  const ptsOf = type => levels.map(l => ({ c: l.count, d: l.level.types[type]?.share, n: l.level.matches })).filter(p => p.d);
  // The labels at the right edge (each line's end, and the starting share), set apart so that none sits on another.
  const labels = [{ key: 'start', at: y(20) }, ...series.map(([type]) => ({ key: type, end: ptsOf(type).at(-1) })).filter(l => l.end).map(l => ({ key: l.key, at: y(l.end.d.mean) }))].sort((p, q) => p.at - q.at);
  for (let i = 1; i < labels.length; i++) labels[i].at = Math.max(labels[i].at, labels[i - 1].at + 16);
  const labelAt = key => labels.find(l => l.key === key).at + 4;
  const line = ([type, ink, solid]) => {
    const pts = ptsOf(type);
    if (!pts.length) return [];
    const end = pts.at(-1);
    return [
      svg('polyline', { points: pts.map(p => `${x(p.c)},${y(p.d.mean)}`).join(' '), fill: 'none', stroke: ink, 'stroke-width': 2, 'stroke-dasharray': solid ? null : '5 4', 'stroke-linejoin': 'round' }),
      pts.map(p => [
        Number.isFinite(p.d.lo) ? svg('line', { x1: x(p.c), x2: x(p.c), y1: y(p.d.lo), y2: y(p.d.hi), stroke: ink, 'stroke-width': 1, opacity: 0.55 }) : null,
        svg('circle', { cx: x(p.c), cy: y(p.d.mean), r: 4.5, fill: solid ? ink : 'var(--surface)', stroke: ink, 'stroke-width': 2 },
          svg('title', null, `${p.c} ${second}: an agent of type ${type} ends with ${fmt(p.d.mean, 1)}% on average`
            + `${Number.isFinite(p.d.lo) ? ` (95% interval ${fmt(p.d.lo, 1)} to ${fmt(p.d.hi, 1)})` : ''}, ${p.n} matches`)),
      ]),
      svg('text', { x: x(end.c) + 12, y: labelAt(type), 'font-size': 13, fill: 'var(--ink)' }, `${cap(type)} ${fmt(end.d.mean)}%`),
    ];
  };
  return h('div', { class: 'card chart-card' },
    svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', class: 'chart',
      'aria-label': `Mean final share of an agent of each type, by the number of ${second} agents among the five. The table below gives the same numbers.` },
    ticks.map(v => [svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'var(--hairline)', 'stroke-width': 1 }),
      svg('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink-2)' }, `${v}%`)]),
    svg('line', { x1: L, x2: W - R, y1: y(20), y2: y(20), stroke: 'var(--axis)', 'stroke-width': 1, 'stroke-dasharray': '2 3' }),
    svg('text', { x: W - R + 12, y: labelAt('start'), 'font-size': 12, fill: 'var(--ink-2)' }, 'every agent starts with 20%'),
    counts.map(c => svg('text', { x: x(c), y: H - B + 20, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--ink-2)' }, String(c))),
    svg('text', { x: (L + W - R) / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--ink-2)' }, `agents of type ${second}, of five`),
    series.map(line)),
    h('p', { class: 'small muted', style: { margin: '6px 0 0' } }, `Mean final share of one agent of each type; the bars are 95% intervals over matches. `
      + 'A share is what an agent holds alone, so the shares of a match sum to less than 100 where ground is held jointly.'));
}

/** How the loom ends divided under each composition: one bar a composition, the second type's agents together, the first type's, and what two agents hold jointly. */
function bars(levels, first, second) {
  const parts = [[second, 'part-second', cap(second)], [first, 'part-first', cap(first)], ['joint', 'part-joint', 'Held jointly']];
  return h('div', { class: 'card bars-card' },
    h('div', { class: 'legend small' }, parts.map(([, cls, name]) => h('span', { class: 'legend-item' }, h('span', { class: `key ${cls}` }), name))),
    levels.map(({ count, level }) => {
      const d = level.division, total = parts.reduce((s, [k]) => s + d[k], 0) || 1;
      return h('div', { class: 'bar-row' },
        h('div', { class: 'bar-name' }, `${count} ${second}`),
        h('div', { class: 'bar', role: 'img', 'aria-label': `${count} ${second}: ${parts.map(([k, , name]) => `${name} ${fmt(d[k])}%`).join(', ')}` },
          parts.filter(([k]) => d[k] > 0.05).map(([k, cls, name]) => h('span', { class: `part ${cls}`, style: { width: `${100 * d[k] / total}%` }, title: `${name}: ${fmt(d[k], 1)}% of the loom` },
            d[k] / total > 0.07 ? `${fmt(d[k])}%` : ''))));
    }),
    h('p', { class: 'small muted', style: { margin: '10px 0 0' } }, `The mean over matches of how the loom ends divided: what the ${second} agents hold alone, what the ${first} agents hold alone, `
      + 'and what two agents hold jointly. An agent\'s share, here and below, is what it holds alone. Compositions with two or more of the second type rest on fewer matches.'));
}

const ci = d => (Number.isFinite(d.lo) ? `${signed(d.mean, 1)} [${fmt(d.lo, 1)}, ${fmt(d.hi, 1)}]` : signed(d.mean, 1));
const clear = d => Number.isFinite(d.lo) && (d.lo > 0 || d.hi < 0);

/** One step of the set (one more seat of the second type), paired by match number. */
function shiftCard(a, b, second) {
  const s = shift(a.run.matches, b.run.matches);
  if (s.matches < 2) return h('p', { class: 'sub' }, 'Fewer than two match numbers are in both runs.');
  const block = (label, rows) => rows.map((r, i) => h('tr', { class: i ? null : 'first' },
    h('td', null, i ? '' : label), h('td', null, r.name), h('td', { class: 'num' }, fmt(r.from, 1)), h('td', { class: 'num' }, fmt(r.to, 1)),
    h('td', { class: clear(r.difference) ? 'num strong' : 'num' }, ci(r.difference))));
  const picked = rows => rows.filter(r => r.key !== 'eliminated' || r.from || r.to);
  return h('div', { class: 'card comparison' },
    h('p', { class: 'small muted' }, `${a.run.run} against ${b.run.run} · ${s.matches} match numbers in both · difference is the second minus the first, with a 95% interval over matches; `
      + 'bold where the interval excludes zero. Counts are per agent over the 26 rounds.'),
    h('div', { class: 'scroll' }, h('table', { class: 'grid compare' },
      h('thead', null, h('tr', null, ['Seats', 'Measure', `${a.count} ${second}`, `${b.count} ${second}`, 'Difference [95% interval]'].map((t, i) => h('th', { class: i > 1 ? 'num' : null }, t)))),
      h('tbody', null,
        s.changed ? block(`The ${s.changed.seats === 1 ? 'seat' : `${s.changed.seats} seats`} that changed: ${s.changed.from} → ${s.changed.to}`, picked(s.changed.rows)) : null,
        Object.entries(s.kept).map(([type, kept]) => block(`The ${kept.seats === 1 ? 'seat' : `${kept.seats} seats`} that stayed ${type}`, picked(kept.rows))),
        h('tr', { class: 'first' }, h('td', null, 'The group'), h('td', null, 'Dispersion of final shares (pp)'), h('td', { class: 'num' }, fmt(s.dispersion.from, 1)),
          h('td', { class: 'num' }, fmt(s.dispersion.to, 1)), h('td', { class: clear(s.dispersion.difference) ? 'num strong' : 'num' }, ci(s.dispersion.difference))),
        h('tr', null, h('td', null, ''), h('td', null, 'Held jointly (% of the loom)'), h('td', { class: 'num' }, fmt(s.joint.from, 1)),
          h('td', { class: 'num' }, fmt(s.joint.to, 1)), h('td', { class: clear(s.joint.difference) ? 'num strong' : 'num' }, ci(s.joint.difference)))))));
}

/** Every composition of the set in one table. */
function levelsTable(levels, first, second) {
  const cell = d => (d ? fmt(d.mean, 1) : '–');
  return h('div', { class: 'scroll' }, h('table', { class: 'grid' },
    h('thead', null, h('tr', null, [`${cap(second)} agents`, 'Run', 'Matches', `Share, ${second} (%)`, `Share, ${first} (%)`, `Claims, ${second}`, `Claims, ${first}`,
      `Concessions, ${second}`, `Concessions, ${first}`, 'Held jointly (%)', 'Dispersion (pp)', 'Largest share (%)'].map((t, i) => h('th', { class: i > 1 ? 'num' : null }, t)))),
    h('tbody', null, levels.map(({ count, run, level }) => h('tr', null,
      h('td', null, `${count} of 5`), h('td', null, h('a', { href: `./?run=${encodeURIComponent(run.run)}` }, run.run)), h('td', { class: 'num' }, String(level.matches)),
      h('td', { class: 'num' }, cell(level.types[second]?.share)), h('td', { class: 'num' }, cell(level.types[first]?.share)),
      h('td', { class: 'num' }, cell(level.types[second]?.claims)), h('td', { class: 'num' }, cell(level.types[first]?.claims)),
      h('td', { class: 'num' }, cell(level.types[second]?.concessions)), h('td', { class: 'num' }, cell(level.types[first]?.concessions)),
      h('td', { class: 'num' }, fmt(level.joint.mean, 1)), h('td', { class: 'num' }, fmt(level.dispersion.mean, 1)), h('td', { class: 'num' }, fmt(level.largest.mean, 1)))))));
}

function page(sets, set) {
  const [first, second] = set.types, a = typeInfo(set, first), b = typeInfo(set, second);
  const levels = set.levels.map(l => ({ ...l, level: levelOf(l.run.matches, set.types) }));
  const steps = levels.slice(1).map((l, i) => [levels[i], l]).filter(([p, q]) => q.count === p.count + 1);
  let step = steps[0] ?? null;
  const stepBox = h('div');
  const stepButtons = steps.map(([p, q]) => h('button', { type: 'button', class: step && step[1] === q ? 'btn' : 'btn quiet', 'aria-pressed': String(step && step[1] === q), onclick: e => {
    step = [p, q];
    for (const x of stepButtons) { const on = x === e.currentTarget; x.className = on ? 'btn' : 'btn quiet'; x.setAttribute('aria-pressed', String(on)); }
    stepBox.replaceChildren(shiftCard(p, q, second));
  } }, `${p.count} → ${q.count} ${second}`));
  if (step) stepBox.replaceChildren(shiftCard(step[0], step[1], second));
  const select = sets.length > 1 ? h('select', { 'aria-label': 'Set of runs', onchange: e => { window.location.search = `?set=${encodeURIComponent(e.target.value)}`; } },
    sets.map(s => h('option', { value: s.key, selected: s === set }, `${modelName(s.model)} · ${s.types.join(' and ')}`))) : null;
  return [
    topbar('mix'),
    h('div', { class: 'spread head' }, h('h1', null, 'Composition'), select),
    h('p', { class: 'lede' }, LEDE),
    h('p', { class: 'sub' }, h('a', { href: 'brief' }, 'The study on one page'), ' has the main results of every set with their figures.'),
    h('p', { class: 'sub' }, `Decision model: ${modelName(set.model)}. Compositions run: ${levels.map(l => `${l.count} ${second} (${l.level.matches} matches)`).join(', ')}. `
      + 'Which seats hold the second type rotates with the match number, so each seat holds it equally often, and the seat that holds it when one does still holds it when two do.'),
    h('div', { class: 'types' }, typeCard(a, 'The group'), typeCard(b, 'The type that is added')),
    h('h2', null, 'The same matches as the group changes'),
    h('p', { class: 'sub' }, `Each row is one match number, each column one more ${second} agent. Under a picture the five agents are shown left to right as seated, `
      + `each in its colour; a square with a dark outline is a ${second} agent, named beneath with its final share. Select a picture to open the match.`),
    ...pictures(set, second),
    h('h2', null, 'How the loom ends divided'),
    bars(levels, first, second),
    h('h2', null, 'Final share of one agent, by type'),
    chart(levels, first, second),
    steps.length ? h('h2', null, 'What one more seat changes') : null,
    steps.length ? h('p', { class: 'sub' }, `Two compositions that differ in one seat, paired by match number: the seed, the palette, the starting designs and the seating are the same. `
      + 'The seat that changed is the same agent, in the same place, told a different sentence. For the seats that stayed, the differences are between the two matches that resulted: '
      + 'they include everything that followed from the changed seat, and do not isolate a direct response to it.') : null,
    steps.length > 1 ? h('div', { class: 'row' }, stepButtons) : null,
    steps.length ? stepBox : null,
    h('h2', null, 'Every composition'),
    levelsTable(levels, first, second),
    h('p', { class: 'small muted' }, 'node analysis/mix.mjs prints these tables. A run is made with, for example: node tools/run.mjs --model openai-decisions:gpt-6-luna '
      + '--persona cooperative --objective off --odd greedy --odd-count 1 --matches 1-10'),
  ];
}

async function start() {
  const runs = (await getJSON('api/runs.json')).filter(r => r.run !== 'play');
  const indexes = [];
  await Promise.all(runs.map(async r => { try { indexes.push(await getJSON(`runs/${encodeURIComponent(r.run)}/index.json`)); } catch { /* a run that cannot be read is left out */ } }));
  indexes.sort((a, b) => a.run.localeCompare(b.run));
  const sets = compositions(indexes);
  if (!sets.length) {
    main.replaceChildren(topbar('mix'), h('h1', null, 'Composition'), h('p', { class: 'lede' }, LEDE),
      h('p', { class: 'sub' }, 'No run of a mixed group has been made yet. For example: node tools/run.mjs --chance --persona cooperative --objective off --odd greedy --matches 1-10'));
    return;
  }
  main.replaceChildren(...page(sets, sets.find(s => s.key === qs('set')) ?? sets[0]).flat().filter(Boolean));
}

main.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
start().catch(e => main.replaceChildren(topbar('mix'), h('p', { class: 'lede' }, `The page could not be drawn: ${e.message}.`)));
