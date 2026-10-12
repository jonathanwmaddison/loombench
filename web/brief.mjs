// The Brief: the group-composition study on one page, written for a reader who has not seen the benchmark. Every
// number, sentence of results and picture is made from the run records (bench/mix.mjs).
//
// Terms the page uses, each defined on it: the FOCAL AGENT is the one whose disposition is substituted; the OTHER
// AGENTS are the four whose disposition is unchanged (reported as their mean); a SEED is one match number, which fixes
// everything but the dispositions; k is how many of the five agents have the second disposition.
import { h, getJSON, fmt, signed, topbar, modelName } from './ui.mjs';
import { NAMES, HUES, sentenceOf } from '../bench/core.mjs';
import { compositions, levelOf, shift, between, seatTypes } from '../bench/mix.mjs';
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
// The decision systems, in the order the page lists them, each with how its line is drawn where systems share a plot.
const SYSTEMS = [
  { kind: 'jev', test: /^jev/, name: 'Jev', dash: null, filled: true },
  { kind: 'gptd', test: /^openai-decisions:/, name: 'GPT (Decisions)', dash: '6 4', filled: false },
  { kind: 'gptc', test: /^openai:/, name: 'GPT (chat)', dash: '1.5 4', filled: false },
];
const systemOf = model => SYSTEMS.find(s => s.test.test(String(model))) ?? { kind: 'other', name: modelName(model), dash: '3 3', filled: false };
const ci = d => (Number.isFinite(d.lo) ? `${signed(d.mean, 1)} [${fmt(d.lo, 1)}, ${fmt(d.hi, 1)}]` : signed(d.mean, 1));
const clear = d => Number.isFinite(d.lo) && (d.lo > 0 || d.hi < 0);
const row = (rows, key) => rows.find(r => r.key === key);
const shareOf = (m, seat) => m.results.find(r => r.seat === seat).ground;
const pct = (x, digits = 1) => `${fmt(x, digits)}%`;

/** A set as the brief uses it: its levels measured, the step from k = 0 to k = 1, and each seed before and after that step. */
function read(set) {
  const [group, added] = set.types, levels = set.levels.map(l => ({ ...l, level: levelOf(l.run.matches, set.types) }));
  const none = levels.find(l => l.count === 0), one = levels.find(l => l.count === 1);
  if (!none || !one) return null;
  const before = new Map(none.run.matches.map(m => [m.match, m])), seats = [0, 1, 2, 3, 4];
  const pairs = one.run.matches.filter(q => before.has(q.match)).map(q => {
    const p = before.get(q.match), tq = seatTypes(q), focal = seats.filter(s => tq[s] === added), others = seats.filter(s => tq[s] !== added);
    return { seed: q.match, focal: [mean(focal.map(s => shareOf(p, s))), mean(focal.map(s => shareOf(q, s)))], others: [mean(others.map(s => shareOf(p, s))), mean(others.map(s => shareOf(q, s)))] };
  }).sort((a, b) => a.seed - b.seed);
  const step = shift(none.run.matches, one.run.matches), system = systemOf(set.model);
  return { set, group, added, model: set.model, system, levels, none, one, pairs, step, contrast: `${group} → ${added}`,
    focal: row(step.changed.rows, 'share'), others: row(step.kept[group].rows, 'share') };
}

/** The five agents of a match left to right as seated: a square in each agent's colour, outlined where it has the second disposition. */
function bench(m, added) {
  const order = m.bench ?? m.results.map(r => r.seat), types = seatTypes(m);
  return h('div', { class: 'strip-row', role: 'img', 'aria-label': `Left to right: ${order.map(s => `${NAMES[s]} (${types[s]}, ${fmt(shareOf(m, s))}%)`).join(', ')}` },
    order.map(s => h('span', { class: types[s] === added ? 'sq odd' : 'sq', style: { background: HUES[s] }, title: `${NAMES[s]}: ${types[s]}, final share ${fmt(shareOf(m, s))}%` })));
}

/** One seed under every composition of a set: the final allocations side by side. */
function strip(d) {
  // The seed shown: of those run at every k, the one whose focal agent ended closest to the mean at k = 1.
  const everywhere = d.pairs.filter(p => d.levels.every(l => l.run.matches.some(m => m.match === p.seed)));
  const target = d.focal.to, chosen = [...everywhere].sort((a, b) => Math.abs(a.focal[1] - target) - Math.abs(b.focal[1] - target) || a.seed - b.seed)[0];
  if (!chosen) return null;
  return h('div', { class: 'strip' },
    h('h3', null, `${d.system.name}: ${d.group} group, k agents ${d.added}`, h('span', { class: 'strip-of' }, ` seed ${chosen.seed}`)),
    h('div', { class: 'rugs' }, d.levels.map(l => {
      const m = l.run.matches.find(x => x.match === chosen.seed), types = seatTypes(m);
      const who = m.results.filter(r => types[r.seat] === d.added).map(r => fmt(r.ground)).join(', ');
      return h('a', { class: 'rug', href: `match?run=${encodeURIComponent(l.run.run)}&id=${encodeURIComponent(m.id)}`, title: `${l.run.run}, seed ${m.match}` },
        h('img', { src: `runs/${encodeURIComponent(l.run.run)}/thumbs/${encodeURIComponent(m.id)}-flat.png`, width: 232, height: 384, alt: `Final allocation, seed ${m.match}, ${l.count} ${d.added}` }),
        bench(m, d.added),
        h('div', { class: 'rug-n' }, `k = ${l.count}`),
        h('div', { class: 'rug-who' }, l.count === 0 ? `all ${d.group}` : l.count === 5 ? `all ${d.added}` : `${who}%`));
    })));
}

/** Every seed at k = 0 and at k = 1: a line a seed, for the focal agent and for the mean of the four other agents. */
function slopes(d, top) {
  const W = 172, H = 140, L = 28, R = 4, T = 8, B = 22, xa = L + 30, xb = W - R - 34, y = v => T + (H - T - B) * (1 - Math.min(top, Math.max(0, v)) / top);
  const c = d.focal, k = d.others;
  // The two numbers at each side are set apart so that neither sits on the other.
  const apart = (p, q) => (Math.abs(p - q) < 13 ? (p <= q ? [q - 13, q] : [p, p - 13]) : [p, q]);
  const [lc, lk] = apart(y(c.from), y(k.from)), [rc, rk] = apart(y(c.to), y(k.to));
  return h('div', { class: 'panel' },
    h('div', { class: 'panel-name' }, d.contrast),
    h('div', { class: 'panel-sub' }, d.system.name),
    h('div', { class: 'panel-sub' }, `Δ focal ${ci(c.difference)}`),
    svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', class: 'plot',
      'aria-label': `${d.system.name}, ${d.contrast}: the focal agent's final share went from ${fmt(c.from, 1)}% to ${fmt(c.to, 1)}% on average, the four other agents' from ${fmt(k.from, 1)}% to ${fmt(k.to, 1)}%, over ${d.step.matches} seeds` },
    [0, 20, 40, 60].filter(v => v <= top).map(v => [svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'var(--hairline)', 'stroke-width': 1 }),
      svg('text', { x: L - 5, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 10.5, fill: 'var(--ink-2)' }, `${v}%`)]),
    d.pairs.map(p => svg('line', { x1: xa, x2: xb, y1: y(p.others[0]), y2: y(p.others[1]), stroke: GREY, 'stroke-width': 1, opacity: 0.5 },
      svg('title', null, `Seed ${p.seed}: the four other agents averaged ${fmt(p.others[0], 1)}% at k = 0 and ${fmt(p.others[1], 1)}% at k = 1`))),
    d.pairs.map(p => svg('line', { x1: xa, x2: xb, y1: y(p.focal[0]), y2: y(p.focal[1]), stroke: INK, 'stroke-width': 1.25, opacity: 0.45 },
      svg('title', null, `Seed ${p.seed}: the focal agent held ${fmt(p.focal[0], 1)}% as ${d.group} and ${fmt(p.focal[1], 1)}% as ${d.added}`))),
    [[xa, k.from], [xb, k.to]].map(([x, v]) => svg('circle', { cx: x, cy: y(v), r: 4, fill: 'var(--surface)', stroke: GREY, 'stroke-width': 2 })),
    [[xa, c.from], [xb, c.to]].map(([x, v]) => svg('circle', { cx: x, cy: y(v), r: 4.5, fill: INK, stroke: 'var(--surface)', 'stroke-width': 1.5 })),
    svg('text', { x: xa - 8, y: lc + 4, 'text-anchor': 'end', 'font-size': 11.5, 'font-weight': 600, fill: INK }, fmt(c.from)),
    svg('text', { x: xa - 8, y: lk + 4, 'text-anchor': 'end', 'font-size': 11.5, fill: 'var(--ink-2)' }, fmt(k.from)),
    svg('text', { x: xb + 8, y: rc + 4, 'font-size': 12.5, 'font-weight': 600, fill: INK }, fmt(c.to)),
    svg('text', { x: xb + 8, y: rk + 4, 'font-size': 11.5, fill: 'var(--ink-2)' }, fmt(k.to)),
    svg('text', { x: xa, y: H - 7, 'text-anchor': 'middle', 'font-size': 10.5, fill: 'var(--ink-2)' }, 'k = 0'),
    svg('text', { x: xb, y: H - 7, 'text-anchor': 'middle', 'font-size': 10.5, fill: 'var(--ink-2)' }, 'k = 1')));
}

/** An estimate with its interval on a scale shared down a column: a zero line, the interval as a bar, the mean as a dot. */
function estimate(d, [lo, hi], system) {
  const W = 132, H = 18, x = v => 6 + (W - 12) * (v - lo) / (hi - lo || 1);
  return svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'est', 'aria-hidden': 'true' },
    lo <= 0 && hi >= 0 ? svg('line', { x1: x(0), x2: x(0), y1: 1, y2: H - 1, stroke: 'var(--axis)', 'stroke-width': 1 }) : null,
    Number.isFinite(d.lo) ? svg('line', { x1: x(d.lo), x2: x(d.hi), y1: H / 2, y2: H / 2, stroke: 'var(--ink-2)', 'stroke-width': 2, 'stroke-linecap': 'round' }) : null,
    svg('circle', { cx: x(d.mean), cy: H / 2, r: 4, fill: system.filled ? INK : 'var(--surface)', stroke: INK, 'stroke-width': 2 }));
}

/** One contrast under each decision system on the same seeds: what was measured, system by system, then each system against the first, paired by seed. */
function betweenTable(ds) {
  const [first, ...rest] = ds, group = first.group, added = first.added;
  const columns = [
    { head: 'Focal agent: change in final share (pp)', key: 'focal.change', signed: true, of: d => d.focal.difference },
    { head: 'Other agents: change in final share (pp)', key: 'others.change', signed: true, of: d => d.others.difference },
    { head: 'Focal agent: claims per match, k = 1', key: 'focal.claims', of: d => d.one.level.types[added].claims },
    { head: 'Other agents: refusals per agent per match, k = 1', key: 'others.refusals', of: d => d.one.level.types[group].refusals },
    { head: 'All agents: claims per agent per match, k = 0', key: 'base.claims', of: d => d.none.level.types[group].claims },
    { head: 'Resource under joint ownership, k = 0 (%)', key: 'base.joint', of: d => d.none.level.joint },
  ];
  // Each column's scale: wide enough for every system's interval, and for zero.
  const scale = col => { const vs = ds.flatMap(d => { const e = col.of(d); return [e.mean, e.lo, e.hi].filter(Number.isFinite); }), lo = Math.min(0, ...vs), hi = Math.max(0, ...vs), pad = (hi - lo || 1) * 0.06; return [lo - pad, hi + pad]; };
  const scales = columns.map(scale);
  const paired = rest.map(d => ({ d, b: between({ none: first.none.run.matches, one: first.one.run.matches }, { none: d.none.run.matches, one: d.one.run.matches }) }));
  return h('div', { class: 'scroll bm-wrap' }, h('table', { class: 'bm' },
    h('thead', null, h('tr', null, h('th', null, `${group} → ${added}`), columns.map(c => h('th', null, c.head)))),
    h('tbody', null,
      ds.map(d => h('tr', null, h('td', { class: 'bm-name' }, d.system.name),
        columns.map((c, i) => { const e = c.of(d); return h('td', { title: `${d.system.name}: ${c.head}: ${fmt(e.mean, 1)}${Number.isFinite(e.lo) ? `, 95% interval ${fmt(e.lo, 1)} to ${fmt(e.hi, 1)}` : ''}` },
          estimate(e, scales[i], d.system), h('span', { class: 'bm-num' }, c.signed ? signed(e.mean, 1) : fmt(e.mean, 1))); }))),
      paired.map(({ d, b }) => h('tr', { class: 'bm-diff' }, h('td', { class: 'bm-name' }, `${d.system.name} − ${first.system.name}`, h('span', { class: 'bm-n' }, ` paired, ${b.matches} seeds`)),
        columns.map(c => { const r = row(b.rows, c.key); return h('td', { class: clear(r.difference) ? 'strong' : null }, ci(r.difference)); }))))));
}

/** What was found, each sentence written from the numbers. */
function findings(all, find) {
  const out = [], jb = find('jev', 'calm', 'blunt'), gb = find('gptd', 'calm', 'blunt'), cb = find('gptc', 'calm', 'blunt'), jr = find('jev', 'calm', 'rude'), gr = find('gptd', 'calm', 'rude'), gg = find('gptd', 'cooperative', 'greedy');
  const span = ds => `${signed(Math.min(...ds.map(d => d.mean)), 1)} to ${signed(Math.max(...ds.map(d => d.mean)), 1)}`, n = Math.min(...all.map(d => d.step.matches));
  const every = ds => (ds.every(clear) ? 'every 95% interval excludes zero' : `${ds.filter(clear).length} of ${ds.length} 95% intervals exclude zero`);
  out.push(['The focal agent\'s mean final share was higher at k = 1 in every comparison, and the other agents\' lower.', `Mean paired change ${span(all.map(d => d.focal.difference))} percentage points for the focal agent `
    + `and ${span(all.map(d => d.others.difference))} per other agent, across the ${all.length} comparisons (${n} seeds each; ${every([...all.map(d => d.focal.difference), ...all.map(d => d.others.difference)])}; Figure 2).`]);
  if (jb && gb) {
    const b = between({ none: jb.none.run.matches, one: jb.one.run.matches }, { none: gb.none.run.matches, one: gb.one.run.matches }), r = key => row(b.rows, key);
    out.push(['The paired change in the focal agent\'s share was not clearly different between Jev and GPT (Decisions); the focal agent\'s claims and the other agents\' refusals were (calm → blunt; Figure 3).', `Paired over ${b.matches} seeds, GPT (Decisions) minus Jev: change in the focal agent's share ${ci(r('focal.change').difference)} pp; `
      + `claims by the focal agent ${fmt(r('focal.claims').second.mean, 1)} against ${fmt(r('focal.claims').first.mean, 1)} per match (${ci(r('focal.claims').difference)}); `
      + `refusals per other agent ${fmt(r('others.refusals').second.mean, 1)} against ${fmt(r('others.refusals').first.mean, 1)} (${ci(r('others.refusals').difference)}).`
      + (cb ? ` GPT (chat): change in the focal agent's share ${ci(cb.focal.difference)} pp.` : '')]);
    out.push(['Homogeneous calm groups differed between systems.', `At k = 0, Jev agents made ${fmt(r('base.claims').first.mean, 1)} claims per agent per match and averaged ${pct(jb.none.level.types.calm.share.mean)} each; `
      + `GPT (Decisions) agents made ${fmt(r('base.claims').second.mean, 1)} (${ci(r('base.claims').difference)}), with ${pct(r('base.joint').second.mean)} of the resource under joint ownership.`]);
  }
  if (jr && gr) {
    const b = between({ none: jr.none.run.matches, one: jr.one.run.matches }, { none: gr.none.run.matches, one: gr.one.run.matches });
    out.push(['Other disposition comparisons.', `Calm → rude: the change in the focal agent's share was smaller under GPT (Decisions) than under Jev (${ci(row(b.rows, 'focal.change').difference)} pp, ${b.matches} seeds).`
      + (gg ? ` Cooperative → greedy, GPT (Decisions): ${pct(gg.step.joint.from)} of the resource was under joint ownership at k = 0 and ${pct(gg.step.joint.to)} at k = 1 (${ci(gg.step.joint.difference)}).` : '')]);
  }
  const swept = [jb, gb].filter(d => d && d.levels.length > 3);
  if (swept.length) {
    out.push(['Mean share per substituted agent was lower at larger k.', `${swept.map(d => `${d.system.name}, blunt: ${d.levels.map(l => l.level.types.blunt?.share).filter(Boolean).map(s => fmt(s.mean)).join(', ')}%`).join('; ')} for k = 1 to 5 (5 seeds from k = 2). `
      + `At k = 4 the one remaining calm agent held ${swept.map(d => `${pct(d.levels.find(l => l.count === 4)?.level.types.calm?.share.mean ?? NaN)} (${d.system.name})`).join(' and ')}.`]);
  }
  return out;
}

function page(sets) {
  const all = sets.map(read).filter(Boolean).sort((a, b) => [a.group, a.added].join().localeCompare([b.group, b.added].join()) || SYSTEMS.findIndex(s => s.kind === a.system.kind) - SYSTEMS.findIndex(s => s.kind === b.system.kind));
  if (!all.length) return [topbar(null), h('h1', null, 'Group composition'), h('p', { class: 'lede' }, 'No run of a mixed group has been made yet.')];
  const find = (kind, group, added) => all.find(d => d.system.kind === kind && d.group === group && d.added === added) ?? null;
  const blunt = all.filter(d => d.group === 'calm' && d.added === 'blunt'), lead = find('jev', 'calm', 'blunt') ?? all[0], second = find('gptd', 'cooperative', 'greedy') ?? all.find(d => d !== lead && d.levels.length > 3);
  const top = 60, to = all.map(d => d.focal.to), from = all.map(d => d.focal.from), systems = [...new Set(all.map(d => d.system.name))];
  // The sentence each disposition is, as the first agent hears it.
  const said = new Map();
  for (const d of all) for (const type of d.set.types) {
    const m = d.levels.flatMap(l => l.run.matches).find(x => seatTypes(x).includes(type));
    if (m && !said.has(type)) said.set(type, sentenceOf(0, m.seats[seatTypes(m).indexOf(type)].personality, 'personality'));
  }
  const seeds = Math.min(...all.map(d => d.step.matches));
  return [
    topbar(null),
    h('header', { class: 'brief-head' },
      h('div', { class: 'kicker' }, 'LoomBench brief · group composition · 12 October 2026'),
      h('h1', null, 'Substituting one agent\'s disposition in a homogeneous group of five LLM agents'),
      h('div', { class: 'summary' },
        h('p', null, h('b', null, 'Question. '), 'When five agents given the same disposition divide a shared resource, how does the final allocation differ if one of them is given another disposition instead?'),
        h('p', null, h('b', null, 'Design. '), `Five agents each start with 20% of a resource and act for 26 rounds: maintain, claim a neighbour's part, concede, or propose joint ownership; the neighbour accepts, refuses or counters. `
          + `Each agent's prompt holds a one-sentence disposition and no objective. At k = 0 all five agents have disposition A; at k = 1 one of them has disposition B, and so on to k = 5. `
          + `Runs are paired by seed: a match number that gives the same starting set-up (seating, starting designs and random draws). The substituted position rotates over seeds. ${seeds} seeds for k = 0 and 1, 5 for k = 2 to 5; each run executed once. Decision systems: ${systems.join(', ')}.`),
        h('p', null, h('b', null, 'Result. '), `In ${all.length} comparisons the focal agent's mean final share was ${pct(Math.min(...to))} to ${pct(Math.max(...to))} at k = 1 against ${pct(Math.min(...from))} to ${pct(Math.max(...from))} at k = 0, `
          + 'and the other agents\' mean share was lower. Systems whose change in the focal agent\'s share was not clearly different still differed in the claims and refusals recorded.')),
      h('div', { class: 'terms' },
        h('span', null, h('b', null, 'Focal agent'), ': the agent whose disposition is substituted.'), h('span', null, h('b', null, 'Other agents'), ': the four whose disposition is unchanged, reported as their mean.'),
        h('span', null, h('b', null, 'Share'), ': the percentage of the resource an agent holds alone at the end; a part under joint ownership counts for neither holder.'),
        h('span', null, h('b', null, 'Seed'), ': a match number, used to pair runs.'), h('span', null, h('b', null, 'k'), ': the number of agents with the second disposition.'),
        h('span', null, h('b', null, 'Intervals'), ': Student-t 95% over seeds.'),
        h('span', null, h('b', null, 'Systems'), ': Jev is jev-1.13.0; GPT (Decisions) is gpt-6-luna through OpenAI\'s Decisions API; GPT (chat) is gpt-6-luna as a chat model that states a probability for each option.')),
      h('div', { class: 'said' }, [...said].map(([type, text]) => h('span', { class: 'said-item' }, h('b', null, type), ` “${text}”`)))),

    h('section', null,
      h('h2', null, h('span', { class: 'fig' }, 'Figure 1'), 'Final allocation in one seed as k agents are given the second disposition'),
      h('p', { class: 'cap' }, 'Each picture shows who held which part of the resource in each round (time runs bottom to top), one colour for each agent; hatching marks a design adopted from another agent, two-colour bands a part under joint ownership. '
        + 'Squares give the seating, outlined for agents with the second disposition, whose final shares are beneath (k = 1 to 4). The seed shown is the one closest to the mean result at k = 1.'),
      h('div', { class: 'strips' }, strip(lead), second ? strip(second) : null)),

    h('section', null,
      h('h2', null, h('span', { class: 'fig' }, 'Figure 2'), 'Final share at k = 0 and k = 1, by seed'),
      h('p', { class: 'cap' }, `Each line is one seed (${seeds} in each panel); dots and numbers are means. Δ focal is the mean paired change in the focal agent's share, in percentage points, with its 95% interval.`),
      h('div', { class: 'legend' },
        h('span', { class: 'legend-item' }, svg('svg', { width: 26, height: 12, 'aria-hidden': 'true' }, svg('line', { x1: 1, x2: 25, y1: 6, y2: 6, stroke: INK, 'stroke-width': 2 }), svg('circle', { cx: 13, cy: 6, r: 4, fill: INK })), 'focal agent (disposition substituted at k = 1)'),
        h('span', { class: 'legend-item' }, svg('svg', { width: 26, height: 12, 'aria-hidden': 'true' }, svg('line', { x1: 1, x2: 25, y1: 6, y2: 6, stroke: GREY, 'stroke-width': 2 }), svg('circle', { cx: 13, cy: 6, r: 3.5, fill: 'var(--surface)', stroke: GREY, 'stroke-width': 2 })), 'mean of the four other agents (disposition unchanged)')),
      h('div', { class: `panels n${Math.min(6, all.length)}` }, all.map(d => slopes(d, top)))),

    blunt.length > 1 ? h('section', null,
      h('h2', null, h('span', { class: 'fig' }, 'Figure 3'), 'The same contrast under each decision system'),
      h('p', { class: 'cap' }, 'Means with 95% intervals over seeds. Points and intervals share a scale within each column, and the vertical line marks zero. The last rows give paired differences between systems with their intervals; bold where the interval excludes zero.'),
      betweenTable(blunt)) : null,

    h('section', { class: 'two' },
      h('div', null,
        h('h2', null, 'Findings'),
        h('ol', { class: 'findings' }, findings(all, find).map(([head, text]) => h('li', null, h('b', null, `${head} `), text)))),
      h('div', { class: 'method' },
        h('h2', null, 'Limitations'),
        h('p', { class: 'cap' }, 'Each run was executed once, so run-to-run variation is unmeasured; intervals describe variation over seeds. Each disposition is a single wording. '
          + 'A difference for the other agents is between the two resulting matches: it includes everything that followed from the substitution and does not isolate their direct response to the focal agent. '
          + 'A comparison between systems compares a model together with its interface and the way its probabilities are read, not models alone. The results concern this task and these systems.'),
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
