// The Results page: the runs, the four goals told against untold, personality against goal, and the matches.
import { h, getJSON, fmt, signed, pct, qs, topbar, dot, mark, track, splitbar, splitLegend, tip } from './ui.mjs';
import { PERSONALITIES, GOALS, SCORED, personality, goal, sentenceOf } from '../bench/core.mjs';
import { rowsOf, table, mean } from '../bench/stats.mjs';

const LEDE = 'Five AI weavers share one loom. Each is dealt a personality and a goal. The finished rug shows which one they followed.';
const main = document.querySelector('main.page');
const show = (...nodes) => main.replaceChildren(...nodes);

/** The run to show: ?run=, else the first run that is neither play nor chance, else chance, else null. */
function pickRun(runs) {
  const asked = qs('run');
  if (asked) return asked;
  const real = runs.find(r => r.run !== 'play' && r.run !== 'chance');
  if (real) return real.run;
  return runs.some(r => r.run === 'chance') ? 'chance' : null;
}

/** The heading row: the title and a select of runs that goes to ?run= when one is chosen. */
function head(runs, chosen) {
  const known = runs.some(r => r.run === chosen);
  const options = runs.map(r => h('option', { value: r.run, selected: r.run === chosen }, `${r.run} · ${r.matches} matches`));
  if (!known) options.unshift(h('option', { value: chosen, selected: true }, `${chosen} · not found`));
  const select = h('select', {
    'aria-label': 'Run',
    onchange: e => { window.location.href = `/?run=${encodeURIComponent(e.target.value)}`; },
  }, options);
  return h('div', { class: 'spread head' }, h('h1', null, 'LoomBench'), select);
}

/** The empty state: no kept runs yet, and the two commands that make some. */
function emptyState() {
  return h('div', { class: 'card', style: { marginTop: '24px' } },
    h('h2', null, 'No results yet'),
    h('p', { class: 'sub' }, 'A run is a folder of kept matches. Make one from the project folder, with one of these:'),
    h('pre', { class: 'cmd' }, 'node --env-file=<file with TYPESAFE_API_KEY> tools/run.mjs --matches 1-44 --run jev-1'),
    h('pre', { class: 'cmd' }, 'node tools/run.mjs --chance --matches 1-22'),
    h('p', { class: 'sub', style: { margin: 0 } },
      'The first asks Jev for every choice. The second makes every choice by chance, as a control.'));
}

/** The whole Results page for one run: every section, in the order the plan gives. */
function resultsPage(runs, chosen, index) {
  const rows = rowsOf(index.matches);
  const t = table(rows);
  const seen = new Set(rows.map(r => r.goal));
  const people = PERSONALITIES.filter(p => t.personalities[p.key]);
  const goals = GOALS.filter(g => seen.has(g.key));
  const filter = { personality: '', goal: '', view: 'cloth' };
  const picks = [];

  // 3. How a match works
  const card = (title, text) => h('div', { class: 'card' }, h('h2', null, title), h('p', null, text));
  const how = [
    h('h2', null, 'How a match works'),
    h('div', { class: 'cards' },
      card('Deal', 'Every weaver gets one sentence about what they are like. Four of the five also get one sentence saying what to achieve.'),
      card('Weave', 'For 26 rounds each chooses: keep working, take space from a neighbour, give space, or offer to share, and which design to weave. A neighbour can say no.'),
      card('Score', "Code reads each weaver's score off the finished rug: 100 is the goal fully reached.")),
  ];

  // 4. The tiles
  const tile = (cls, label, value, note) => h('div', { class: cls },
    h('span', { class: 'label' }, label), h('span', { class: 'value' }, value), h('span', { class: 'note' }, note));
  const tiles = h('div', { class: 'tiles' },
    tile('tile hero', 'Reached their goal', pct(t.overall.told.rate), `${t.overall.told.n} weavers told a goal`),
    tile('tile', 'Reached it untold', pct(t.overall.untold.rate), 'the same goals, met by weavers told nothing'),
    tile('tile', 'Matches', fmt(t.matches.length), `${index.model} · 5 weavers each`));

  // 5. The four goals
  const goalCard = g => {
    const info = goal(g), s = t.goals[g], { told, untold } = s;
    return h('div', { class: 'card goal-card' },
      h('h2', null, info.name),
      h('div', { class: 'small' }, info.line),
      h('p', { class: 'small muted' }, `“${sentenceOf(0, g, 'goal')}”`),
      h('p', { class: 'small' }, info.measure),
      h('div', { class: 'small' }, `untold ${fmt(untold.mean)} → told ${fmt(told.mean)}`),
      track({ from: untold.mean, to: told.mean, title: `Untold ${fmt(untold.mean)}, told ${fmt(told.mean)}` }),
      h('p', { class: 'small muted' },
        `Reached by ${told.reached} of ${told.n} told (${untold.reached} of ${untold.n} untold).`),
      h('div', { class: 'split' }, h('div', { class: 'small muted' }, 'What decided the score'), splitbar(s.split)));
  };
  const goalsSection = [
    h('h2', null, 'The four goals'),
    h('p', { class: 'sub' }, 'What each weaver was told, how it is scored, and what decided the score.'),
    splitLegend(),
    h('div', { class: 'cards' }, SCORED.map(goalCard)),
  ];

  // 7. The matches: filters, and the gallery they narrow (built before the grid, whose cells set the filter)
  const matchesHead = h('h2', null, 'Matches');
  const gallery = h('div', { class: 'gallery' });
  const count = h('span', { class: 'small muted', 'aria-live': 'polite' });
  const keep = m => m.results.some(r => (!filter.personality || r.personality === filter.personality)
    && (!filter.goal || r.goal === filter.goal));
  const line = r => h('div', { class: 'line' },
    dot(r.seat),
    h('span', null, personality(r.personality).name),
    h('span', null, '→'),
    h('span', null, goal(r.goal).name),
    r.goal === 'none' ? null : h('span', { class: 'score' }, fmt(r.score)),
    mark(r.reached, { short: true }));
  const thumb = m => {
    const who = filter.view === 'who';
    return h('a', { class: 'thumb', href: `/match?run=${encodeURIComponent(chosen)}&id=${encodeURIComponent(m.id)}` },
      h('img', {
        src: `/runs/${encodeURIComponent(chosen)}/thumbs/${encodeURIComponent(m.id)}${who ? '-who' : ''}.png`,
        alt: `${who ? 'Who holds what' : 'The rug'}, match ${m.match}`,
        loading: 'lazy', width: 232, height: 384,
      }),
      h('div', { class: 'caption' }, `Match ${m.match} · ${m.name}`),
      [...m.results].sort((a, b) => a.seat - b.seat).map(line));
  };
  function renderGallery() {
    const shown = index.matches.filter(keep);
    count.textContent = `${shown.length} of ${index.matches.length}`;
    gallery.replaceChildren(...(shown.length ? shown.map(thumb)
      : [h('p', { class: 'muted', style: { gridColumn: '1 / -1' } }, 'No match has a weaver like that. Choose another personality or goal.')]));
  }
  function markPicks() {
    for (const k of picks) k.el.classList.toggle('on', filter.personality === k.p && filter.goal === k.g);
  }
  const refresh = () => { markPicks(); renderGallery(); };
  const viewButtons = [['cloth', 'The rug'], ['who', 'Who holds what']].map(([key, label]) => h('button', {
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
    },
  }, label));
  const personalitySel = h('select', {
    'aria-label': 'Personality',
    onchange: e => { filter.personality = e.target.value; refresh(); },
  }, h('option', { value: '' }, 'Any personality'), people.map(p => h('option', { value: p.key }, p.name)));
  const goalSel = h('select', {
    'aria-label': 'Goal',
    onchange: e => { filter.goal = e.target.value; refresh(); },
  }, h('option', { value: '' }, 'Any goal'), goals.map(g => h('option', { value: g.key }, g.name)));

  // Clicking a goal cell filters to that personality and goal; clicking the same cell again clears the filter.
  function pick(p, g) {
    const clear = filter.personality === p && filter.goal === g;
    filter.personality = clear ? '' : p;
    filter.goal = clear ? '' : g;
    personalitySel.value = filter.personality;
    goalSel.value = filter.goal;
    refresh();
    if (!clear) matchesHead.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 5b. Space at the end: each kind of weaver's mean share of the loom, told nothing, told the most and told the least
  const spaceOf = (p, key) => {
    const xs = rows.filter(r => r.personality === p && r.goal === key).map(r => r.ground);
    return { mean: mean(xs), n: xs.length };
  };
  const space = people.map(p => ({ p, nothing: spaceOf(p.key, 'none'), most: spaceOf(p.key, 'grow'), least: spaceOf(p.key, 'give') }));
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
    const words = `${s.p.name}. Told nothing: ${share(nothing.mean)} of the loom (${nothing.n} weavers). `
      + `Told to end with the most: ${share(most.mean)} (${most.n}). Told to end with the least: ${share(least.mean)} (${least.n}).`;
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
  const scale = [[0, '0%'], [20, '20% · even share'], [40, '40%'], ...(max >= 60 ? [[60, '60%']] : [])];
  const spaceSection = [
    h('h2', null, 'Space at the end'),
    h('p', { class: 'sub' }, 'How much of the loom each kind of weaver holds when the rug is finished: told nothing, told to end '
      + 'with the most, and told to end with the least. An even share is 20%.'),
    h('div', { class: 'legend' },
      h('span', { class: 'key' }, keyMark('from'), 'told nothing'),
      h('span', { class: 'key' }, keyMark('tri-most'), 'told to end with the most'),
      h('span', { class: 'key' }, keyMark('tri-least'), 'told to end with the least')),
    h('div', { class: 'card space' },
      h('div', { class: 'space-head small muted' },
        h('span', { class: 'space-gap name' }), h('span', { class: 'space-gap' }),
        h('span', { class: 'space-num' }, 'least'), h('span', { class: 'space-num' }, 'nothing'), h('span', { class: 'space-num' }, 'most')),
      space.map(spaceRow),
      h('div', { class: 'space-axis small muted' },
        h('span', { class: 'space-gap name' }),
        h('div', { class: 'space-scale' }, scale.map(([v, text], i) => h('span', {
          style: { left: at(v), transform: i === 0 ? 'none' : 'translateX(-50%)' },
        }, text))))),
  ];

  // 6. Personality against goal
  const cell = (p, g) => {
    const by = t.goals[g].by[p.key], info = goal(g), { told, untold } = by;
    const canPick = told.n > 0;
    const words = told.n
      ? `${p.name}, told to ${info.name.toLowerCase()}: ${fmt(told.mean)} (${told.n} weavers, ${told.reached} reached it). `
        + `Told nothing: ${fmt(untold.mean)} (${untold.n} weavers).`
      : `${p.name} was not told to ${info.name.toLowerCase()} in these matches.`;
    const td = h('td', {
      class: canPick ? 'pick' : false,
      onclick: canPick ? () => pick(p.key, g) : false,
      onpointermove: e => tip.show(e, words),
      onpointerleave: () => tip.hide(),
    }, h('div', { class: 'cell' },
      track({ from: untold.mean, to: told.mean }),
      h('span', { class: 'num' }, fmt(told.mean))));
    if (canPick) picks.push({ p: p.key, g, el: td });
    return td;
  };
  const grid = h('div', { id: 'grid', class: 'scroll' },
    h('table', { class: 'grid' },
      h('thead', null, h('tr', null,
        h('th', null, 'Personality'),
        SCORED.map(g => h('th', null, goal(g).name, h('div', { class: 'small muted' }, goal(g).line))),
        h('th', null, 'Average lift'))),
      h('tbody', null, people.map(p => h('tr', null,
        h('td', null, p.name, h('span', { class: 'small muted' },
          p.text ? sentenceOf(0, p.key, 'personality') : 'Told only that they are a weaver.')),
        SCORED.map(g => cell(p, g)),
        h('td', null, signed(t.personalities[p.key].lift)))))));
  const gridSection = [
    h('h2', null, 'Personality against goal'),
    h('p', { class: 'sub' }, 'Each row is a kind of weaver. The hollow dot is their score told nothing; the filled dot is '
      + 'their score told the goal. A long line is a goal that moved them.'),
    grid,
  ];

  // 7. The matches
  const matchesSection = [
    matchesHead,
    h('div', { class: 'row', style: { margin: '16px 0 0' } },
      viewButtons, personalitySel, goalSel, count),
    gallery,
  ];

  // 8. How this is measured
  const measured = [
    'The deal is balanced: every 11 matches each personality holds each goal once.',
    ...SCORED.map(g => `${goal(g).name}: ${goal(g).measure}`),
    "Told against untold: each goal's told mean is set beside the mean of the same goal among weavers told nothing. "
      + 'The lift is the difference between them.',
    'What decided the score: how much of the spread in a score goes with being told the goal, with the personality, '
      + 'with the two together, and with everything else: who sat beside whom, and chance.',
    "Limits: one model, few matches, and the place scores share one rug, so one weaver's gain is another's loss.",
  ];
  const method = h('details', { class: 'method' }, h('summary', null, 'How this is measured'),
    measured.map(text => h('p', null, text)));

  renderGallery();
  return [topbar('results'), head(runs, chosen), h('p', { class: 'lede' }, LEDE), ...how, tiles,
    ...goalsSection, ...spaceSection, ...gridSection, ...matchesSection, method];
}

/** Loads the runs and the chosen run, then shows the page; each failure is said in a sentence. */
async function start() {
  let runs;
  try {
    runs = await getJSON('/api/runs');
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
    index = await getJSON(`/runs/${encodeURIComponent(chosen)}/index.json`);
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
  show(...resultsPage(runs, chosen, index));
}

start().catch(err => show(topbar('results'), h('p', { class: 'lede' }, `The page could not be drawn: ${err.message}.`)));
