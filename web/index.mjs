// The Results page: the runs, the protocol, the objectives, final shares by persona and objective, the reference runs, persona against objective, and the matches.
import { h, getJSON, fmt, signed, pct, qs, topbar, startSwatch, mark, track, splitbar, splitLegend, tip, heat } from './ui.mjs';
import { PERSONALITIES, GOALS, SCORED, personality, goal, sentenceOf } from '../bench/core.mjs';
import { rowsOf, table, mean } from '../bench/stats.mjs';

const LEDE = 'Five LLM agents act in one shared environment, a loom. Each is assigned a persona and an objective. '
  + 'The benchmark measures how far each objective is attained, and how much of that depends on the persona.';
const REFERENCE = ['ref-none', 'ref-grow', 'ref-give', 'ref-hold'];
const main = document.querySelector('main.page');
const show = (...nodes) => main.replaceChildren(...nodes);

/**
 * The run to show: ?run=, else the model run with the most matches that is not peers and not uniform (a quiet model run),
 * else the first run that is none of play, chance, peers or uniform, else chance, else null.
 */
function pickRun(runs) {
  const asked = qs('run');
  if (asked) return asked;
  const quiet = runs.filter(r => r.run !== 'play' && r.run !== 'chance' && r.mode !== 'peers' && r.design !== 'uniform');
  if (quiet.length) return quiet.reduce((best, r) => (r.matches > best.matches ? r : best)).run;
  const real = runs.find(r => r.run !== 'play' && r.run !== 'chance' && r.design !== 'uniform');
  if (real) return real.run;
  return runs.some(r => r.run === 'chance') ? 'chance' : null;
}

/** The heading row: the title and a select of runs that goes to ?run= when one is chosen. The select leaves out play and uniform runs. */
function head(runs, chosen) {
  const listed = runs.filter(r => r.run !== 'play' && r.design !== 'uniform');
  const options = listed.map(r => h('option', { value: r.run, selected: r.run === chosen },
    r.mode === 'peers' ? `${r.run} · ${r.matches} matches · peer communication` : `${r.run} · ${r.matches} matches`));
  if (!listed.some(r => r.run === chosen)) {
    const asked = runs.find(r => r.run === chosen);
    options.unshift(h('option', { value: chosen, selected: true },
      asked ? `${chosen} · ${asked.matches} matches` : `${chosen} · not found`));
  }
  const select = h('select', {
    'aria-label': 'Run',
    onchange: e => { window.location.href = `./?run=${encodeURIComponent(e.target.value)}`; },
  }, options);
  return h('div', { class: 'spread head' }, h('h1', null, 'LoomBench'), select);
}

/** The empty state: no kept runs yet, and the two commands that make some. */
function emptyState() {
  return h('div', { class: 'card', style: { marginTop: '24px' } },
    h('h2', null, 'No results yet'),
    h('p', { class: 'sub' }, 'No run is kept yet. A run is a folder of kept matches; make one from the project folder with one of these:'),
    h('pre', { class: 'cmd' }, 'node --env-file=<file with TYPESAFE_API_KEY> tools/run.mjs --matches 1-44 --run jev-1'),
    h('pre', { class: 'cmd' }, 'node tools/run.mjs --chance --matches 1-22'),
    h('p', { class: 'sub', style: { margin: 0 } },
      'The first asks Jev for every choice. The second makes every choice by chance, as a control.'));
}

const spread = xs => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
};

/** The five figures of a reference run: mean counts per agent over every match, and the mean spread of final shares. */
function referenceFigures(index) {
  const results = index.matches.flatMap(m => m.results);
  const avg = pick => fmt(mean(results.map(pick)), 1);
  const dispersion = mean(index.matches.map(m => spread(m.results.map(r => r.ground))));
  return [
    ['claims', avg(r => r.did.took)],
    ['concessions', avg(r => r.did.gave)],
    ['refusals', avg(r => r.did.refused)],
    ['overrides', avg(r => r.did.insisted)],
    ['eliminations', avg(r => r.did.pushedOut)],
    ['dispersion of final shares', `${fmt(dispersion, 1)} pp`],
  ];
}

/** The whole Results page for one run: every section, in the order the plan gives. */
function resultsPage(runs, chosen, index, refs) {
  const rows = rowsOf(index.matches);
  const t = table(rows);
  const seen = new Set(rows.map(r => r.goal));
  const people = PERSONALITIES.filter(p => t.personalities[p.key]);
  const goals = GOALS.filter(g => seen.has(g.key));
  const filter = { personality: '', goal: '', view: 'cloth' };
  const picks = [];

  // Protocol
  const card = (title, text) => h('div', { class: 'card' }, h('h2', null, title), h('p', null, text));
  const how = [
    h('h2', null, 'Protocol'),
    h('div', { class: 'cards' },
      card('Assignment', 'Each agent receives a one-sentence persona. Four of the five also receive a one-sentence objective; '
        + 'the fifth receives none and serves as the baseline.'),
      card('Interaction', 'Over 26 rounds each agent chooses an action (maintain position, claim a neighbour\'s share, concede share, '
        + 'or propose joint ownership) and a design. The affected neighbour may accept, refuse or counter-propose.'),
      card('Scoring', 'Each agent\'s objective score (0-100) is computed from the final state of the loom; 100 denotes full attainment.')),
  ];

  // The tiles
  const tile = (cls, label, value, note) => h('div', { class: cls },
    h('span', { class: 'label' }, label), h('span', { class: 'value' }, value), h('span', { class: 'note' }, note));
  const tiles = h('div', { class: 'tiles' },
    tile('tile hero', 'Attainment rate, with objective', pct(t.overall.told.rate), `n = ${t.overall.told.n} agents assigned an objective`),
    tile('tile', 'Attainment rate, baseline', pct(t.overall.untold.rate), 'the same criteria applied to agents with no objective'),
    tile('tile', 'Matches', fmt(t.matches.length), `${index.model} · 5 agents per match`));

  // Objectives
  const goalCard = g => {
    const info = goal(g), s = t.goals[g], { told, untold } = s;
    return h('div', { class: 'card goal-card' },
      h('h2', null, info.name),
      h('div', { class: 'small' }, info.line),
      h('p', { class: 'small muted' }, `Instruction (verbatim): “${sentenceOf(0, g, 'goal')}”`),
      h('p', { class: 'small' }, info.measure),
      h('div', { class: 'small' }, `baseline ${fmt(untold.mean)} → with objective ${fmt(told.mean)}`),
      track({ from: untold.mean, to: told.mean, title: `Baseline ${fmt(untold.mean)}, with objective ${fmt(told.mean)}` }),
      h('p', { class: 'small muted' },
        `Attained by ${told.reached} of ${told.n} agents with the objective (${untold.reached} of ${untold.n} baseline agents).`),
      h('div', { class: 'split' }, h('div', { class: 'small muted' }, 'Variance decomposition of the score'), splitbar(s.split)));
  };
  const goalsSection = [
    h('h2', null, 'Objectives'),
    h('p', { class: 'sub' }, 'For each objective: the instruction given to the agent, the scoring rule, the mean score with the objective '
      + 'against the baseline, and a variance decomposition of the score.'),
    splitLegend(),
    h('div', { class: 'cards' }, SCORED.map(goalCard)),
  ];

  // The matches: filters, and the gallery they narrow (built before the grid, whose cells set the filter)
  const matchesHead = h('h2', null, 'Matches');
  const gallery = h('div', { class: 'gallery' });
  const count = h('span', { class: 'small muted', 'aria-live': 'polite' });
  const keep = m => m.results.some(r => (!filter.personality || r.personality === filter.personality)
    && (!filter.goal || r.goal === filter.goal));
  const line = r => h('div', { class: 'line' },
    startSwatch(r.seat, 12, 1),
    h('span', null, r.name),
    h('span', null, personality(r.personality).name),
    h('span', null, '→'),
    h('span', null, goal(r.goal).name),
    r.goal === 'none' ? null : h('span', { class: 'score' }, fmt(r.score)),
    mark(r.reached, { short: true }));
  // The agents under a thumbnail are listed in bench order: left to right as seated.
  const bySeat = m => {
    const order = m.bench ?? m.results.map(r => r.seat);
    return order.map(seat => m.results.find(r => r.seat === seat)).filter(Boolean);
  };
  const thumb = m => {
    const who = filter.view === 'who';
    return h('a', { class: 'thumb', href: `match?run=${encodeURIComponent(chosen)}&id=${encodeURIComponent(m.id)}` },
      h('img', {
        src: `runs/${encodeURIComponent(chosen)}/thumbs/${encodeURIComponent(m.id)}${who ? '-who' : ''}.png`,
        alt: `${who ? 'Ownership map' : 'Woven output'}, match ${m.match}`,
        loading: 'lazy', width: 232, height: 384,
      }),
      h('div', { class: 'caption' }, `Match ${m.match} · ${m.name}`),
      bySeat(m).map(line));
  };
  function renderGallery() {
    const shown = index.matches.filter(keep);
    count.textContent = `${shown.length} of ${index.matches.length}`;
    gallery.replaceChildren(...(shown.length ? shown.map(thumb)
      : [h('p', { class: 'muted', style: { gridColumn: '1 / -1' } }, 'No match has an agent like that. Choose another persona or objective.')]));
  }
  function markPicks() {
    for (const k of picks) k.el.classList.toggle('on', filter.personality === k.p && filter.goal === k.g);
  }
  const refresh = () => { markPicks(); renderGallery(); };

  // The reference runs: one card each, their rugs following the same toggle as the gallery
  const refBox = h('div', { class: 'refs' });
  const refThumb = (run, m) => {
    const who = filter.view === 'who';
    return h('a', { class: 'ref-thumb', href: `match?run=${encodeURIComponent(run)}&id=${encodeURIComponent(m.id)}` },
      h('img', {
        src: `runs/${encodeURIComponent(run)}/thumbs/${encodeURIComponent(m.id)}${who ? '-who' : ''}.png`,
        alt: `${who ? 'Ownership map' : 'Woven output'}, match ${m.match} of ${run}`,
        loading: 'lazy', width: 116, height: 192,
      }),
      h('div', { class: 'caption' }, `Match ${m.match}`));
  };
  const refCard = ref => {
    const info = goal(ref.goal);
    return h('div', { class: 'card ref' },
      h('div', { class: 'ref-words' },
        h('h2', null, ref.goal === 'none' ? 'All agents: no objective' : `All agents: ${info.name}`),
        h('div', { class: 'small' }, info.line),
        h('table', { class: 'ref-figs' }, h('tbody', null, referenceFigures(ref.index).map(([label, value]) =>
          h('tr', null, h('th', { scope: 'row' }, label), h('td', null, value)))))),
      h('div', { class: 'ref-rugs' }, ref.index.matches.map(m => refThumb(ref.run, m))));
  };
  function renderRefs() {
    refBox.replaceChildren(...refs.map(refCard));
  }
  const viewButtons = [['cloth', 'Woven output'], ['who', 'Ownership map']].map(([key, label]) => h('button', {
    type: 'button',
    dataset: { view: key },
    class: key === filter.view ? 'btn' : 'btn quiet',
    'aria-pressed': String(key === filter.view),
    onclick: () => {
      filter.view = key;
      for (const b of viewButtons) {
        const on = b.dataset.view === key;
        b.className = on ? 'btn' : 'btn quiet';
        b.setAttribute('aria-pressed', String(on));
      }
      renderGallery();
      renderRefs();
    },
  }, label));
  const personalitySel = h('select', {
    'aria-label': 'Persona',
    onchange: e => { filter.personality = e.target.value; refresh(); },
  }, h('option', { value: '' }, 'Any persona'), people.map(p => h('option', { value: p.key }, p.name)));
  const goalSel = h('select', {
    'aria-label': 'Objective',
    onchange: e => { filter.goal = e.target.value; refresh(); },
  }, h('option', { value: '' }, 'Any objective'), goals.map(g => h('option', { value: g.key }, g.name)));

  // Clicking an objective cell filters to that persona and objective; clicking the same cell again clears the filter.
  function pick(p, g) {
    const clear = filter.personality === p && filter.goal === g;
    filter.personality = clear ? '' : p;
    filter.goal = clear ? '' : g;
    personalitySel.value = filter.personality;
    goalSel.value = filter.goal;
    refresh();
    if (!clear) matchesHead.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Final share by persona and objective: the mean share of the loom with no objective, Grow and Give, for each persona
  const shareOf = (p, key) => {
    const xs = rows.filter(r => r.personality === p && r.goal === key).map(r => r.ground);
    return { mean: mean(xs), n: xs.length };
  };
  const space = people.map(p => ({ p, nothing: shareOf(p.key, 'none'), most: shareOf(p.key, 'grow'), least: shareOf(p.key, 'give') }));
  const peak = Math.max(...space.flatMap(s => [s.nothing.mean, s.most.mean, s.least.mean]).filter(Number.isFinite));
  const max = Math.max(40, Math.ceil(peak / 10) * 10);
  const at = v => `${(v / max) * 100}%`;
  const share = x => (Number.isFinite(x) ? `${fmt(x)}%` : '–');
  const pin = (cls, v) => (Number.isFinite(v) ? h('span', { class: cls, style: { left: at(v) } }) : null);
  const span = (x, y) => (Number.isFinite(x) && Number.isFinite(y)
    ? h('span', { class: 'link', style: { left: `${(Math.min(x, y) / max) * 100}%`, width: `${(Math.abs(x - y) / max) * 100}%` } })
    : null);
  const keyMark = cls => h('span', { class: 'track space-key' }, h('span', { class: cls, style: { left: '50%' } }));
  const spaceRow = s => {
    const { nothing, most, least } = s;
    const words = `${s.p.name}. No objective: ${share(nothing.mean)} (n = ${nothing.n}). `
      + `Grow: ${share(most.mean)} (n = ${most.n}). Give: ${share(least.mean)} (n = ${least.n}).`;
    return h('div', { class: 'space-row', onpointermove: e => tip.show(e, words), onpointerleave: () => tip.hide() },
      h('span', { class: 'space-name' }, s.p.name),
      h('div', { class: 'track space-plot' },
        h('span', { class: 'even', style: { left: at(20) } }),
        span(nothing.mean, most.mean),
        span(nothing.mean, least.mean),
        pin('from', nothing.mean),
        pin('tri-most', most.mean),
        pin('tri-least', least.mean)),
      h('span', { class: 'space-num' }, share(least.mean)),
      h('span', { class: 'space-num' }, share(nothing.mean)),
      h('span', { class: 'space-num' }, share(most.mean)));
  };
  const scale = [[0, '0%'], [20, '20% · equal share'], [40, '40%'], ...(max >= 60 ? [[60, '60%']] : [])];
  const spaceSection = [
    h('h2', null, 'Final share by persona and objective'),
    h('p', { class: 'sub' }, 'Mean final share of the loom for each persona under three assignments: no objective, Grow (maximise final share) '
      + 'and Give (minimise final share). An equal share is 20%.'),
    h('div', { class: 'legend' },
      h('span', { class: 'key' }, keyMark('from'), 'no objective'),
      h('span', { class: 'key' }, keyMark('tri-most'), 'Grow (maximise)'),
      h('span', { class: 'key' }, keyMark('tri-least'), 'Give (minimise)')),
    h('div', { class: 'card space' },
      h('div', { class: 'space-head small muted' },
        h('span', { class: 'space-gap name' }), h('span', { class: 'space-gap' }),
        h('span', { class: 'space-num' }, 'Give'), h('span', { class: 'space-num' }, 'none'), h('span', { class: 'space-num' }, 'Grow')),
      space.map(spaceRow),
      h('div', { class: 'space-axis small muted' },
        h('span', { class: 'space-gap name' }),
        h('div', { class: 'space-scale' }, scale.map(([v, text], i) => h('span', {
          style: { left: at(v), transform: i === 0 ? 'none' : 'translateX(-50%)' },
        }, text))))),
  ];

  // Reference conditions: uniform objectives, shown only when such runs exist
  const refSection = refs.length ? [
    h('h2', null, 'Reference conditions: uniform objectives'),
    h('p', { class: 'sub' }, 'Matches in which all five agents have no persona and the same objective. They show the collective pattern '
      + 'each objective produces when every agent holds it.'),
    refBox,
  ] : [];

  // Persona against objective
  const cell = (p, g) => {
    const by = t.goals[g].by[p.key], info = goal(g), { told, untold } = by;
    const canPick = told.n > 0;
    const words = told.n
      ? `${p.name}, objective ${info.name}: mean score ${fmt(told.mean)} (n = ${told.n}, attained by ${told.reached}). `
        + `Baseline: ${fmt(untold.mean)} (n = ${untold.n}).`
      : `${p.name} was not assigned the objective ${info.name} in these matches.`;
    const td = h('td', {
      class: canPick ? 'heat pick' : 'heat', style: heat(told.mean, 100),
      onclick: canPick ? () => pick(p.key, g) : false,
      onpointermove: e => tip.show(e, words),
      onpointerleave: () => tip.hide(),
    }, h('div', { class: 'heatcell' },
      h('span', { class: 'num' }, fmt(told.mean)),
      h('span', { class: 'base' }, `baseline ${fmt(untold.mean)}`)));
    if (canPick) picks.push({ p: p.key, g, el: td });
    return td;
  };
  const grid = h('div', { id: 'grid', class: 'scroll' },
    h('table', { class: 'grid' },
      h('thead', null, h('tr', null,
        h('th', null, 'Persona'),
        SCORED.map(g => h('th', null, goal(g).name, h('div', { class: 'small muted' }, goal(g).line))),
        h('th', null, 'Mean effect'))),
      h('tbody', null, people.map(p => h('tr', null,
        h('td', null, p.name, h('span', { class: 'small muted' },
          p.text ? sentenceOf(0, p.key, 'personality') : 'No trait sentence: identified only as a weaver.')),
        SCORED.map(g => cell(p, g)),
        h('td', null, signed(t.personalities[p.key].lift)))),
      h('tr', { class: 'all' },
        h('td', null, 'All personas'),
        SCORED.map(g => h('td', { class: 'heat', style: heat(t.goals[g].told.mean, 100) }, h('div', { class: 'heatcell' },
          h('span', { class: 'num' }, fmt(t.goals[g].told.mean)),
          h('span', { class: 'base' }, `baseline ${fmt(t.goals[g].untold.mean)}`)))),
        h('td', null, signed(t.overall.lift ?? NaN))))));
  const gridSection = [
    h('h2', null, 'Persona × objective'),
    h('p', { class: 'sub' }, 'Mean objective score (0–100) of the agents with each persona (rows) assigned each objective (columns); a darker '
      + 'cell is a higher score. The small figure is the baseline: agents with that persona and no objective, scored on the same rule. '
      + 'A pale cell beside a dark column is a persona that overrode the objective. The last column is the mean effect of an objective '
      + 'for that persona. Select a cell to list its matches.'),
    grid,
    h('div', { class: 'heat-scale small muted' }, h('span', null, '0'), h('span', { class: 'heat-bar' }), h('span', null, '100 · objective score')),
  ];

  // The matches
  const matchesSection = [
    matchesHead,
    h('div', { class: 'row', style: { margin: '16px 0 0' } },
      viewButtons, personalitySel, goalSel, count),
    h('p', { class: 'small muted', style: { margin: '12px 0 0' } },
      'Agents are listed left to right as seated. The swatch is each agent\'s starting design.'),
    gallery,
  ];

  // Method
  const measured = [
    'The assignment is balanced: in every 11 matches each persona holds each objective exactly once.',
    ...SCORED.map(g => `${goal(g).name}: ${goal(g).measure}`),
    'Baseline: agents with no objective, scored on all four rules.',
    'Effect of an objective: the mean score with the objective minus the baseline mean.',
    'Variance decomposition: a two-factor decomposition of each score over objective assigned or not and persona, with the '
      + 'within-cell mean square subtracted from each effect. The residual includes seating, the other agents and sampling.',
    'Limitations: one model; few matches per cell; rank-based scores are interdependent within a match.',
  ];
  const method = h('details', { class: 'method' }, h('summary', null, 'Method'),
    measured.map(text => h('p', null, text)));

  renderGallery();
  renderRefs();
  return [topbar('results'), head(runs, chosen), h('p', { class: 'lede' }, LEDE), ...how, tiles,
    ...goalsSection, ...spaceSection, ...refSection, ...gridSection, ...matchesSection, method];
}

/** The reference runs (design 'uniform'), in the order ref-none, ref-grow, ref-give, ref-hold; a run that cannot be read is left out. */
async function referenceRuns(runs) {
  const uniform = runs.filter(r => r.design === 'uniform')
    .sort((a, b) => (REFERENCE.indexOf(a.run) + 1 || 99) - (REFERENCE.indexOf(b.run) + 1 || 99));
  const out = [];
  for (const r of uniform) {
    try {
      const index = await getJSON(`runs/${encodeURIComponent(r.run)}/index.json`);
      const objective = index.matches[0]?.results?.[0]?.goal;
      if (index.matches.length && objective) out.push({ run: r.run, index, goal: objective });
    } catch {
      // A reference run that cannot be read is left out of the section.
    }
  }
  return out;
}

/** Loads the runs and the chosen run, then shows the page; each failure is said in a sentence. */
async function start() {
  let runs;
  try {
    runs = await getJSON('api/runs.json');
  } catch (err) {
    show(topbar('results'), h('h1', null, 'LoomBench'), h('p', { class: 'lede' }, LEDE),
      h('p', { class: 'sub' }, `Could not load the list of runs: ${err.message}.`));
    return;
  }
  const chosen = pickRun(runs);
  if (chosen === null) {
    show(topbar('results'), h('h1', null, 'LoomBench'), h('p', { class: 'lede' }, LEDE), emptyState());
    return;
  }
  let index;
  try {
    index = await getJSON(`runs/${encodeURIComponent(chosen)}/index.json`);
  } catch (err) {
    show(topbar('results'), head(runs, chosen), h('p', { class: 'lede' }, LEDE),
      h('p', { class: 'sub' }, `Could not load run ${chosen}: ${err.message}.`));
    return;
  }
  if (!index.matches.length) {
    show(topbar('results'), head(runs, chosen), h('p', { class: 'lede' }, LEDE),
      h('p', { class: 'sub' }, `Run ${chosen} has no matches yet.`));
    return;
  }
  show(...resultsPage(runs, chosen, index, await referenceRuns(runs)));
}

start().catch(err => show(topbar('results'), h('p', { class: 'lede' }, `The page could not be drawn: ${err.message}.`)));
