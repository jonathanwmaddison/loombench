// The Briefs: the group-composition study on one page each, written for a reader who has not seen the benchmark. One
// page is about dispositions (a group told one disposition, and one agent told another), the other about objectives (a
// group with no persona, and one agent given an objective). Which one a page is, its <body data-brief> says. Every
// number, sentence of results and picture is made from the run records (bench/mix.mjs).
//
// Terms the pages use, each defined on them: the FOCAL AGENT is the one whose prompt is changed; the OTHER AGENTS are
// the four whose prompt is not (reported as their mean); a SEED is one match number, used to pair runs; k is how many
// of the five agents have the second prompt.
import { h, getJSON, fmt, signed, topbar, modelName } from './ui.mjs';
import { NAMES, HUES, goal, sentenceOf } from '../bench/core.mjs';
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
// The claim threshold: the share at which the rules stop offering an agent further claims, in a group of five
// (engine/loom.mjs, `maxShare`). It is not a limit on the final share, which can pass it by what others concede.
const CAP = 46;
// The decision systems, in the order the pages list them.
const SYSTEMS = [
  { kind: 'jev', test: /^jev/, name: 'Jev', filled: true },
  { kind: 'gptd', test: /^openai-decisions:/, name: 'GPT (Decisions)', filled: false },
  { kind: 'gptc', test: /^openai:/, name: 'GPT (chat)', filled: false },
];
const ABOUT = { Jev: 'jev-1.13.0', 'GPT (Decisions)': 'gpt-6-luna, OpenAI\'s Decisions API', 'GPT (chat)': 'gpt-6-luna as a chat model stating a probability for each option' };
const systemOf = model => SYSTEMS.find(s => s.test.test(String(model))) ?? { kind: 'other', name: modelName(model), filled: false };
const ci = d => (Number.isFinite(d.lo) ? `${signed(d.mean, 1)} [${fmt(d.lo, 1)}, ${fmt(d.hi, 1)}]` : signed(d.mean, 1));
const clear = d => Number.isFinite(d.lo) && (d.lo > 0 || d.hi < 0);
const row = (rows, key) => rows.find(r => r.key === key);
const resultOf = (m, seat) => m.results.find(r => r.seat === seat);
const pct = (x, digits = 1) => `${fmt(x, digits)}%`;
const range = (xs, digits = 1) => (Math.max(...xs) - Math.min(...xs) < 0.05 ? pct(xs[0], digits) : `${pct(Math.min(...xs), digits)} to ${pct(Math.max(...xs), digits)}`);

/** A type (as `typeOf` words it: a persona's key, then `>objective`) as a page names it: the disposition, or the objective where there is no persona. */
const labelOf = type => { const [persona, objective] = type.split('>'); return persona === 'no persona' ? (objective ? goal(objective).name : 'no objective') : objective ? `${persona}, ${goal(objective).name}` : persona; };

// The two pages: what is substituted, the sets of runs that belong, and the words that differ.
const BRIEFS = {
  disposition: {
    path: 'brief', other: ['brief-objective', 'the brief on objectives'], word: 'disposition',
    belongs: types => types.every(t => !t.includes('>') && t !== 'no persona'),
    title: 'Substituting one agent\'s disposition in a homogeneous group of five LLM agents',
    question: 'When five agents given the same disposition divide a shared resource, how does the final allocation differ if one of them is given another disposition instead?',
    prompts: 'Each agent\'s prompt holds a one-sentence disposition and no objective. At k = 0 all five agents have disposition A; at k = 1 one of them has disposition B, and so on to k = 5.',
    group: (system, a, b) => `${system}: ${a} group, k agents ${b}`, second: 'the second disposition', among: (b, a) => `${b} among ${a}`,
    main: ['calm', 'blunt'], strips: [['jev', 'calm', 'blunt'], ['gptd', 'cooperative', 'greedy']],
  },
  objective: {
    path: 'brief-objective', other: ['brief', 'the brief on dispositions'], word: 'objective',
    belongs: types => types.every(t => t.startsWith('no persona')),
    title: 'Giving one agent an objective in a group of five LLM agents',
    question: 'When five agents with the same instructions divide a shared resource, how does the final allocation differ if one of them is given an objective: to end with the largest share, or the smallest?',
    prompts: 'No agent\'s prompt holds a disposition. An objective is one sentence stating what the agent is to achieve. At k = 0 all five agents have the group\'s objective (or none); at k = 1 one of them has the second objective, and so on to k = 5.',
    group: (system, a, b) => `${system}: group with ${a}, k agents given ${b}`, second: 'the second objective', among: (b, a) => `${b} given to one agent of a group with ${a}`,
    main: ['no persona', 'no persona>grow'], strips: [['jev', 'no persona', 'no persona>grow'], ['jev', 'no persona>hold', 'no persona>grow']],
  },
};

/** A set as a brief uses it: its levels measured, the step from k = 0 to k = 1, and each seed before and after that step. */
function read(set) {
  const [group, added] = set.types, levels = set.levels.map(l => ({ ...l, level: levelOf(l.run.matches, set.types) }));
  const none = levels.find(l => l.count === 0), one = levels.find(l => l.count === 1);
  if (!none || !one) return null;
  const before = new Map(none.run.matches.map(m => [m.match, m]));
  const pairs = one.run.matches.filter(q => before.has(q.match)).map(q => {
    const p = before.get(q.match), tq = seatTypes(q), seats = [...tq.keys()], focal = seats.filter(s => tq[s] === added), others = seats.filter(s => tq[s] !== added);
    const share = (m, which) => mean(which.map(s => resultOf(m, s).ground));
    // Whether the focal agent met its objective's criterion, where it has one.
    return { seed: q.match, focal: [share(p, focal), share(q, focal)], others: [share(p, others), share(q, others)], met: focal.map(s => resultOf(q, s).reached).find(x => x !== null && x !== undefined) ?? null };
  }).sort((a, b) => a.seed - b.seed);
  const step = shift(none.run.matches, one.run.matches), system = systemOf(set.model), a = labelOf(group), b = labelOf(added);
  return { set, group, added, a, b, model: set.model, system, levels, none, one, pairs, step, contrast: `${a} → ${b}`,
    focal: row(step.changed.rows, 'share'), others: row(step.kept[group].rows, 'share'), capped: pairs.filter(p => p.focal[1] >= CAP - 1).length };
}

/** The agents of a match left to right as seated: a square in each agent's colour, outlined where it has the second prompt. */
function bench(m, added) {
  const order = m.bench ?? m.results.map(r => r.seat), types = seatTypes(m);
  return h('div', { class: 'strip-row', role: 'img', 'aria-label': `Left to right: ${order.map(s => `${NAMES[s]} (${labelOf(types[s])}, ${fmt(resultOf(m, s).ground)}%)`).join(', ')}` },
    order.map(s => h('span', { class: types[s] === added ? 'sq odd' : 'sq', style: { background: HUES[s] }, title: `${NAMES[s]}: ${labelOf(types[s])}, final share ${fmt(resultOf(m, s).ground)}%` })));
}

/** One seed under every composition of a set: the final allocations side by side. */
function strip(d, cfg) {
  // The seed shown: of those run at every k, the one whose focal agent ended closest to the mean at k = 1.
  const everywhere = d.pairs.filter(p => d.levels.every(l => l.run.matches.some(m => m.match === p.seed)));
  const target = d.focal.to, chosen = [...everywhere].sort((x, y) => Math.abs(x.focal[1] - target) - Math.abs(y.focal[1] - target) || x.seed - y.seed)[0];
  if (!chosen) return null;
  return h('div', { class: 'strip' },
    h('h3', null, cfg.group(d.system.name, d.a, d.b), h('span', { class: 'strip-of' }, ` seed ${chosen.seed}`)),
    h('div', { class: `rugs n${d.levels.length}` }, d.levels.map(l => {
      const m = l.run.matches.find(x => x.match === chosen.seed), types = seatTypes(m);
      const who = m.results.filter(r => types[r.seat] === d.added).map(r => fmt(r.ground)).join(', ');
      return h('a', { class: 'rug', href: `match?run=${encodeURIComponent(l.run.run)}&id=${encodeURIComponent(m.id)}`, title: `${l.run.run}, seed ${m.match}` },
        h('img', { src: `runs/${encodeURIComponent(l.run.run)}/thumbs/${encodeURIComponent(m.id)}-flat.png`, width: 232, height: 384, alt: `Final allocation, seed ${m.match}, k = ${l.count}` }),
        bench(m, d.added),
        h('div', { class: 'rug-n' }, `k = ${l.count}`),
        h('div', { class: 'rug-who' }, l.count === 0 ? `all ${d.a}` : l.count === m.seats.length ? `all ${d.b}` : `${who}%`));
    })));
}

/** Every seed at k = 0 and at k = 1: a line a seed, for the focal agent and for the mean of the four other agents. */
function slopes(d, top) {
  const W = 172, H = 120, L = 28, R = 4, T = 8, B = 20, xa = L + 30, xb = W - R - 34, y = v => T + (H - T - B) * (1 - Math.min(top, Math.max(0, v)) / top);
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
    svg('line', { x1: L, x2: W - R, y1: y(CAP), y2: y(CAP), stroke: 'var(--axis)', 'stroke-width': 1, 'stroke-dasharray': '2 3' }, svg('title', null, `${CAP}%, the claim threshold: an agent holding this much is offered no further claims`)),
    d.pairs.map(p => svg('line', { x1: xa, x2: xb, y1: y(p.others[0]), y2: y(p.others[1]), stroke: GREY, 'stroke-width': 1, opacity: 0.5 },
      svg('title', null, `Seed ${p.seed}: the four other agents averaged ${fmt(p.others[0], 1)}% at k = 0 and ${fmt(p.others[1], 1)}% at k = 1`))),
    d.pairs.map(p => svg('line', { x1: xa, x2: xb, y1: y(p.focal[0]), y2: y(p.focal[1]), stroke: INK, 'stroke-width': 1.25, opacity: 0.45 },
      svg('title', null, `Seed ${p.seed}: the focal agent held ${fmt(p.focal[0], 1)}% at k = 0 (${d.a}) and ${fmt(p.focal[1], 1)}% at k = 1 (${d.b})`))),
    [[xa, k.from], [xb, k.to]].map(([x, v]) => svg('circle', { cx: x, cy: y(v), r: 4, fill: 'var(--surface)', stroke: GREY, 'stroke-width': 2 })),
    [[xa, c.from], [xb, c.to]].map(([x, v]) => svg('circle', { cx: x, cy: y(v), r: 4.5, fill: INK, stroke: 'var(--surface)', 'stroke-width': 1.5 })),
    svg('text', { x: xa - 8, y: lc + 4, 'text-anchor': 'end', 'font-size': 11.5, 'font-weight': 600, fill: INK }, fmt(c.from)),
    svg('text', { x: xa - 8, y: lk + 4, 'text-anchor': 'end', 'font-size': 11.5, fill: 'var(--ink-2)' }, fmt(k.from)),
    svg('text', { x: xb + 8, y: rc + 4, 'font-size': 12.5, 'font-weight': 600, fill: INK }, fmt(c.to)),
    svg('text', { x: xb + 8, y: rk + 4, 'font-size': 11.5, fill: 'var(--ink-2)' }, fmt(k.to)),
    svg('text', { x: xa, y: H - 6, 'text-anchor': 'middle', 'font-size': 10.5, fill: 'var(--ink-2)' }, 'k = 0'),
    svg('text', { x: xb, y: H - 6, 'text-anchor': 'middle', 'font-size': 10.5, fill: 'var(--ink-2)' }, 'k = 1')));
}

/** An estimate with its interval on a scale shared down a column: a zero line, the interval as a bar, the mean as a dot. */
function estimate(d, [lo, hi], system) {
  const W = 132, H = 18, x = v => 6 + (W - 12) * (v - lo) / (hi - lo || 1);
  return svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'est', 'aria-hidden': 'true' },
    lo <= 0 && hi >= 0 ? svg('line', { x1: x(0), x2: x(0), y1: 1, y2: H - 1, stroke: 'var(--axis)', 'stroke-width': 1 }) : null,
    Number.isFinite(d.lo) ? svg('line', { x1: x(d.lo), x2: x(d.hi), y1: H / 2, y2: H / 2, stroke: 'var(--ink-2)', 'stroke-width': 2, 'stroke-linecap': 'round' }) : null,
    svg('circle', { cx: x(d.mean), cy: H / 2, r: 4, fill: system.filled ? INK : 'var(--surface)', stroke: INK, 'stroke-width': 2 }));
}

/** The paired comparison of two systems on one contrast (`between`): the second minus the first. */
const versus = (first, d) => between({ none: first.none.run.matches, one: first.one.run.matches }, { none: d.none.run.matches, one: d.one.run.matches });

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
  return h('div', { class: 'scroll bm-wrap' }, h('table', { class: 'bm' },
    h('thead', null, h('tr', null, h('th', null, first.contrast), columns.map(c => h('th', null, c.head)))),
    h('tbody', null,
      ds.map(d => h('tr', null, h('td', { class: 'bm-name' }, d.system.name),
        columns.map((c, i) => { const e = c.of(d); return h('td', { title: `${d.system.name}: ${c.head}: ${fmt(e.mean, 1)}${Number.isFinite(e.lo) ? `, 95% interval ${fmt(e.lo, 1)} to ${fmt(e.hi, 1)}` : ''}` },
          estimate(e, scales[i], d.system), h('span', { class: 'bm-num' }, c.signed ? signed(e.mean, 1) : fmt(e.mean, 1))); }))),
      rest.map(d => { const b = versus(first, d); return h('tr', { class: 'bm-diff' }, h('td', { class: 'bm-name' }, `${d.system.name} − ${first.system.name}`, h('span', { class: 'bm-n' }, ` paired, ${b.matches} seeds`)),
        columns.map(c => { const r = row(b.rows, c.key); return h('td', { class: clear(r.difference) ? 'strong' : null }, ci(r.difference)); })); }))));
}

/** The claim threshold of a group of `n` agents under the rules as they stand, in percent (engine/loom.mjs, `setup`). */
const ruleThreshold = n => 100 * Math.min(0.9, Math.max(CAP / 100, 1 / n + 0.2));

/**
 * The claim threshold raised: for each contrast and group size run both ways under one system, the focal agent's final
 * share at k = 1 under the rules' own threshold and under the raised one, and the paired changes under the raised one.
 * `rows` are [{ base, raised }], each a set as `read` gives it, with its `size` and (for `raised`) its `threshold`.
 */
function thresholdTable(rows) {
  const share = d => d.one.level.types[d.added].share, T = rows[0].raised.threshold;
  return h('div', { class: 'scroll bm-wrap' }, h('table', { class: 'bm' },
    h('thead', null, h('tr', null, ['Contrast and group size', 'Starting share', 'Focal agent\'s final share at the rules\' threshold (k = 1)', `Final share at ${T}% (k = 1)`, `Focal agent: change from k = 0, at ${T}% (pp)`,
      `Each other agent: change from k = 0, at ${T}% (pp)`, `Seeds with the focal agent at ${T - 1}% or more`].map(t => h('th', null, t)))),
    h('tbody', null, rows.map(({ base, raised }) => h('tr', null,
      h('td', { class: 'bm-name' }, `${raised.contrast}, ${raised.size} agents`),
      h('td', null, pct(100 / raised.size, 0)),
      h('td', null, base ? [estimate(share(base), [0, 100], base.system), h('span', { class: 'bm-num' }, pct(share(base).mean)), h('span', { class: 'bm-n inline' }, ` at ${fmt(ruleThreshold(base.size))}%`)] : '–'),
      h('td', null, estimate(share(raised), [0, 100], raised.system), h('span', { class: 'bm-num' }, pct(share(raised).mean))),
      h('td', { class: clear(raised.focal.difference) ? 'strong' : null }, ci(raised.focal.difference)),
      h('td', { class: clear(raised.others.difference) ? 'strong' : null }, ci(raised.others.difference)),
      h('td', null, `${raised.pairs.filter(p => p.focal[1] >= T - 1).length} of ${raised.pairs.length}`))))));
}

/** The comparisons of a page grouped by contrast, in the order they are drawn. */
const byContrast = all => [...new Set(all.map(d => d.contrast))].map(contrast => all.filter(d => d.contrast === contrast));

/** What was found, each sentence written from the numbers. */
function findings(all, cfg, mainSets, sized, lifted) {
  const out = [], groups = byContrast(all), n = Math.min(...all.map(d => d.step.matches));
  const span = ds => (ds.length === 1 ? ci(ds[0]) : `${signed(Math.min(...ds.map(d => d.mean)), 1)} to ${signed(Math.max(...ds.map(d => d.mean)), 1)}`);
  const every = ds => (ds.length === 1 ? '' : ds.every(clear) ? ', every interval excluding zero' : `, ${ds.filter(clear).length} of ${ds.length} intervals excluding zero`);
  out.push(['Change in the focal agent\'s final share from k = 0 to k = 1 (Figure 2).', `Mean paired change in percentage points over ${n} seeds: ${groups.map(g => `${g[0].contrast}, ${span(g.map(d => d.focal.difference))}${g.length > 1 ? ` across ${g.length} systems` : ` (${g[0].system.name})`}${every(g.map(d => d.focal.difference))}`).join('; ')}. `
    + `Per other agent, ${signed(Math.min(...all.map(d => d.others.difference.mean)), 1)} to ${signed(Math.max(...all.map(d => d.others.difference.mean)), 1)}.`]);
  // The share at which no further claims are offered: how often the focal agent ended there.
  const rising = all.filter(d => d.focal.difference.mean > 0);
  if (lifted.length) {
    const T = lifted[0].raised.threshold, pairs = lifted.filter(r => r.base), by = lifted.filter(r => r.raised.contrast === lifted[0].raised.contrast).sort((p, q) => p.raised.size - q.raised.size);
    const share = d => d.one.level.types[d.added].share.mean;
    const five = pairs.filter(r => r.raised.size === 5), counts = rising.map(d => d.capped);
    out.push([`The claim threshold (${mainSets.length > 1 ? 'Figure 4' : 'Figure 3'}).`, `Under the rules' threshold of ${CAP}% the focal agent finished at ${CAP - 1}% or more in ${Math.min(...counts) === Math.max(...counts) ? counts[0] : `${Math.min(...counts)} to ${Math.max(...counts)}`} of ${rising[0].pairs.length} seeds. `
      + `With the threshold at ${T}% (${lifted[0].raised.system.name}, five agents) its mean final share was ${five.map(r => `${pct(share(r.raised))} against ${pct(share(r.base))} (${r.raised.contrast})`).join(' and ')}.`
      + (by.length > 2 ? ` At ${T}%, in these runs, it was ${by.map(r => pct(share(r.raised), 0)).join(', ')} with ${by.map(r => r.raised.size).join(', ').replace(/, (\d)$/, ' and $1')} agents; `
        + `${by.map(r => r.raised.pairs.filter(p => p.focal[1] >= T - 1).length).join(', ')} of ${by[0].raised.pairs.length} seeds were within a point of that threshold, which limits the comparison across sizes.` : '')]);
  } else if (rising.some(d => d.capped)) {
    const counts = rising.map(d => d.capped), where = rising.length > 3 ? `${Math.min(...counts)} to ${Math.max(...counts)} of ${rising[0].pairs.length} seeds across the ${rising.length} comparisons in which its share rose`
      : rising.map(d => `${d.capped} of ${d.pairs.length} seeds (${d.contrast}, ${d.system.name})`).join(', ');
    out.push(['The claim threshold.', `The rules stop offering an agent claims once it holds ${CAP}% of the resource. The focal agent finished at ${CAP - 1}% or more in ${where}. `
      + 'This is a threshold on the moves offered, not a limit on the final share, and these comparisons cannot show how much it affected the results.']);
  }
  const met = all.filter(d => d.pairs.some(p => p.met !== null));
  if (met.length) out.push(['How often the focal agent met its objective\'s criterion.', `${met.map(d => `${d.contrast}, ${d.system.name}: ${d.pairs.filter(p => p.met).length} of ${d.pairs.length} seeds`).join('; ')}. The criterion for Grow is the strictly largest final share, and for Give the strictly smallest.`]);
  if (mainSets.length > 1) {
    const [first, ...rest] = mainSets;
    for (const d of rest.slice(0, 1)) {
      const b = versus(first, d), r = key => row(b.rows, key), same = !clear(r('focal.change').difference), acts = ['focal.claims', 'others.refusals'].filter(key => clear(r(key).difference));
      out.push([`${first.system.name} and ${d.system.name} compared (${first.contrast}; Figure 3).`, `Paired over ${b.matches} seeds, ${d.system.name} minus ${first.system.name}: change in the focal agent's share ${ci(r('focal.change').difference)} pp${same ? ', an interval that includes zero' : ''}; `
        + `claims by the focal agent ${fmt(r('focal.claims').second.mean, 1)} against ${fmt(r('focal.claims').first.mean, 1)} per match (${ci(r('focal.claims').difference)}); `
        + `refusals per other agent ${fmt(r('others.refusals').second.mean, 1)} against ${fmt(r('others.refusals').first.mean, 1)} (${ci(r('others.refusals').difference)}). `
        + `At k = 0, claims per agent per match were ${fmt(r('base.claims').second.mean, 1)} against ${fmt(r('base.claims').first.mean, 1)} (${ci(r('base.claims').difference)})`
        + `${same && acts.length ? '. The change in share was not clearly different; the recorded actions were' : ''}.`]);
    }
  }
  // The other contrasts that two systems share, and what happened to joint ownership where there was any.
  const others = groups.filter(g => g.length > 1 && g[0] !== mainSets[0]).map(g => { const b = versus(g[0], g[1]); return `${g[0].contrast}, ${g[1].system.name} minus ${g[0].system.name}: ${ci(row(b.rows, 'focal.change').difference)} pp in the focal agent's change (${b.matches} seeds)`; });
  const joint = all.filter(d => d.step.joint.from >= 10 && clear(d.step.joint.difference)).map(d => `${d.contrast}, ${d.system.name}: ${pct(d.step.joint.from)} of the resource under joint ownership at k = 0 and ${pct(d.step.joint.to)} at k = 1 (${ci(d.step.joint.difference)})`);
  if (others.length || joint.length) out.push(['Other comparisons.', `${[...others, ...joint].map(t => t[0].toUpperCase() + t.slice(1)).join('. ')}.`]);
  if (sized.length && !lifted.length) {
    const rows = [...sized, mainSets[0]].filter(Boolean).sort((p, q) => p.size - q.size), cap = n => 100 * Math.min(0.9, Math.max(CAP / 100, 1 / n + 0.2));
    out.push([`Group size (${rows[0].system.name}, ${rows[0].contrast}, ${rows[0].step.matches} seeds each).`, `With ${rows.map(d => d.size).join(', ').replace(/, (\d)$/, ' and $1')} agents, each starting with ${rows.map(d => fmt(100 / d.size)).join(', ')}%, `
      + `the focal agent ended with ${rows.map(d => fmt(d.focal.to, 1)).join(', ')}% (claim thresholds ${rows.map(d => fmt(cap(d.size))).join(', ')}%): a change of ${signed(Math.min(...rows.map(d => d.focal.difference.mean)), 1)} to ${signed(Math.max(...rows.map(d => d.focal.difference.mean)), 1)} points. `
      + `Each other agent's change was ${rows.map(d => signed(d.others.difference.mean, 1)).join(', ')} points. The threshold changes with group size, so the two cannot be separated here.`]);
  }
  const swept = mainSets.filter(d => d.levels.length > 3);
  if (swept.length) {
    const last = d => d.levels.at(-1).count, lone = d => d.levels.find(l => l.count === last(d) - 1)?.level.types[d.group]?.share.mean;
    out.push([`Mean share of an agent with ${cfg.second}, by k.`, `${swept.map(d => `${d.system.name}: ${d.levels.map(l => l.level.types[d.added]?.share).filter(Boolean).map(s => fmt(s.mean)).join(', ')}%`).join('; ')} for k = 1 to ${last(swept[0])} (5 seeds from k = 2; rules' threshold).`]);
  }
  return out;
}

function page(sets, cfg) {
  const all = sets.filter(s => (s.size ?? 5) === 5 && !s.threshold && cfg.belongs(s.types)).map(read).filter(Boolean)
    .sort((a, b) => (a.group === cfg.main[0] && a.added === cfg.main[1] ? 0 : 1) - (b.group === cfg.main[0] && b.added === cfg.main[1] ? 0 : 1) || [a.group, a.added].join().localeCompare([b.group, b.added].join())
      || SYSTEMS.findIndex(s => s.kind === a.system.kind) - SYSTEMS.findIndex(s => s.kind === b.system.kind));
  const link = h('p', { class: 'kicker' }, 'LoomBench brief · group composition · ', h('a', { href: cfg.other[0] }, `see also ${cfg.other[1]}`));
  if (!all.length) return [topbar(null), link, h('h1', null, cfg.title), h('p', { class: 'lede' }, 'No run of this kind has been made yet.')];
  const find = ([kind, group, added]) => all.find(d => d.system.kind === kind && d.group === group && d.added === added) ?? null;
  const mainSets = all.filter(d => d.group === cfg.main[0] && d.added === cfg.main[1]), strips = cfg.strips.map(find).filter(Boolean);
  const sized = mainSets.length ? sets.filter(s => (s.size ?? 5) !== 5 && !s.threshold && s.model === mainSets[0].model && s.types[0] === cfg.main[0] && s.types[1] === cfg.main[1]).map(s => { const d = read(s); return d ? { ...d, size: s.size } : null; }).filter(Boolean) : [];
  for (const d of all) d.size = 5;
  // The claim threshold raised, under the first system: each such set beside the set that differs from it in the threshold alone.
  const raisedSets = mainSets.length ? sets.filter(s => s.threshold && s.model === mainSets[0].model && cfg.belongs(s.types)) : [], T = Math.max(0, ...raisedSets.map(s => s.threshold));
  const lifted = raisedSets.filter(s => s.threshold === T).map(s => { const d = read(s); return d ? { ...d, size: s.size ?? 5, threshold: s.threshold } : null; }).filter(Boolean)
    // The set that differs from it in the threshold alone: the same system, types, group size and every other switch.
    .map(raised => ({ raised, base: [...all, ...sized].find(d => d.model === raised.model && d.group === raised.group && d.added === raised.added && d.size === raised.size && d.set.other === raised.set.other) ?? null }))
    .sort((p, q) => (p.raised.added === cfg.main[1] ? 0 : 1) - (q.raised.added === cfg.main[1] ? 0 : 1) || p.raised.size - q.raised.size);
  const top = 60, systems = [...new Set(all.map(d => d.system.name))], seeds = Math.min(...all.map(d => d.step.matches)), groups = byContrast(all);
  // The sentence each prompt is, as the first agent hears it.
  const said = new Map();
  for (const d of all) for (const type of d.set.types) {
    const m = d.levels.flatMap(l => l.run.matches).find(x => seatTypes(x).includes(type));
    if (!m || said.has(type)) continue;
    const seat = m.seats[seatTypes(m).indexOf(type)], text = [sentenceOf(0, seat.personality, 'personality'), sentenceOf(0, seat.goal, 'goal')].filter(Boolean).join(' ');
    said.set(type, text ? `“${text}”` : 'no sentence is added to the prompt');
  }
  const result = groups.map(g => `${cfg.among(g[0].b, g[0].a)}: ${range(g.map(d => d.focal.to))} at k = 1 against ${range(g.map(d => d.focal.from))} at k = 0`).join('; ');
  const versusMain = mainSets.length > 1 ? versus(mainSets[0], mainSets[1]) : null;
  const NAMED = { 'focal.claims': 'the focal agent\'s claims', 'others.refusals': 'the other agents\' refusals', 'base.claims': 'claims per agent at k = 0' };
  const differed = versusMain && !clear(row(versusMain.rows, 'focal.change').difference) ? Object.keys(NAMED).filter(key => clear(row(versusMain.rows, key).difference)).map(key => NAMED[key]) : [];
  return [
    topbar(null),
    h('header', { class: 'brief-head' },
      link,
      h('h1', null, cfg.title),
      h('div', { class: 'summary' },
        h('p', null, h('b', null, 'Question. '), cfg.question),
        h('p', null, h('b', null, 'Design. '), `Five agents each start with 20% of a resource and act for 26 rounds: maintain, claim a neighbour's part, concede, or propose joint ownership; the neighbour accepts, refuses or counters. `
          + `An agent holding ${CAP}% is offered no further claims (the claim threshold). ${cfg.prompts} `
          + `Runs are paired by seed, a match number that gives the same starting set-up; the substituted position rotates over seeds. ${seeds} seeds for k = 0 and 1, 5 for k = 2 to 5; each run executed once. Decision systems: ${systems.map(s => `${s} (${ABOUT[s] ?? ''})`).join('; ')}.`),
        h('p', null, h('b', null, 'Result. '), `Mean final share of the focal agent. ${result[0].toUpperCase()}${result.slice(1)}.`
          + (differed.length ? ` ${mainSets[0].system.name} and ${mainSets[1].system.name} did not clearly differ in the main contrast's change, and did differ in ${differed.join(', ').replace(/, ([^,]*)$/, ' and $1')}.` : '')
          + (lifted.some(r => r.raised.size === 5) ? ` With the claim threshold at ${lifted[0].raised.threshold}% (${lifted[0].raised.system.name}): ${lifted.filter(r => r.raised.size === 5).map(r => `${r.raised.b}, ${pct(r.raised.focal.to)}`).join('; ')}.` : '')))),

    strips.length ? h('section', null,
      h('h2', null, h('span', { class: 'fig' }, 'Figure 1'), `Final allocation in one seed as k agents are given ${cfg.second}`),
      h('div', { class: 'fig1' },
        h('div', null,
          strip(strips[0], cfg),
          h('p', { class: 'cap' }, 'Each picture shows who held which part of the resource in each round (time runs bottom to top), one colour for each agent; hatching marks a design adopted from another agent, two-colour bands a part under joint ownership. '
            + `Squares give the seating, outlined for agents with ${cfg.second}, whose final shares are beneath (k = 1 to 4). The seed shown is the one closest to the mean result at k = 1.`)),
        h('div', { class: 'aside' },
          h('div', { class: 'said' }, h('b', { class: 'aside-head' }, `The ${cfg.word}s, as told to the first agent`), [...said].map(([type, text]) => h('span', { class: 'said-item' }, h('b', null, labelOf(type)), ` ${text}`))),
          h('div', { class: 'terms' },
            h('span', null, h('b', null, 'Focal agent'), `: the agent whose ${cfg.word} is changed.`), h('span', null, h('b', null, 'Other agents'), `: the four whose ${cfg.word} is not, reported as their mean.`),
            h('span', null, h('b', null, 'Share'), ': the percentage of the resource an agent holds alone at the end; a part under joint ownership counts for neither holder.'),
            h('span', null, h('b', null, 'Seed'), ': a match number, used to pair runs.'), h('span', null, h('b', null, 'k'), `: the number of agents with ${cfg.second}.`),
            h('span', null, h('b', null, 'Intervals'), ': Student-t 95% over seeds.'))))) : null,

    h('section', null,
      h('h2', null, h('span', { class: 'fig' }, 'Figure 2'), 'Final share at k = 0 and k = 1, by seed'),
      h('p', { class: 'cap' }, `Each line is one seed (${seeds} in each panel); dots and numbers are means. Δ focal is the mean paired change in the focal agent's share, in percentage points, with its 95% interval. The dotted line is the ${CAP}% claim threshold.`),
      h('div', { class: 'legend' },
        h('span', { class: 'legend-item' }, svg('svg', { width: 26, height: 12, 'aria-hidden': 'true' }, svg('line', { x1: 1, x2: 25, y1: 6, y2: 6, stroke: INK, 'stroke-width': 2 }), svg('circle', { cx: 13, cy: 6, r: 4, fill: INK })), `focal agent (${cfg.word} changed at k = 1)`),
        h('span', { class: 'legend-item' }, svg('svg', { width: 26, height: 12, 'aria-hidden': 'true' }, svg('line', { x1: 1, x2: 25, y1: 6, y2: 6, stroke: GREY, 'stroke-width': 2 }), svg('circle', { cx: 13, cy: 6, r: 3.5, fill: 'var(--surface)', stroke: GREY, 'stroke-width': 2 })), `mean of the four other agents (${cfg.word} unchanged)`)),
      h('div', { class: `panels n${Math.min(6, all.length)}` }, all.slice(0, 6).map(d => slopes(d, top)))),

    mainSets.length > 1 ? h('section', null,
      h('h2', null, h('span', { class: 'fig' }, 'Figure 3'), 'The same contrast under each decision system'),
      h('p', { class: 'cap' }, 'Means with 95% intervals over seeds. Points and intervals share a scale within each column, and the vertical line marks zero. The last rows give paired differences between systems with their intervals; bold where the interval excludes zero.'),
      betweenTable(mainSets)) : null,

    lifted.length ? h('section', null,
      h('h2', null, h('span', { class: 'fig' }, mainSets.length > 1 ? 'Figure 4' : 'Figure 3'), `The claim threshold raised to ${lifted[0].raised.threshold}%${lifted.some(r => r.raised.size !== 5) ? ', by group size' : ''} (${lifted[0].raised.system.name})`),
      h('p', { class: 'cap' }, `Under the rules an agent is offered no further claims at ${CAP}% of the resource with four or five agents, 53.3% with three and 70% with two. The same seeds were run with that threshold at ${lifted[0].raised.threshold}% for every group size. `
        + `Means with 95% intervals over ${lifted[0].raised.pairs.length} seeds, on a scale of 0 to 100%; changes are paired by seed.`),
      thresholdTable(lifted)) : null,

    h('section', null,
      h('h2', null, 'Findings and limitations'),
      h('div', { class: 'flow' },
        h('ol', { class: 'findings' }, findings(all, cfg, mainSets, sized, lifted).map(([head, text]) => h('li', null, h('b', null, `${head} `), text[0].toUpperCase() + text.slice(1)))),
        h('p', { class: 'cap limits' }, h('b', null, 'Limitations. '), `Each run was executed once, so run-to-run variation is unmeasured; intervals describe variation over seeds. Each ${cfg.word} is a single wording. `
          + 'A difference for the other agents is between the two resulting matches: it includes everything that followed from the substitution and does not isolate their direct response to the focal agent. '
          + 'A comparison between systems compares a model together with its interface and the way its probabilities are read, not models alone. The results concern this task and its rules, including the claim threshold, and these systems.'),
        h('p', { class: 'cap' }, h('a', { href: 'mix' }, 'Every match and table'), ' · ', h('code', null, 'node analysis/mix.mjs'), ' prints the numbers.'))),
  ];
}

async function start() {
  const cfg = BRIEFS[document.body.dataset.brief] ?? BRIEFS.disposition;
  const runs = (await getJSON('api/runs.json')).filter(r => r.run !== 'play'), indexes = [];
  await Promise.all(runs.map(async r => { try { indexes.push(await getJSON(`runs/${encodeURIComponent(r.run)}/index.json`)); } catch { /* a run that cannot be read is left out */ } }));
  indexes.sort((a, b) => a.run.localeCompare(b.run));
  main.replaceChildren(...page(compositions(indexes), cfg).flat().filter(Boolean));
}

main.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
start().catch(e => main.replaceChildren(topbar(null), h('p', { class: 'lede' }, `The page could not be drawn: ${e.message}.`)));
