// The Play page: set the switches of a match (who decides, what the agents are told, who acts, whether areas can change), give each
// of the five agents a persona and an objective, then run it on the server and go to it.
import { h, getJSON, fmt, topbar, startSwatch, seatMark, choseDesigns, mark, switchWords, modelName, isChatModel, REPO } from './ui.mjs';
import { NAMES, PERSONALITIES, GOALS, personality, goal, deal, sentenceOf, startWords, conditionsOf } from '../bench/core.mjs';

const SEED_MIN = 1, SEED_MAX = 999999;
const SEED_MESSAGE = 'Seed must be an integer from 1 to 999999.';
const PLAIN_PERSONALITY = 'No trait sentence.';
const NO_GOAL = 'No objective assigned (baseline).';
// What the four other seats of a solo match do, by how they are scripted.
const SCRIPTED = {
  accept: 'Scripted neighbour: no model decides for it. It keeps working on its own piece, keeps its design, and accepts every request.',
  refuse: 'Scripted neighbour: no model decides for it. It keeps working on its own piece, keeps its design, and refuses every request.',
  chance: 'Scripted neighbour: no model decides for it. Every choice it makes is sampled uniformly at random.',
};

const randomInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const sentence = text => (/[.!?]$/.test(text) ? text : `${text}.`);
const stampOf = m => Number(String(m.id).split('-').pop()) || 0;

// The switches as the page holds them. `kept` is what each seat was given before personas or objectives were turned off.
const set = { model: null, persona: true, objective: true, solo: null, neighbours: 'accept', area: 'free', designs: 'assigned', peers: false };
const kept = { personality: [], goal: [] };
const seats = [];       // per seat: { card, personality, goal (the selects), personalityNote, goalNote (their boxes) }
const controls = [];    // every control, disabled while a match is being woven
let models = [], isStatic = false;
let seedInput, seedMessage, dealButton, weaveButton, errorLine, statusNote, switchBox, timer = null;

/** The sentence under a persona select, as the seat is told it. */
function personalityText(seat, key) {
  return sentenceOf(seat, key, 'personality') || PLAIN_PERSONALITY;
}

/** Redraws the two notes of one seat from its selects, or says it is a placeholder. */
function refreshSeat(seat) {
  const ui = seats[seat], key = ui.personality.value, gkey = ui.goal.value, said = sentenceOf(seat, gkey, 'goal');
  const placeholder = set.solo !== null && set.solo !== seat;
  ui.card.classList.toggle('placeholder', placeholder);
  ui.role.replaceChildren(placeholder ? SCRIPTED[set.neighbours] : set.solo === seat ? 'The one agent the model decides for.' : '');
  ui.start.replaceChildren(set.designs === 'chosen' ? 'Starts with 20 of the 100 warps and chooses its first design'
    : `Starts with 20 of the 100 warps, in ${startWords(seat)}`);
  ui.personalityNote.replaceChildren(h('div', { class: 'small muted' }, personalityText(seat, key)));
  ui.goalNote.replaceChildren(...(gkey === 'none'
    ? [h('div', { class: 'small muted' }, NO_GOAL)]
    : [h('div', { class: 'small' }, goal(gkey).line), h('div', { class: 'small muted' }, said ? `“${said}”` : NO_GOAL)]));
}

/** One seat card: its swatch and name with its starting design, a persona select with its sentence, an objective select with its line and sentence. */
function seatCard(seat) {
  const name = NAMES[seat];
  const ui = {
    personality: h('select', {
      'aria-label': `${name}'s persona`, onchange: () => refreshSeat(seat),
    }, PERSONALITIES.map(p => h('option', { value: p.key }, p.name))),
    goal: h('select', {
      'aria-label': `${name}'s objective`, onchange: () => refreshSeat(seat),
    }, GOALS.map(g => h('option', { value: g.key }, g.name))),
    personalityNote: h('div', { class: 'note' }),
    goalNote: h('div', { class: 'note' }),
    role: h('div', { class: 'small role' }),
    start: h('div', { class: 'small muted' }),
  };
  seats[seat] = ui;
  ui.card = h('section', { class: 'card seat', 'aria-label': `${name}'s seat` },
    h('div', { class: 'seat-title' },
      h('div', { class: 'seat-head' }, startSwatch(seat), h('h2', null, name)),
      ui.start,
      ui.role),
    h('div', { class: 'part' },
      h('span', { class: 'small muted' }, 'Persona'), ui.personality, ui.personalityNote),
    h('div', { class: 'part' },
      h('span', { class: 'small muted' }, 'Objective'), ui.goal, ui.goalNote));
  return ui.card;
}

/** Sets every seat's selects from a deal and redraws the notes. With personas or objectives off, the deal is kept for when they are turned on. */
function setSeats(dealt) {
  dealt.forEach((s, seat) => {
    kept.personality[seat] = s.personality;
    kept.goal[seat] = s.goal;
    seats[seat].personality.value = set.persona ? s.personality : 'plain';
    seats[seat].goal.value = set.objective ? s.goal : 'none';
  });
  sync();
}

function dealForMe() {
  setSeats(deal(randomInt(1, 55)));
}

/** A switch with two or three settings, as a row of buttons of which one is pressed. `options` are [value, label]. */
function segmented(label, options, get, put) {
  const buttons = options.map(([value, text]) => h('button', {
    type: 'button', class: 'seg-btn', 'aria-pressed': 'false', onclick: () => { put(value); sync(); },
  }, text));
  const box = h('div', { class: 'segmented', role: 'group', 'aria-label': label }, buttons);
  box.refresh = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i][0] === get())));
  controls.push(...buttons);
  return box;
}

/** Turns personas (or objectives) on or off for every seat, keeping what each seat had so that turning them on restores it. */
function assign(part, on) {
  const off = part === 'personality' ? 'plain' : 'none', key = part === 'personality' ? 'persona' : 'objective';
  if (set[key] === on) return;
  seats.forEach((ui, seat) => {
    if (!on) kept[part][seat] = ui[part].value;
    ui[part].value = on ? kept[part][seat] ?? off : off;
  });
  set[key] = on;
}

/** One row of the switches card: its name, its control, and one sentence saying what the current setting does. */
function switchRow(name, control, words) {
  const note = h('div', { class: 'small muted switch-note' });
  const row = h('div', { class: 'switch' }, h('div', { class: 'switch-name' }, name), h('div', { class: 'switch-control' }, control), note);
  row.refresh = () => { control.refresh?.(); note.replaceChildren(...[words()].flat()); };
  return row;
}

/** Why peer communication cannot be on with the other switches as they stand, or null when it can. */
function peersBlocked() {
  if (set.model === 'chance') return 'It needs a model: by chance there is nothing to say.';
  if (set.solo !== null) return 'It needs neighbours that a model decides for, so it is off while one agent decides.';
  if (set.area === 'fixed') return 'It concerns the action, and with fixed areas there is one action, so it is off.';
  return null;
}

/** The card of switches. */
function switchesCard() {
  const modelSelect = h('select', { 'aria-label': 'Decision model', onchange: e => { set.model = e.target.value; sync(); } });
  modelSelect.refresh = () => {
    modelSelect.replaceChildren(...models.map(m => h('option', { value: m.spec }, m.name)));
    if (set.model) modelSelect.value = set.model;
  };
  const soloSelect = h('select', { 'aria-label': 'The agent that decides', onchange: e => { set.solo = Number(e.target.value); sync(); } },
    NAMES.map((name, seat) => h('option', { value: seat }, name)));
  const agents = segmented('Agents deciding', [['group', 'All five'], ['solo', 'One']], () => (set.solo === null ? 'group' : 'solo'),
    v => { set.solo = v === 'group' ? null : Number(soloSelect.value); });
  const neighbourSelect = h('select', { 'aria-label': 'How the four neighbours are scripted', onchange: e => { set.neighbours = e.target.value; sync(); } },
    [['accept', 'neighbours accept every request'], ['refuse', 'neighbours refuse every request'], ['chance', 'neighbours act at random']].map(([value, text]) => h('option', { value }, text)));
  const agentsBox = h('div', { class: 'row' }, agents, soloSelect, neighbourSelect);
  agentsBox.refresh = () => {
    agents.refresh();
    soloSelect.hidden = neighbourSelect.hidden = set.solo === null;
    if (set.solo !== null) { soloSelect.value = set.solo; neighbourSelect.value = set.neighbours; }
  };
  controls.push(modelSelect, soloSelect, neighbourSelect);
  const soloWords = () => {
    const name = NAMES[set.solo], how = { accept: 'never act and accept every request, so the agent meets no opposition', refuse: 'never act and refuse every request, which the agent can override',
      chance: 'act at random, every choice sampled uniformly' }[set.neighbours];
    return `The model decides only for ${name}. The other four seats are scripted neighbours that ${how}. ${name} is not told, and is asked the same questions as in a match of five.`;
  };

  const rows = [
    switchRow('Decision model', modelSelect, () => {
      const note = models.find(m => m.spec === set.model)?.note ?? 'Checking which models this server can reach…';
      return isChatModel(set.model) ? `${note} It is given the words Jev is given, as a chat prompt, one request for each question; the probabilities of its reply's first token are read as its distribution over the options.` : note;
    }),
    switchRow('Personas', segmented('Personas', [[true, 'On'], [false, 'Off']], () => set.persona, v => assign('personality', v)),
      () => (set.persona ? 'Each agent is given the trait sentence chosen below.' : 'No agent is given a trait sentence. Whatever differs between agents is then the objective, the seat and the model.')),
    switchRow('Objectives', segmented('Objectives', [[true, 'On'], [false, 'Off']], () => set.objective, v => assign('goal', v)),
      () => (set.objective ? 'Each agent is given the objective chosen below.' : 'No agent is given an objective. Whatever differs between agents is then the persona, the seat and the model.')),
    switchRow('Agents deciding', agentsBox,
      () => (set.solo === null ? 'The model decides for all five agents, and each can refuse the others.' : soloWords())),
    switchRow('Areas', segmented('Areas', [['free', 'Can change'], ['fixed', 'Fixed']], () => set.area, v => { set.area = v; }),
      () => (set.area === 'free' ? 'Every agent starts with the same area, 20 warps, and can then claim a neighbour\'s share or concede its own.'
        : 'Every agent starts with the same area, 20 warps, and keeps it: no boundary can move for all 26 rounds, and only designs are decided. Grow, Give and Hold cannot be pursued and are not scored.')),
    switchRow('Starting designs', segmented('Starting designs', [['assigned', 'Assigned'], ['chosen', 'Chosen']], () => set.designs, v => { set.designs = v; }),
      () => (set.solo !== null ? 'A scripted neighbour keeps its design, so designs are assigned while one agent decides.'
        : set.designs === 'assigned' ? 'Every match uses one palette, and each agent starts with a design no other agent has, so the woven output shows who holds what from the first row.'
          : 'The agents vote on a palette and each chooses its first design, as under the benchmark\'s first rules. The woven output then does not show who holds what; the ownership map does.')),
    switchRow('Peer communication', segmented('Peer communication', [[false, 'Off'], [true, 'On']], () => set.peers, v => { set.peers = v; }),
      () => peersBlocked() ?? (set.peers ? 'Before each action an agent hears, three times in four, which action an adjacent agent would have it take. About three times the calls.'
        : 'Agents do not hear each other before acting.')),
  ];
  switchBox = h('section', { class: 'card switches', 'aria-label': 'Switches' },
    h('h2', null, 'Switches'),
    h('p', { class: 'small muted' }, 'Each switch changes one part of how a match is set up and leaves the others as they are. The first setting of each is the benchmark\'s default; the default decision model is Jev.'),
    rows);
  switchBox.refresh = () => rows.forEach(r => r.refresh());
  return switchBox;
}

/** Brings every control into line with the switches: which are pressed, which are disabled, and what each seat shows. */
function sync() {
  if (peersBlocked()) set.peers = false;
  if (set.solo !== null) set.designs = 'assigned';
  switchBox?.refresh();
  const lock = peersBlocked() !== null;
  for (const b of switchBox?.querySelectorAll('[aria-label="Peer communication"] button') ?? []) b.disabled = lock;
  for (const b of switchBox?.querySelectorAll('[aria-label="Starting designs"] button') ?? []) b.disabled = set.solo !== null;
  seats.forEach((ui, seat) => {
    const placeholder = set.solo !== null && set.solo !== seat;
    ui.personality.disabled = !set.persona || placeholder;
    ui.goal.disabled = !set.objective || placeholder;
    refreshSeat(seat);
  });
}

/** The seed as a whole number from 1 to 999999, or null when it is empty or outside that. */
function seedOf() {
  const text = seedInput.value.trim(), n = Number(text);
  return text !== '' && Number.isInteger(n) && n >= SEED_MIN && n <= SEED_MAX ? n : null;
}

/** Shows the seed sentence beside the input while the seed is not usable. */
function checkSeed() {
  const ok = seedOf() !== null;
  seedMessage.style.color = ok ? '' : 'var(--critical)';
  seedMessage.replaceChildren(ok ? '' : SEED_MESSAGE);
}

/** Disables every control while a match runs; enables them again, each as the switches leave it, when it is over. */
function busy(on) {
  for (const c of [...controls, ...seats.flatMap(ui => [ui.personality, ui.goal]), seedInput, dealButton, weaveButton]) c.disabled = on;
  if (!on) sync();
}

/** Brings the controls back and shows why the match did not run. */
function failed(message) {
  clearInterval(timer);
  busy(false);
  weaveButton.replaceChildren('Run match');
  errorLine.hidden = false;
  errorLine.replaceChildren(h('span', { style: { color: 'var(--critical)' } }, '✗ '), sentence(message));
}

/** Posts the match, follows its job round by round, then goes to the match. */
async function weave() {
  const seed = seedOf();
  if (seed === null) {
    checkSeed();
    seedInput.focus();
    return;
  }
  const bench = seats.map(ui => ({ personality: ui.personality.value, goal: ui.goal.value }));
  busy(true);
  errorLine.hidden = true;
  errorLine.replaceChildren();
  let secs = 0, round = 0;
  const label = () => weaveButton.replaceChildren(round ? `Round ${round} of 26 · ${secs} s` : `Starting… ${secs} s`);
  label();
  clearInterval(timer);
  timer = setInterval(() => { secs += 1; label(); }, 1000);
  try {
    const res = await fetch('api/play', {
      method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ seats: bench, seed, model: set.model, solo: set.solo, neighbours: set.solo === null ? 'accept' : set.neighbours,
        area: set.area, designs: set.designs, peers: set.peers }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.job) throw Error(data.error ?? `the server answered ${res.status}`);
    for (;;) {
      await new Promise(done => setTimeout(done, 700));
      const job = await getJSON(`api/play/${encodeURIComponent(data.job)}`);
      round = job.round;
      if (job.state === 'failed') throw Error(job.error ?? 'the match failed');
      if (job.state === 'done') {
        window.location.href = `match?run=play&id=${encodeURIComponent(job.id)}`;
        return;
      }
    }
  } catch (e) {
    failed(e instanceof TypeError ? 'Could not reach the server' : `Could not run this match: ${e.message}`);
  }
}

/** The line under the buttons, from the server's status; on the published copy, which has no server, how to run a match. */
function statusLine(status) {
  if (status.static) {
    return ['This is the published copy of LoomBench, with no server behind it, so a match cannot be run from this page. To run one, get the ',
      h('a', { href: REPO }, 'source'), ' and start the server: ', h('code', null, 'node --env-file=<file with TYPESAFE_API_KEY> serve.mjs'),
      '. The server offers Jev when it has that key, every chat model an Ollama on the same machine has, and uniform random.'];
  }
  if (status.key) return ['One match is run at a time on this server and kept under Previous matches.'];
  return ['This server has no Jev key, so Jev is not offered. Start it with ', h('code', null, '--env-file'),
    ' and a file holding TYPESAFE_API_KEY to add it.'];
}

/** One earlier match as a thumbnail link: its switches, and its agents listed in bench order with their starting swatches. */
function thumb(m) {
  const id = encodeURIComponent(m.id), c = conditionsOf(m);
  const order = m.bench ?? m.results.map(r => r.seat);
  const live = order.map(seat => m.results.find(r => r.seat === seat)).filter(r => r && !r.placeholder);
  return h('a', { class: 'thumb', href: `match?run=play&id=${id}` },
    h('img', { src: `runs/play/thumbs/${id}.png`, loading: 'lazy', width: 232, height: 384, alt: `Woven output, ${m.name}` }),
    h('div', { class: 'caption' }, m.name),
    h('div', { class: 'small muted', style: { margin: '0 2px 6px' } }, [modelName(m.model), ...switchWords(c)].join(' · ')),
    live.map(r => h('div', { class: 'line' },
      seatMark(r.seat, choseDesigns(m), 12, 1),
      h('span', null, r.name),
      h('span', null, personality(r.personality).name),
      h('span', null, '→'),
      h('span', null, goal(r.goal).name),
      r.goal === 'none' ? null : h('span', { class: 'score' }, fmt(r.score)),
      r.goal === 'none' ? null : mark(r.reached, { short: true }))),
    c.agents === 'solo' ? h('div', { class: 'line muted' }, 'and four scripted neighbours') : null);
}

/** The earlier matches of this run, newest first, as a section; null when there are none. */
function earlierSection(index) {
  const matches = [...(index.matches ?? [])].sort((a, b) => stampOf(b) - stampOf(a));
  if (matches.length === 0) return null;
  return h('section', null,
    h('h2', null, 'Previous matches'),
    h('div', { class: 'gallery' }, matches.map(thumb)));
}

/** Builds the page and fills it. */
async function start() {
  const page = document.getElementById('page');
  const seedStart = randomInt(1, 9999);
  dealButton = h('button', { class: 'btn quiet', type: 'button', onclick: dealForMe }, 'Random assignment');
  weaveButton = h('button', { class: 'btn', type: 'button', onclick: weave }, 'Run match');
  seedInput = h('input', {
    type: 'number', min: SEED_MIN, max: SEED_MAX, step: 1, value: seedStart, 'aria-label': 'Seed', oninput: checkSeed,
  });
  seedMessage = h('span', { class: 'small' });
  errorLine = h('p', { class: 'small', role: 'alert', hidden: true });
  statusNote = h('p', { class: 'small muted' }, 'Checking the server…');

  const cards = [];
  for (let seat = 0; seat < NAMES.length; seat++) cards.push(seatCard(seat));
  const switches = switchesCard();

  page.replaceChildren(
    topbar('play'),
    h('h1', null, 'Configure a match'),
    h('p', { class: 'lede' }, 'Set the switches, assign a persona and an objective to each of the five agents, then run the match. '
      + 'Every agent starts with the same area: 20 of the loom\'s 100 warps.'),
    switches,
    h('div', { class: 'seats' }, cards),
    h('div', { class: 'row controls' },
      h('span', { class: 'small muted' }, 'Seed'), seedInput, seedMessage, dealButton, weaveButton),
    statusNote,
    errorLine);
  setSeats(deal(randomInt(1, 55)));

  getJSON('api/status.json')
    .then(status => {
      isStatic = Boolean(status.static);
      models = status.models ?? [{ spec: status.key ? 'jev' : 'chance', name: status.key ? `Jev (${status.model})` : 'Uniform random (no model)', note: '' }];
      set.model = models[0]?.spec ?? null;
      statusNote.replaceChildren(...statusLine(status));
      sync();
      if (isStatic) weaveButton.disabled = true;
    })
    .catch(() => statusNote.replaceChildren('Could not tell which models this server can reach.'));

  getJSON('runs/play/index.json')
    .then(index => {
      const section = earlierSection(index);
      if (section) page.append(section);
    })
    .catch(() => {});
}

start().catch(e => {
  document.getElementById('page').replaceChildren(h('p', { class: 'small' }, `This page could not start: ${e.message}.`));
});
