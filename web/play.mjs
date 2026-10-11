// The Play page: configure a match (a persona and an objective for each of the five agents), then run it on the server and go to it.
import { h, getJSON, fmt, topbar, startSwatch, mark, REPO } from './ui.mjs';
import { NAMES, PERSONALITIES, GOALS, personality, goal, deal, sentenceOf, startWords } from '../bench/core.mjs';

const SEED_MIN = 1, SEED_MAX = 999999;
const SEED_MESSAGE = 'Seed must be an integer from 1 to 999999.';
const PLAIN_PERSONALITY = 'No trait sentence.';
const NO_GOAL = 'No objective assigned (baseline).';
const JEV_NOTE = 'The model (Jev) decides for all five agents: about 200 calls, $0.01, 10-40 s.';

const randomInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const sentence = text => (/[.!?]$/.test(text) ? text : `${text}.`);
const stampOf = m => Number(String(m.id).split('-').pop()) || 0;

const seats = [];       // per seat: { personality, goal (the selects), personalityNote, goalNote (their boxes) }
const controls = [];    // every control, disabled while a match is being woven
let seedInput, seedMessage, dealButton, weaveButton, errorLine, statusNote, timer = null;

/** The sentence under a persona select, as the seat is told it. */
function personalityText(seat, key) {
  return sentenceOf(seat, key, 'personality') || PLAIN_PERSONALITY;
}

/** Redraws the two notes of one seat from its selects. */
function refreshSeat(seat) {
  const ui = seats[seat], key = ui.personality.value, gkey = ui.goal.value, said = sentenceOf(seat, gkey, 'goal');
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
  };
  seats[seat] = ui;
  controls.push(ui.personality, ui.goal);
  return h('section', { class: 'card seat', 'aria-label': `${name}'s seat` },
    h('div', { class: 'seat-title' },
      h('div', { class: 'seat-head' }, startSwatch(seat), h('h2', null, name)),
      h('div', { class: 'small muted' }, `Starting design: ${startWords(seat)}`)),
    h('div', { class: 'part' },
      h('span', { class: 'small muted' }, 'Persona'), ui.personality, ui.personalityNote),
    h('div', { class: 'part' },
      h('span', { class: 'small muted' }, 'Objective'), ui.goal, ui.goalNote));
}

/** Sets every seat's selects from a deal and redraws the notes. */
function setSeats(dealt) {
  dealt.forEach((s, seat) => {
    seats[seat].personality.value = s.personality;
    seats[seat].goal.value = s.goal;
    refreshSeat(seat);
  });
}

function dealForMe() {
  setSeats(deal(randomInt(1, 55)));
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

/** Disables or enables every control. */
function busy(on) {
  for (const c of [...controls, seedInput, dealButton, weaveButton]) c.disabled = on;
}

/** Brings the controls back and shows why the match did not run. */
function failed(message) {
  clearInterval(timer);
  busy(false);
  weaveButton.replaceChildren('Run match');
  errorLine.hidden = false;
  errorLine.replaceChildren(h('span', { style: { color: 'var(--critical)' } }, '✗ '), sentence(message));
}

/** Posts the bench, counts the seconds, then goes to the match. */
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
  let secs = 0;
  weaveButton.replaceChildren('Running…');
  clearInterval(timer);
  timer = setInterval(() => {
    secs += 1;
    weaveButton.replaceChildren(`Running… ${secs} s`);
  }, 1000);
  try {
    const res = await fetch('api/play', {
      method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ seats: bench, seed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) throw Error(data.error ?? `the server answered ${res.status}`);
    window.location.href = `match?run=play&id=${encodeURIComponent(data.id)}`;
  } catch (e) {
    failed(e instanceof TypeError ? 'Could not reach the server' : `Could not run this match: ${e.message}`);
  }
}

/** The model or chance note, from the server's status; on the published copy, which has no server, how to run a match. */
function statusLine(status) {
  if (status.static) {
    return ['This is the published copy of LoomBench, with no server behind it, so a match cannot be run from this page. To run one, get the ',
      h('a', { href: REPO }, 'source'), ' and start the server: ', h('code', null, 'node --env-file=<file with TYPESAFE_API_KEY> serve.mjs'),
      '. Without a key the server samples actions uniformly at random.'];
  }
  if (status.key) return [JEV_NOTE];
  return ['No API key on this server: actions will be sampled uniformly at random. Start the server with ',
    h('code', null, '--env-file'), ' to use the model.'];
}

/** One earlier match as a thumbnail link, its agents listed in bench order with their starting swatches. */
function thumb(m) {
  const id = encodeURIComponent(m.id);
  const order = m.bench ?? m.results.map(r => r.seat);
  return h('a', { class: 'thumb', href: `match?run=play&id=${id}` },
    h('img', { src: `runs/play/thumbs/${id}.png`, loading: 'lazy', width: 232, height: 384, alt: `Woven output, ${m.name}` }),
    h('div', { class: 'caption' }, m.name),
    order.map(seat => m.results.find(r => r.seat === seat)).filter(Boolean).map(r => h('div', { class: 'line' },
      startSwatch(r.seat, 12, 1),
      h('span', null, r.name),
      h('span', null, personality(r.personality).name),
      h('span', null, '→'),
      h('span', null, goal(r.goal).name),
      r.goal === 'none' ? null : h('span', { class: 'score' }, fmt(r.score)),
      r.goal === 'none' ? null : mark(r.reached, { short: true }))));
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
  setSeats(deal(randomInt(1, 55)));

  page.replaceChildren(
    topbar('play'),
    h('h1', null, 'Configure a match'),
    h('p', { class: 'lede' }, 'Assign a persona and an objective to each of the five agents, then run the match.'),
    h('div', { class: 'seats' }, cards),
    h('div', { class: 'row controls' },
      h('span', { class: 'small muted' }, 'Seed'), seedInput, seedMessage, dealButton, weaveButton),
    statusNote,
    errorLine);

  getJSON('api/status.json')
    .then(status => {
      statusNote.replaceChildren(...statusLine(status));
      if (status.static) weaveButton.disabled = true;
    })
    .catch(() => statusNote.replaceChildren('Could not tell whether this server has an API key.'));

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
