// The Controls page: the switches of a match, which runs exist under which setting, and each run set against the run it
// differs from in one switch, paired by match design: the numbers, and the woven outputs side by side.
import { h, getJSON, fmt, signed, qs, topbar, seatMark, choseDesigns, switchWords, modelName, tip, PICTURES, FLAT_NOTE } from './ui.mjs';
import { NAMES, personality, goal } from '../bench/core.mjs';
import { compare, differsIn, isBaseline, switchesOf, byDesign } from '../bench/compare.mjs';

const main = document.querySelector('main.page');
const LEDE = 'A result means something only against a control. Each switch below changes one part of how a match is set up and leaves the '
  + 'others as they are: the same match designs (the same seats, assignments and seeds), the same starting area of 20 warps for every agent '
  + 'and the same 26 rounds. A run is then compared with the run that differs from it in that one switch.';

// The switches, as the page explains them: the default, the control setting, what the comparison isolates, and the runner's flag.
const SWITCHES = [
  { key: 'model', name: 'Decision model', standard: 'Jev', control: 'Uniform random; another decision model (OpenAI\'s), sent the same request; or a chat model, given the same words as a chat prompt',
    isolates: 'Against uniform random: whether an outcome needs a model at all. Against another decision model: whether it is particular to Jev, with the request unchanged. '
      + 'Against a chat model: whether it holds for a second decision system; a chat model is prompted and read differently from Jev (one request for each question; the probabilities of its first token, or the chances it states), '
      + 'so that compares two systems, not two models alone.',
    flag: '--model chance | openai-decisions:gpt-6-luna | <provider>:<model>' },
  { key: 'persona', name: 'Personas', standard: 'Dealt: ten trait sentences and none', control: 'Off: no agent is given a trait sentence',
    isolates: 'What the persona adds to or takes from attainment of the objective, with the objectives unchanged.', flag: '--persona off' },
  { key: 'objective', name: 'Objectives', standard: 'Dealt: four objectives and none', control: 'Off: no agent is given an objective',
    isolates: 'What a group does when nobody is instructed. There is no attainment to compare; the baseline scores (each rule applied to agents with no objective) show '
      + 'whether the one uninstructed agent of a default match behaves as a wholly uninstructed group does.', flag: '--objective off' },
  { key: 'agents', name: 'Agents deciding', standard: 'All five', control: 'One (solo): the model decides for one agent, among four scripted neighbours. By default they never act and accept every request; '
      + 'they can instead refuse every request, or act at random',
    isolates: 'With neighbours that accept: what an agent does and attains with no opposition and no initiative from anyone else. The difference from the default run mixes '
      + 'everything the other four agents do (their claims, their refusals, their own changes of share), and the scores remain ranks among five seats. '
      + 'It is not an agent alone on a loom.', flag: '--solo [--neighbours refuse | chance]' },
  { key: 'area', name: 'Areas', standard: 'Equal at the start (20 warps each), then they can change', control: 'Fixed: equal at the start and for the whole match',
    isolates: 'What agents do with designs when share cannot be contested. Grow, Give and Hold cannot be pursued and are not scored.', flag: '--area fixed' },
  { key: 'designs', name: 'Starting designs', standard: 'Assigned: one palette, and a design of its own for each agent', control: 'Chosen: the agents vote on a palette and each chooses its first design (the first rules)',
    isolates: 'Whether giving each agent a starting design, which makes the woven output readable, changed what agents do.', flag: '--designs chosen' },
  { key: 'peers', name: 'Peer communication', standard: 'Off', control: 'On: an agent hears an adjacent agent\'s advocated action before acting',
    isolates: 'The effect of one message on a decision, and on the match as a whole (see the Report).', flag: '--peers' },
];
// The columns of the table of runs: a name, and whether a run's switches (against its model's defaults) put it there.
const KINDS = [
  { key: 'default', name: 'Default' }, { key: 'again', name: 'Second execution' }, { key: 'persona', name: 'Personas off' }, { key: 'objective', name: 'Objectives off' },
  { key: 'agents', name: 'Solo' }, { key: 'area', name: 'Areas fixed' }, { key: 'designs', name: 'Designs chosen' }, { key: 'peers', name: 'Peer communication' },
];
// The measures a comparison lists.
const SHOWN = ['attainment', 'score.grow', 'score.give', 'score.hold', 'score.borrow', 'claims', 'concessions', 'refusals', 'adoptions', 'dispersion'];
// With objectives off there is no attainment: each rule applied to the agents given no objective is compared in its place.
const SHOWN_UNTOLD = ['baseline.grow', 'baseline.give', 'baseline.hold', 'baseline.borrow', 'claims', 'concessions', 'refusals', 'adoptions', 'dispersion'];
const LABEL = {
  attainment: 'Attainment rate (%)', 'score.grow': 'Objective score, Grow', 'score.give': 'Objective score, Give', 'score.hold': 'Objective score, Hold',
  'score.borrow': 'Objective score, Borrow', 'baseline.grow': 'Baseline score, Grow rule', 'baseline.give': 'Baseline score, Give rule', 'baseline.hold': 'Baseline score, Hold rule',
  'baseline.borrow': 'Baseline score, Borrow rule', claims: 'Claims per agent', concessions: 'Concessions per agent', refusals: 'Refusals per agent',
  adoptions: 'Design adoptions per agent', dispersion: 'Dispersion of final shares (pp)',
};
const SCORE_LIKE = new Set(['attainment', 'score.grow', 'score.give', 'score.hold', 'score.borrow', 'baseline.grow', 'baseline.give', 'baseline.hold', 'baseline.borrow']);

const runHref = run => `results?run=${encodeURIComponent(run)}`;
const count = r => `${r.matches} ${switchesOf(r).agents === 'group' ? 'matches' : 'looms'}`;

/** A setting of a switch in words. */
function setting(key, value) {
  if (key === 'model') return modelName(value);
  if (String(value).startsWith('mixed: ')) return String(value).slice(7);
  if (key === 'persona') return value === 'dealt' ? 'dealt' : value === 'off' ? 'off' : `all ${personality(value).name.toLowerCase()}`;
  if (key === 'objective') return value === 'dealt' ? 'dealt' : value === 'off' ? 'off' : value === 'uniform' ? 'one for all' : `all ${goal(value).name}`;
  if (key === 'agents') return { group: 'all five', 'solo-accept': 'one, neighbours accept (solo)', 'solo-refuse': 'one, neighbours refuse (solo)', 'solo-chance': 'one, neighbours by chance (solo)' }[value] ?? value;
  if (key === 'area') return value === 'fixed' ? 'fixed' : 'can change';
  if (key === 'designs') return value === 'chosen' ? 'chosen by the agents' : 'assigned';
  return value ? 'on' : 'off';
}

/** The table of switches. */
function switchTable() {
  return h('div', { class: 'scroll' }, h('table', { class: 'grid switch-table' },
    h('thead', null, h('tr', null, ['Switch', 'Default', 'Control setting', 'What the comparison isolates', 'Flag of tools/run.mjs'].map(t => h('th', null, t)))),
    h('tbody', null, SWITCHES.map(s => h('tr', null,
      h('td', null, s.name), h('td', null, s.standard), h('td', null, s.control), h('td', null, s.isolates), h('td', null, h('code', null, s.flag)))))));
}

/** Which column of the table of runs a run belongs in, given its model's baseline; null when it differs in more than one switch. */
function kindOf(run, base) {
  if (run === base) return 'default';
  const d = differsIn(base, run);
  if (d.length === 0) return 'again';
  if (d.length > 1 || d[0] === 'model') return null;
  const c = switchesOf(run);
  if (d[0] === 'persona' && c.persona !== 'off') return null;
  if (d[0] === 'objective' && c.objective !== 'off') return null;
  // A run with another claim threshold has areas that can change, as the default has: it is not the areas-fixed condition.
  if (d[0] === 'area' && c.area !== 'fixed') return null;
  return d[0];
}

/** The baseline of each model: its default-condition run with the most matches (of two alike, the first by name). A model with none has no baseline. */
function baselines(runs) {
  const out = new Map();
  for (const r of runs.filter(isBaseline)) {
    const best = out.get(r.model);
    if (!best || r.matches > best.matches || (r.matches === best.matches && r.run.localeCompare(best.run) < 0)) out.set(r.model, r);
  }
  return out;
}

/** The table of runs: a row for each model, a column for each condition, each cell the run made under it or a dash. */
function runsTable(runs, bases) {
  const models = [...new Set(runs.map(r => r.model))].sort((a, b) => (a === 'chance') - (b === 'chance') || (bases.get(b)?.matches ?? 0) - (bases.get(a)?.matches ?? 0));
  const placed = new Set();
  const cell = (model, kind) => {
    const base = bases.get(model), mine = runs.filter(r => r.model === model && base && kindOf(r, base) === kind);
    mine.forEach(r => placed.add(r.run));
    return h('td', null, mine.length ? mine.map(r => h('div', null, h('a', { href: runHref(r.run) }, r.run), h('span', { class: 'small muted' }, ` ${count(r)}`))) : h('span', { class: 'muted' }, '–'));
  };
  const table = h('div', { class: 'scroll' }, h('table', { class: 'grid runs-table' },
    h('thead', null, h('tr', null, h('th', null, 'Decision model'), KINDS.map(k => h('th', null, k.name)))),
    h('tbody', null, models.map(model => h('tr', null, h('td', null, modelName(model)), KINDS.map(k => cell(model, k.key)))))));
  const rest = runs.filter(r => !placed.has(r.run));
  return [table, rest.length ? h('p', { class: 'small muted' }, 'Other runs, which differ from their model\'s default in more than one switch or in a uniform assignment: ',
    rest.map((r, i) => [i ? '; ' : '', h('a', { href: runHref(r.run) }, r.run), ` (${[count(r), ...switchWords(r.conditions)].join(', ')})`]), '.') : null];
}

/** A paired difference on an axis centred on zero: the interval as a bar, the mean as a dot. `top` is the axis's half-width. */
function plot(d, top) {
  const at = v => `${50 + 50 * Math.max(-1, Math.min(1, v / top))}%`;
  const has = Number.isFinite(d.lo);
  return h('span', { class: 'ci', role: 'img', 'aria-label': has ? `difference ${signed(d.mean, 1)}, 95% interval ${fmt(d.lo, 1)} to ${fmt(d.hi, 1)}` : `difference ${signed(d.mean, 1)}` },
    h('span', { class: 'ci-zero' }),
    has ? h('span', { class: 'ci-bar', style: { left: at(d.lo), width: `calc(${at(d.hi)} - ${at(d.lo)})` } }) : null,
    h('span', { class: 'ci-dot', style: { left: at(d.mean) } }));
}

/** What one comparison's heading and reading are, from the one switch that differs (or none). */
function titleOf(base, other, differs) {
  if (!differs.length) return { title: 'Nothing changed: a second execution', read: 'The two runs were made alike. Their differences show how far two executions of the same match designs come apart with no switch changed: the scale against which every other comparison on this page should be read.' };
  const key = differs[0], a = switchesOf(base), b = switchesOf(other), info = SWITCHES.find(s => s.key === key);
  // Another claim threshold is carried in the areas setting, and is not the areas-fixed comparison.
  if (key === 'area' && [a.area, b.area].every(v => v !== 'fixed')) {
    const of = v => (/claim threshold (\d+)%/.exec(v)?.[1] ?? '46');
    return { title: `Claim threshold: ${of(a.area)}% → ${of(b.area)}%`, read: 'The share of the loom at which an agent is offered no further claims. It is a threshold on the moves offered, not a limit on the final share.' };
  }
  return { title: `${info.name}: ${setting(key, a[key])} → ${setting(key, b[key])}`, read: info.isolates };
}

/** One comparison as a card: what changed, the two runs, and each measure's two means and paired difference. */
function comparisonCard(base, other, differs) {
  const { title, read } = titleOf(base.run, other.run, differs);
  const fixed = switchesOf(other.run).area === 'fixed' || switchesOf(base.run).area === 'fixed';
  const result = compare(base.index.matches, other.index.matches, { fixed });
  const rows = (differs[0] === 'objective' ? SHOWN_UNTOLD : SHOWN).map(key => result.rows.find(r => r.key === key)).filter(Boolean);
  const solo = switchesOf(other.run).agents !== 'group' || switchesOf(base.run).agents !== 'group';
  const reach = set => Math.max(1, ...rows.filter(r => set(r.key)).flatMap(r => [r.difference.lo, r.difference.hi, r.difference.mean]).filter(Number.isFinite).map(Math.abs));
  const tops = { score: reach(k => SCORE_LIKE.has(k)), count: reach(k => !SCORE_LIKE.has(k)) };
  const line = r => {
    const d = r.difference, words = `${LABEL[r.key]}: ${fmt(r.base, 1)} in ${base.run.run}, ${fmt(r.other, 1)} in ${other.run.run}. Paired difference ${signed(d.mean, 1)}`
      + `${Number.isFinite(d.lo) ? `, 95% interval ${fmt(d.lo, 1)} to ${fmt(d.hi, 1)}` : ''}, over ${d.k} match designs.`;
    return h('tr', { onpointermove: e => tip.show(e, words), onpointerleave: () => tip.hide() },
      h('td', null, LABEL[r.key]), h('td', { class: 'num' }, fmt(r.base, 1)), h('td', { class: 'num' }, fmt(r.other, 1)),
      h('td', { class: 'num' }, signed(d.mean, 1)), h('td', { class: 'num muted' }, Number.isFinite(d.lo) ? `[${fmt(d.lo, 1)}, ${fmt(d.hi, 1)}]` : '–'),
      h('td', { class: 'plot' }, plot(d, SCORE_LIKE.has(r.key) ? tops.score : tops.count)));
  };
  const body = !result.designs.length ? h('p', { class: 'small muted' }, 'The two runs share no match design, so nothing can be paired.')
    : !rows.length ? h('p', { class: 'small muted' }, 'No measure is defined in both runs.')
      : h('div', { class: 'scroll' }, h('table', { class: 'grid compare' },
        h('thead', null, h('tr', null, h('th', null, 'Measure (mean per match design)'), h('th', { class: 'num' }, base.run.run), h('th', { class: 'num' }, other.run.run),
          h('th', { class: 'num' }, 'Difference'), h('th', { class: 'num' }, '95% interval'), h('th', null, 'Difference, centred on zero'))),
        h('tbody', null, rows.map(line))));
  return h('section', { class: 'card comparison' },
    h('h3', null, title),
    h('p', { class: 'small' }, read),
    h('p', { class: 'small muted' }, h('a', { href: runHref(base.run.run) }, base.run.run), ` (${count(base.run)}) against `, h('a', { href: runHref(other.run.run) }, other.run.run),
      ` (${count(other.run)}), paired on ${result.designs.length} match design${result.designs.length === 1 ? '' : 's'}.`,
      fixed ? ' With areas fixed, measures of share are constants and are left out.' : '',
      solo ? ' A solo design is the mean of its five looms, one for each agent; they are not five independent designs.' : ''),
    body);
}

/** The woven outputs of each match design under each of a model's conditions, side by side: a row a design, a column a run. */
function pictures(base, others) {
  const cap = text => text[0].toUpperCase() + text.slice(1);
  const columns = [{ ...base, name: 'Default' }, ...others.map(o => ({ ...o, name: o.differs.length ? cap(switchWords(o.run.conditions ?? {}).join(', ') || 'default') : 'Second execution' }))];
  const every = [...byDesign(base.index.matches).keys()].sort((a, b) => a - b);
  // One round of the balanced deal is eleven designs: that many are shown until the rest are asked for.
  // The flat picture first: across conditions, what differs is who holds what and what was taken from whom.
  let view = 'flat', designs = every.slice(0, 11);
  const suffix = () => PICTURES.find(([key]) => key === view)[2], label = () => PICTURES.find(([key]) => key === view)[1];
  const note = h('p', { class: 'small muted', style: { margin: '8px 0 0' } }, FLAT_NOTE);
  const box = h('div', { class: 'scroll' });
  const thumb = (col, m, small) => h('a', { class: small ? 'pic mini' : 'pic', href: `match?run=${encodeURIComponent(col.run.run)}&id=${encodeURIComponent(m.id)}`,
    title: `${col.run.run}, ${m.id}${m.conditions?.agents === 'solo' ? `: only ${NAMES[m.conditions.solo]} decides` : ''}` },
  h('img', { src: `runs/${encodeURIComponent(col.run.run)}/thumbs/${encodeURIComponent(m.id)}${suffix()}.png`, loading: 'lazy', width: 232, height: 384,
    alt: `${label()}, match ${m.match}, ${col.name}` }),
  small ? h('span', { class: 'mini-who' }, seatMark(m.conditions.solo, false, 12, 1), NAMES[m.conditions.solo]) : null);
  const cell = (col, n) => {
    const found = byDesign(col.index.matches).get(n) ?? [];
    if (!found.length) return h('td', null, h('span', { class: 'muted small' }, 'not run'));
    if (found.length === 1) return h('td', null, thumb(col, found[0], false));
    // Five solo looms of one design, in the order the agents are seated.
    const order = found[0].bench ?? [0, 1, 2, 3, 4];
    return h('td', null, h('div', { class: 'minis' }, order.map(seat => found.find(m => m.conditions?.solo === seat)).filter(Boolean).map(m => thumb(col, m, true))));
  };
  const seatsOf = n => {
    const m = byDesign(base.index.matches).get(n)[0], order = m.bench ?? m.results.map(r => r.seat);
    return order.map(seat => m.results.find(r => r.seat === seat)).map(r => h('div', { class: 'who-line' }, seatMark(r.seat, choseDesigns(m), 12, 1),
      h('span', null, `${r.name}: ${personality(r.personality).name.toLowerCase()} → ${goal(r.goal).name}`)));
  };
  const draw = () => box.replaceChildren(h('table', { class: 'grid pictures' },
    h('thead', null, h('tr', null, h('th', null, 'Match design'), columns.map(c => h('th', null, c.name, h('div', { class: 'small muted' }, c.run.run))))),
    h('tbody', null, designs.map(n => h('tr', null, h('td', null, `Match ${n}`, h('div', { class: 'who-lines' }, seatsOf(n))), columns.map(c => cell(c, n)))))));
  const buttons = PICTURES.map(([key, text]) => h('button', {
    type: 'button', class: key === view ? 'btn' : 'btn quiet', 'aria-pressed': String(key === view), dataset: { view: key },
    onclick: () => {
      view = key;
      for (const b of buttons) { const on = b.dataset.view === key; b.className = on ? 'btn' : 'btn quiet'; b.setAttribute('aria-pressed', String(on)); }
      note.hidden = key !== 'flat';
      draw();
    },
  }, text));
  const more = every.length > designs.length ? h('button', { type: 'button', class: 'btn quiet', onclick: () => { designs = every; more.remove(); draw(); } },
    `Show all ${every.length} match designs`) : null;
  draw();
  return [h('div', { class: 'row', style: { margin: '12px 0 0' } }, buttons), note, box, more];
}

/** The whole page for the chosen baseline. */
function page(runs, bases, indexes, chosen) {
  const base = { run: chosen, index: indexes.get(chosen.run) };
  const all = runs.filter(r => r !== chosen && indexes.has(r.run)).map(r => ({ run: r, index: indexes.get(r.run), differs: differsIn(chosen, r) }));
  // One switch apart, or none: a second execution first, then the switches in the order of the table, a change of model last.
  const rank = o => (o.differs.length ? 1 + SWITCHES.findIndex(s => s.key === o.differs[0]) + (o.differs[0] === 'model' ? 10 : 0) : 0);
  // Another model is compared through its own baseline run only, and a uniform objective is a reference run, not a control.
  const near = all.filter(o => o.differs.length <= 1 && !(o.differs[0] === 'objective' && switchesOf(o.run).objective !== 'off')
    && !(o.differs[0] === 'model' && bases.get(o.run.model) !== o.run)).sort((a, b) => rank(a) - rank(b) || a.run.run.localeCompare(b.run.run));
  const same = near.filter(o => o.differs[0] !== 'model');
  const select = h('select', { 'aria-label': 'Baseline run', onchange: e => { window.location.href = `controls?base=${encodeURIComponent(e.target.value)}`; } },
    [...bases.values()].map(r => h('option', { value: r.run, selected: r === chosen }, `${modelName(r.model)} · ${r.run} · ${count(r)}`)));
  const missing = SWITCHES.filter(s => !['model', 'peers', 'designs'].includes(s.key) && !same.some(o => o.differs[0] === s.key));
  return [
    topbar('controls'),
    h('h1', null, 'Controls'),
    h('p', { class: 'lede' }, LEDE),
    h('h2', null, 'The switches'),
    switchTable(),
    h('p', { class: 'small muted' }, 'The same switches are on the ', h('a', { href: 'play' }, 'Play'), ' page. Every run records the setting of each, and a run folder holds one setting.'),
    h('h2', null, 'Runs under each setting'),
    h('p', { class: 'sub' }, 'Each row is a decision model, each column a condition. A dash is a condition that has not been run for that model.'),
    ...runsTable(runs, bases),
    h('h2', null, 'One switch apart'),
    h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Baseline'), select),
    h('p', { class: 'sub', style: { marginTop: '12px' } }, 'Every run that differs from the baseline in one switch, or in none. Rows are means over the match designs the two runs share; '
      + 'the difference is paired by match design and its interval is Student\'s t over those designs. The intervals are descriptive: scores are bounded ranks among five '
      + 'seats, and each condition was executed once, so an interval does not separate the switch from the variation between two executions. The first comparison, '
      + 'where there is one, shows how large a difference arises with nothing changed. '
      + 'In the plots, the rate and the four scores share one axis and the counts and the dispersion share another.'),
    near.length ? near.map(o => comparisonCard(base, o, o.differs)) : h('p', { class: 'sub' }, 'No other run is one switch away from this baseline.'),
    missing.length ? h('p', { class: 'small muted' }, `Not yet run for ${modelName(chosen.model)}: ${missing.map(s => s.name.toLowerCase()).join(', ')}. `
      + `For example: node tools/run.mjs${chosen.model === 'chance' ? ' --chance' : chosen.model?.includes(':') ? ` --model ${chosen.model}` : ''} ${missing[0].flag} --matches 1-11`) : null,
    h('h2', null, 'The same match designs under each condition'),
    h('p', { class: 'sub' }, `Each row is one match design: the same five agents with the same personas, objectives and seed, listed left to right as seated. `
      + `Each column is a run of ${modelName(chosen.model)}. In a solo column the design is run five times, once for each agent, and the small label names the one the model decides for. Select a picture to open the match.`),
    ...pictures(base, same),
  ];
}

async function start() {
  let runs;
  try { runs = (await getJSON('api/runs.json')).filter(r => r.run !== 'play'); } catch (e) {
    main.replaceChildren(topbar('controls'), h('h1', null, 'Controls'), h('p', { class: 'sub' }, `Could not load the list of runs: ${e.message}.`));
    return;
  }
  const bases = baselines(runs);
  if (!bases.size) {
    main.replaceChildren(topbar('controls'), h('h1', null, 'Controls'), h('p', { class: 'lede' }, LEDE), h('h2', null, 'The switches'), switchTable(),
      h('p', { class: 'sub' }, 'No run has been made at the default settings yet, so there is nothing to compare.'));
    return;
  }
  // The baseline asked for; else the model's baseline with the most runs one switch away from it, then the most matches.
  const near = b => runs.filter(r => r !== b && r.model === b.model && differsIn(b, r).length <= 1).length;
  const chosen = [...bases.values()].find(r => r.run === qs('base'))
    ?? [...bases.values()].filter(r => r.model !== 'chance').sort((a, b) => near(b) - near(a) || b.matches - a.matches)[0] ?? [...bases.values()][0];
  const indexes = new Map();
  await Promise.all(runs.map(async r => { try { indexes.set(r.run, await getJSON(`runs/${encodeURIComponent(r.run)}/index.json`)); } catch { /* a run that cannot be read is left out */ } }));
  main.replaceChildren(...page(runs, bases, indexes, chosen).flat().filter(Boolean));
}

main.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
start().catch(e => main.replaceChildren(topbar('controls'), h('p', { class: 'lede' }, `The page could not be drawn: ${e.message}.`)));
