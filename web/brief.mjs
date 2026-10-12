// The Brief: the group-composition study on one page. Every number, sentence of results and picture is made from the
// run records (bench/mix.mjs): one match as agents of another type are added, every match before and after one seat is
// changed, the final share of one agent by how many of the second type there are, and what was found, with its limits.
import { h, getJSON, fmt, signed, topbar, modelName } from './ui.mjs';
import { NAMES, HUES, sentenceOf } from '../bench/core.mjs';
import { compositions, levelOf, shift, seatTypes } from '../bench/mix.mjs';
import { mean } from '../bench/stats.mjs';

const main = document.querySelector('main.page');
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs, ...children) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) if (v !== null && v !== false && v !== undefined) el.setAttribute(k, v);
  el.append(...children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false));
  return el;
};
const INK = 'var(--ink)', GREY = 'var(--muted)';
const short = model => (/^jev/.test(String(model)) ? 'Jev' : /^openai-decisions:/.test(String(model)) ? 'GPT' : modelName(model));
const MODELS = 'Jev is jev-1.13.0; GPT is OpenAI\'s decision model (gpt-6-luna, Decisions API).';
const ci = d => (Number.isFinite(d.lo) ? `${signed(d.mean, 1)} [${fmt(d.lo, 1)}, ${fmt(d.hi, 1)}]` : signed(d.mean, 1));
const row = (rows, key) => rows.find(r => r.key === key);
const shareOf = (m, seat) => m.results.find(r => r.seat === seat).ground;

/** A set as the brief uses it: its levels measured, the step from none to one, and each match number before and after that step. */
function read(set) {
  const [group, added] = set.types, levels = set.levels.map(l => ({ ...l, level: levelOf(l.run.matches, set.types) }));
  const none = levels.find(l => l.count === 0), one = levels.find(l => l.count === 1);
  if (!none || !one) return null;
  const before = new Map(none.run.matches.map(m => [m.match, m]));
  const pairs = one.run.matches.filter(q => before.has(q.match)).map(q => {
    const p = before.get(q.match), tq = seatTypes(q), seats = [0, 1, 2, 3, 4];
    const changed = seats.filter(s => tq[s] === added), kept = seats.filter(s => tq[s] !== added);
    return { match: q.match, changed: [mean(changed.map(s => shareOf(p, s))), mean(changed.map(s => shareOf(q, s)))], kept: [mean(kept.map(s => shareOf(p, s))), mean(kept.map(s => shareOf(q, s)))] };
  }).sort((a, b) => a.match - b.match);
  return { set, group, added, model: set.model, levels, none, one, pairs, step: shift(none.run.matches, one.run.matches), name: `${short(set.model)} · ${group} + ${added}` };
}

/** The five agents of a match left to right as seated: a square in each agent's colour, outlined where it is of the added type. */
function bench(m, added) {
  const order = m.bench ?? m.results.map(r => r.seat), types = seatTypes(m);
  return h('div', { class: 'strip-row', role: 'img', 'aria-label': `Left to right: ${order.map(s => `${NAMES[s]} (${types[s]}, ${fmt(shareOf(m, s))}%)`).join(', ')}` },
    order.map(s => h('span', { class: types[s] === added ? 'sq odd' : 'sq', style: { background: HUES[s] }, title: `${NAMES[s]}: ${types[s]}, final share ${fmt(shareOf(m, s))}%` })));
}

/** One match number under every composition of a set: the flat-colour pictures side by side. */
function strip(d, title) {
  // The match shown: of those run under every composition, the one whose changed seat ended closest to the mean for one added agent.
  const everywhere = d.pairs.filter(p => d.levels.every(l => l.run.matches.some(m => m.match === p.match)));
  const target = mean(d.pairs.map(p => p.changed[1])), chosen = [...everywhere].sort((a, b) => Math.abs(a.changed[1] - target) - Math.abs(b.changed[1] - target) || a.match - b.match)[0];
  if (!chosen) return null;
  const cells = d.levels.map(l => {
    const m = l.run.matches.find(x => x.match === chosen.match), types = seatTypes(m);
    const who = m.results.filter(r => types[r.seat] === d.added).map(r => fmt(r.ground)).join(', ');
    return h('a', { class: 'rug', href: `match?run=${encodeURIComponent(l.run.run)}&id=${encodeURIComponent(m.id)}`, title: `${l.run.run}, match ${m.match}` },
      h('img', { src: `runs/${encodeURIComponent(l.run.run)}/thumbs/${encodeURIComponent(m.id)}-flat.png`, width: 232, height: 384, alt: `Flat colours: match ${m.match} with ${l.count} ${d.added}` }),
      bench(m, d.added),
      h('div', { class: 'rug-n' }, `${l.count} ${d.added}`),
      h('div', { class: 'rug-who' }, l.count === 0 ? `all ${d.group}` : l.count === 5 ? `all ${d.added}` : `${who}%`));
  });
  return h('div', { class: 'strip' },
    h('h3', null, title, h('span', { class: 'strip-of' }, ` ${short(d.model)}, match ${chosen.match}`)),
    h('div', { class: 'rugs' }, cells));
}

/** Every match number before and after one seat is changed: a line a match, for the seat that changed and for the mean of the four that did not. */
function slopes(d, top) {
  const W = 198, H = 176, L = 30, R = 6, T = 8, B = 26, xa = L + 36, xb = W - R - 36, y = v => T + (H - T - B) * (1 - Math.min(top, Math.max(0, v)) / top);
  const c = row(d.step.changed.rows, 'share'), k = row(d.step.kept[d.group].rows, 'share');
  // The two numbers at each side are set apart so that neither sits on the other.
  const apart = (p, q) => (Math.abs(p - q) < 13 ? (p <= q ? [q - 13, q] : [p, p - 13]) : [p, q]);
  const [lc, lk] = apart(y(c.from), y(k.from)), [rc, rk] = apart(y(c.to), y(k.to));
  return h('div', { class: 'panel' },
    h('div', { class: 'panel-name' }, d.name),
    h('div', { class: 'panel-sub' }, `changed seat ${ci(c.difference)}`),
    svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', class: 'plot',
      'aria-label': `${d.name}: the seat that was changed went from ${fmt(c.from, 1)}% to ${fmt(c.to, 1)}% on average, the four left as they were from ${fmt(k.from, 1)}% to ${fmt(k.to, 1)}%, over ${d.step.matches} matches` },
    [0, 20, 40, 60].filter(v => v <= top).map(v => [svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'var(--hairline)', 'stroke-width': 1 }),
      svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--ink-2)' }, `${v}%`)]),
    d.pairs.map(p => svg('line', { x1: xa, x2: xb, y1: y(p.kept[0]), y2: y(p.kept[1]), stroke: GREY, 'stroke-width': 1, opacity: 0.5 },
      svg('title', null, `Match ${p.match}: the four left ${d.group} averaged ${fmt(p.kept[0], 1)}% and then ${fmt(p.kept[1], 1)}%`))),
    d.pairs.map(p => svg('line', { x1: xa, x2: xb, y1: y(p.changed[0]), y2: y(p.changed[1]), stroke: INK, 'stroke-width': 1.25, opacity: 0.45 },
      svg('title', null, `Match ${p.match}: the changed seat held ${fmt(p.changed[0], 1)}% as ${d.group} and ${fmt(p.changed[1], 1)}% as ${d.added}`))),
    [[xa, k.from], [xb, k.to]].map(([x, v]) => svg('circle', { cx: x, cy: y(v), r: 4, fill: 'var(--surface)', stroke: GREY, 'stroke-width': 2 })),
    [[xa, c.from], [xb, c.to]].map(([x, v]) => svg('circle', { cx: x, cy: y(v), r: 4.5, fill: INK, stroke: 'var(--surface)', 'stroke-width': 1.5 })),
    svg('text', { x: xa - 9, y: lc + 4, 'text-anchor': 'end', 'font-size': 12, 'font-weight': 600, fill: INK }, fmt(c.from)),
    svg('text', { x: xa - 9, y: lk + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink-2)' }, fmt(k.from)),
    svg('text', { x: xb + 9, y: rc + 4, 'font-size': 13, 'font-weight': 600, fill: INK }, fmt(c.to)),
    svg('text', { x: xb + 9, y: rk + 4, 'font-size': 12, fill: 'var(--ink-2)' }, fmt(k.to)),
    svg('text', { x: xa, y: H - 9, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--ink-2)' }, `all ${d.group}`),
    svg('text', { x: xb, y: H - 9, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--ink-2)' }, `one ${d.added}`)));
}

/** The final share of one agent of each type against how many agents are of the added type. */
function sweep(d, top) {
  const W = 248, H = 176, L = 32, R = 14, T = 8, B = 26, counts = d.levels.map(l => l.count);
  const x = c => L + 10 + (W - L - R - 20) * (c - counts[0]) / Math.max(1, counts.at(-1) - counts[0]), y = v => T + (H - T - B) * (1 - Math.min(top, Math.max(0, v)) / top);
  const pts = type => d.levels.map(l => ({ c: l.count, s: l.level.types[type]?.share, n: l.level.matches })).filter(p => p.s);
  const line = (type, ink, solid) => {
    const ps = pts(type);
    return [svg('polyline', { points: ps.map(p => `${x(p.c)},${y(p.s.mean)}`).join(' '), fill: 'none', stroke: ink, 'stroke-width': 2, 'stroke-dasharray': solid ? null : '5 4', 'stroke-linejoin': 'round' }),
      ps.map(p => svg('circle', { cx: x(p.c), cy: y(p.s.mean), r: 3.8, fill: solid ? ink : 'var(--surface)', stroke: ink, 'stroke-width': 2 },
        svg('title', null, `${p.c} ${d.added}: one ${type} agent ends with ${fmt(p.s.mean, 1)}% on average (${p.n} matches)`)))];
  };
  const a = pts(d.added), g = pts(d.group);
  return h('div', { class: 'panel' },
    h('div', { class: 'panel-name' }, d.name),
    h('div', { class: 'panel-sub' }, `one ${d.added} agent: ${a.map(p => fmt(p.s.mean)).join(', ')}%`),
    svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', class: 'plot',
      'aria-label': `${d.name}: mean final share of one ${d.added} agent with ${a.map(p => p.c).join(', ')} of them: ${a.map(p => fmt(p.s.mean)).join(', ')} percent; of one ${d.group} agent with ${g.map(p => p.c).join(', ')}: ${g.map(p => fmt(p.s.mean)).join(', ')} percent` },
    [0, 20, 40, 60].filter(v => v <= top).map(v => [svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: v === 20 ? 'var(--axis)' : 'var(--hairline)', 'stroke-width': 1, 'stroke-dasharray': v === 20 ? '2 3' : null }),
      svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--ink-2)' }, `${v}%`)]),
    line(d.group, GREY, false), line(d.added, INK, true),
    a.length ? svg('text', { x: x(a[0].c) + 8, y: y(a[0].s.mean) - 8, 'font-size': 12, 'font-weight': 600, fill: INK }, `${fmt(a[0].s.mean)}`) : null,
    a.length > 1 ? svg('text', { x: x(a.at(-1).c) - 6, y: y(a.at(-1).s.mean) - 9, 'text-anchor': 'end', 'font-size': 12, 'font-weight': 600, fill: INK }, `${fmt(a.at(-1).s.mean)}`) : null,
    g.length ? svg('text', { x: x(g[0].c) - 2, y: y(g[0].s.mean) - 9, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--ink-2)' }, `${fmt(g[0].s.mean)}`) : null,
    counts.map(c => svg('text', { x: x(c), y: H - 9, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--ink-2)' }, String(c)))),
    h('div', { class: 'panel-x' }, `${d.added} agents of five`));
}

/** How the loom ends divided under each composition: the added type's agents together, the group's, and what two agents hold jointly. */
function bars(d) {
  const parts = [[d.added, 'part-second'], [d.group, 'part-first'], ['joint', 'part-joint']];
  return h('div', { class: 'panel' },
    h('div', { class: 'panel-name' }, `${d.name}: the whole loom`),
    h('div', { class: 'panel-sub' }, `held jointly: ${d.levels.map(l => fmt(l.level.joint.mean)).join(', ')}%`),
    h('div', { class: 'dv' }, d.levels.map(({ count, level }) => {
      const v = level.division, total = parts.reduce((s, [key]) => s + v[key], 0) || 1;
      return h('div', { class: 'dv-row' }, h('div', { class: 'dv-name' }, String(count)),
        h('div', { class: 'dv-bar', role: 'img', 'aria-label': `${count} ${d.added}: ${d.added} agents ${fmt(v[d.added])}%, ${d.group} agents ${fmt(v[d.group])}%, held jointly ${fmt(v.joint)}%` },
          parts.filter(([key]) => v[key] > 0.05).map(([key, cls]) => h('span', { class: `part ${cls}`, style: { width: `${100 * v[key] / total}%` },
            title: `${key === 'joint' ? 'Held jointly' : `${key} agents`}: ${fmt(v[key], 1)}% of the loom` }, v[key] / total > 0.16 ? `${fmt(v[key])}%` : ''))));
    })),
    h('div', { class: 'legend' }, [['part-second', `${d.added} agents`], ['part-first', `${d.group} agents`], ['part-joint', 'held jointly']].map(([cls, name]) => h('span', { class: 'legend-item' }, h('span', { class: `dv-key ${cls}` }), name))),
    h('div', { class: 'panel-x' }, `rows: ${d.added} agents of five`));
}

/** What was found, each sentence written from the numbers. */
function findings(by) {
  const out = [], pct = (x, digits = 0) => `${fmt(x, digits)}%`;
  const one = d => { const c = row(d.step.changed.rows, 'share'), k = row(d.step.kept[d.group].rows, 'share'); return { c, k, n: d.step.matches }; };
  const lead = by.jevBlunt ?? by.gptBlunt ?? by.gptGreedy;
  if (by.jevBlunt) {
    const d = by.jevBlunt, t = d.none.level.types[d.group], { c, k, n } = one(d), claims = row(d.step.changed.rows, 'claims');
    out.push(['Five calm agents averaged their starting share.', `${pct(t.share.mean, 1)} each (Jev), with ${fmt(t.claims.mean, 1)} claims per agent per match, over ${d.none.level.matches} matches.`]);
    out.push([`The changed seat averaged ${fmt(c.to)}% as a blunt agent.`, `It held ${pct(c.from, 1)} as a calm agent and ${pct(c.to, 1)} as a blunt one `
      + `(${ci(c.difference)} points; 95% interval over ${n} match numbers), making ${fmt(claims.to, 1)} claims per match. The four left calm averaged ${pct(k.to, 1)} each against ${pct(k.from, 1)} (${ci(k.difference)}).`]);
  }
  if (by.jevRude) { const { c, k } = one(by.jevRude); out.push([`It averaged ${fmt(c.to)}% as a rude agent.`, `${pct(c.to, 1)} against ${pct(c.from, 1)} (${ci(c.difference)}); the four calm agents averaged ${pct(k.to, 1)} each.`]); }
  const gpt = [by.gptBlunt, by.gptRude, by.gptGreedy].filter(Boolean);
  if (gpt.length) {
    out.push(['The GPT comparisons also had a higher mean share for the changed seat.', `Same match numbers: ${gpt.map(d => { const { c } = one(d); return `one ${d.added} agent among four ${d.group}, ${pct(c.to, 1)} against ${pct(c.from, 1)} (${ci(c.difference)})`; }).join('; ')}.`]);
  }
  if (by.gptGreedy) {
    const d = by.gptGreedy, j = d.step.joint;
    out.push(['With one greedy agent, mean joint holding was lower.', `Five cooperative agents (GPT) ended with ${pct(j.from, 1)} of the loom held jointly by two agents; with one greedy agent ${pct(j.to, 1)} (${ci(j.difference)}), `
      + `with two ${pct(d.levels.find(l => l.count === 2)?.level.joint.mean ?? NaN, 1)}.`]);
  }
  if (lead && lead.levels.length > 3) {
    const a = lead.levels.map(l => l.level.types[lead.added]?.share).filter(Boolean), all = lead.levels.find(l => l.count === 5);
    out.push(['In these runs the mean share of an added-type agent fell as their number rose.', `${short(lead.model)}, ${lead.added}: ${a.map(s => fmt(s.mean)).join(', ')}% each with one to five of them`
      + `${all ? `. Five ${lead.added} agents did not end equal: the largest share averaged ${pct(all.level.largest.mean)}.` : '.'}`]);
  }
  return out;
}

function page(sets) {
  const find = (model, group, added) => { const s = sets.find(x => model.test(String(x.model)) && x.types[0] === group && x.types[1] === added); return s ? read(s) : null; };
  const by = { jevBlunt: find(/^jev/, 'calm', 'blunt'), jevRude: find(/^jev/, 'calm', 'rude'), gptBlunt: find(/^openai-decisions:/, 'calm', 'blunt'),
    gptRude: find(/^openai-decisions:/, 'calm', 'rude'), gptGreedy: find(/^openai-decisions:/, 'cooperative', 'greedy') };
  const all = Object.values(by).filter(Boolean);
  if (!all.length) return [topbar(null), h('h1', null, 'Group composition'), h('p', { class: 'lede' }, 'No run of a mixed group has been made yet.')];
  const swept = all.filter(d => d.levels.length > 3), top = 60;
  const to = all.map(d => row(d.step.changed.rows, 'share').to), from = all.map(d => row(d.step.changed.rows, 'share').from);
  // The sentences the types are told, as seat 0 hears them.
  const said = new Map();
  for (const d of all) for (const type of d.set.types) {
    const m = d.levels.flatMap(l => l.run.matches).find(x => seatTypes(x).includes(type));
    if (m && !said.has(type)) said.set(type, sentenceOf(0, m.seats[seatTypes(m).indexOf(type)].personality, 'personality'));
  }
  const legend = h('div', { class: 'legend' },
    h('span', { class: 'legend-item' }, svg('svg', { width: 26, height: 12, 'aria-hidden': 'true' }, svg('line', { x1: 1, x2: 25, y1: 6, y2: 6, stroke: INK, 'stroke-width': 2 }), svg('circle', { cx: 13, cy: 6, r: 4, fill: INK })), 'the agent whose sentence was changed'),
    h('span', { class: 'legend-item' }, svg('svg', { width: 26, height: 12, 'aria-hidden': 'true' }, svg('line', { x1: 1, x2: 25, y1: 6, y2: 6, stroke: GREY, 'stroke-width': 2, 'stroke-dasharray': '5 4' }), svg('circle', { cx: 13, cy: 6, r: 3.5, fill: 'var(--surface)', stroke: GREY, 'stroke-width': 2 })), 'an agent left with the group\'s sentence (mean)'));
  return [
    topbar(null),
    h('header', { class: 'brief-head' },
      h('div', { class: 'kicker' }, 'LoomBench brief · group composition · 12 October 2026'),
      h('h1', null, 'Agents of another disposition in a group of five alike'),
      h('p', { class: 'lede' }, `Five agents share a loom of 100 warps, 20 each at the start, and act for 26 rounds. All five are told the same one-sentence disposition; then one of them is told another. `
        + `Across ${all.length} such comparisons, the seat that was changed averaged ${fmt(Math.min(...to), 1)}% to ${fmt(Math.max(...to), 1)}% of the loom, against ${fmt(Math.min(...from), 1)}% to ${fmt(Math.max(...from), 1)}% for that seat under the group's disposition. `
        + `Each comparison is ${Math.min(...all.map(d => d.step.matches))} paired match numbers, and each run was executed once.`),
      h('div', { class: 'said' }, [...said].map(([type, text]) => h('span', { class: 'said-item' }, h('b', null, type), ` “${text}”`)))),

    h('section', null,
      h('h2', null, h('span', { class: 'fig' }, 'Figure 1'), 'One match as agents of the second type are added'),
      h('p', { class: 'cap' }, 'The same seed, palette, starting designs and seating in all six pictures of a row; only the sentences differ. Each colour is one agent\'s share, hatching is a design taken from another agent, '
        + 'and bands of two colours are ground held jointly. An outlined square is an agent of the added type; where one to four agents are of that type, the figures beneath are their final shares. '
        + 'The match shown is the one closest to the mean result for one added agent. ' + MODELS),
      h('div', { class: 'strips' },
        by.jevBlunt ? strip(by.jevBlunt, 'Calm, with blunt agents added.') : null,
        by.gptGreedy ? strip(by.gptGreedy, 'Cooperative, with greedy agents added.') : (by.gptBlunt ? strip(by.gptBlunt, 'Calm, with blunt agents added.') : null))),

    h('section', null,
      h('h2', null, h('span', { class: 'fig' }, 'Figure 2'), 'Every match before and after one seat is changed'),
      h('p', { class: 'cap' }, 'Final share of the loom. A line is one match number, run once with five agents of the group\'s type and once with one seat changed (10 match numbers in each panel); '
        + 'the dots and numbers are means. Under each name is the changed seat\'s paired difference in percentage points, with a Student-t 95% interval over match numbers.'),
      legend,
      h('div', { class: 'panels five' }, all.map(d => slopes(d, top)))),

    h('section', null,
      h('h2', null, h('span', { class: 'fig' }, 'Figure 3'), 'Final share of one agent as more are of the second type'),
      h('p', { class: 'cap' }, 'Means over matches (10 for none and one, 5 for two to five). Solid line: one agent of the added type; dashed line: one agent of the group\'s type; dotted line: the 20% every agent starts with. '
        + 'The last panel shows how the whole loom ends divided.'),
      h('div', { class: 'panels four' }, swept.map(d => sweep(d, top)), by.gptGreedy ? bars(by.gptGreedy) : null)),

    h('section', { class: 'two' },
      h('div', null,
        h('h2', null, 'Findings'),
        h('ol', { class: 'findings' }, findings(by).map(([head, text]) => h('li', null, h('b', null, `${head} `), text)))),
      h('div', { class: 'method' },
        h('h2', null, 'Method and limits'),
        h('p', { class: 'cap' }, 'A match number fixes the seed, the palette, each agent\'s starting design and the seating, so two runs of it differ only in the sentences. '
          + 'The seat given the second type rotates with the match number. No agent has an objective. A share is what an agent holds alone.'),
        h('p', { class: 'cap' }, 'Each composition was run once (10 match numbers for none and one, 5 for two to five): run-to-run variation is unmeasured. '
          + 'Each disposition is one wording. For agents whose sentence stayed the same, a difference is between the two resulting matches and does not isolate a direct response to the changed seat.'),
        h('p', { class: 'cap' }, h('a', { href: 'mix' }, 'Every match and table'), ' · ', h('code', null, 'node analysis/mix.mjs'), ' prints the numbers.'))),
  ];
}

async function start() {
  const runs = (await getJSON('api/runs.json')).filter(r => r.run !== 'play'), indexes = [];
  await Promise.all(runs.map(async r => { try { indexes.push(await getJSON(`runs/${encodeURIComponent(r.run)}/index.json`)); } catch { /* a run that cannot be read is left out */ } }));
  indexes.sort((a, b) => a.run.localeCompare(b.run));
  main.replaceChildren(...page(compositions(indexes)).flat().filter(Boolean));
}

main.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
start().catch(e => main.replaceChildren(topbar(null), h('p', { class: 'lede' }, `The page could not be drawn: ${e.message}.`)));
