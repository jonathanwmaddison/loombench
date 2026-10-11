// The Play page: seat five weavers, each with a personality and a goal, then weave the match on the server and go to it.
import { h, getJSON, fmt, topbar, dot, mark } from './ui.mjs';
import { NAMES, PERSONALITIES, GOALS, personality, goal, deal, sentenceOf } from '../bench/core.mjs';

const SEED_MIN = 1, SEED_MAX = 999999;
const SEED_MESSAGE = 'The seed is a whole number from 1 to 999999.';
const PLAIN_PERSONALITY = 'Told only that they are a weaver.';
const NO_GOAL = 'Told nothing about what to achieve.';
const JEV_NOTE = 'Jev will play every weaver: about 200 calls, a cent, and 20 to 40 seconds.';

const randomInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const sentence = text => (/[.!?]$/.test(text) ? text : `${text}.`);
const stampOf = m => Number(String(m.id).split('-').pop()) || 0;

const seats = [];       // per seat: { personality, goal (the selects), personalityNote, goalNote (their boxes) }
const controls = [];    // every control, disabled while a match is being woven
let seedInput, seedMessage, dealButton, weaveButton, errorLine, statusNote, timer = null;

/** The sentence under a personality select, as the seat is told it. */
function personalityText(seat, key) {
  return sentenceOf(seat, key, 'personality') || PLAIN_PERSONALITY;
}

/** Redraws the two notes of one seat from its selects. */
function refreshSeat(seat) {
  const ui = seats[seat], key = ui.personality.value, gkey = ui.goal.value, said = sentenceOf(seat, gkey, 'goal');
  ui.personalityNote.replaceChildren(h('div', { class: 'small muted' }, personalityText(seat, key)));
  ui.goalNote.replaceChildren(
    h('div', { class: 'small' }, goal(gkey).line),
    h('div', { class: 'small muted' }, said ? `“${said}”` : NO_GOAL));
}

/** One seat card: its dot and name, a personality select with its sentence, a goal select with its line and sentence. */
function seatCard(seat) {
  const name = NAMES[seat];
  const ui = {
    personality: h('select', {
      'aria-label': `${name}'s personality`, onchange: () => refreshSeat(seat),
    }, PERSONALITIES.map(p => h('option', { value: p.key }, p.name))),
    goal: h('select', {
      'aria-label': `${name}'s goal`, onchange: () => refreshSeat(seat),
    }, GOALS.map(g => h('option', { value: g.key }, g.name))),
    personalityNote: h('div', { class: 'note' }),
    goalNote: h('div', { class: 'note' }),
  };
  seats[seat] = ui;
  controls.push(ui.personality, ui.goal);
  return h('section', { class: 'card seat', 'aria-label': `${name}'s seat` },
    h('div', { class: 'seat-head' }, dot(seat), h('h2', null, name)),
    h('div', { class: 'part' },
      h('span', { class: 'small muted' }, 'Personality'), ui.personality, ui.personalityNote),
    h('div', { class: 'part' },
      h('span', { class: 'small muted' }, 'Goal'), ui.goal, ui.goalNote));
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

/** Brings the controls back and shows why the weave did not happen. */
function failed(message) {
  clearInterval(timer);
  busy(false);
  weaveButton.replaceChildren('Weave');
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
  weaveButton.replaceChildren('Weaving…');
  clearInterval(timer);
  timer = setInterval(() => {
    secs += 1;
    weaveButton.replaceChildren(`Weaving… ${secs} s`);
  }, 1000);
  try {
    const res = await fetch('/api/play', {
      method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ seats: bench, seed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) throw Error(data.error ?? `the server answered ${res.status}`);
    window.location.href = `/match?run=play&id=${encodeURIComponent(data.id)}`;
  } catch (e) {
    failed(e instanceof TypeError ? 'Could not reach the server' : `Could not weave this bench: ${e.message}`);
  }
}

/** The Jev or chance note, from the server's status. */
function statusLine(status) {
  if (status.key) return [JEV_NOTE];
  return ['No Jev key on this server, so the weavers will choose by chance. Start it with ',
    h('code', null, '--env-file'), ' to use Jev.'];
}

/** One earlier match as a thumbnail link. */
function thumb(m) {
  const id = encodeURIComponent(m.id);
  return h('a', { class: 'thumb', href: `/match?run=play&id=${id}` },
    h('img', { src: `/runs/play/thumbs/${id}.png`, loading: 'lazy', width: 232, height: 384, alt: `The rug ${m.name}` }),
    h('div', { class: 'caption' }, m.name),
    [...m.results].sort((a, b) => a.seat - b.seat).map(r => h('div', { class: 'line' },
      dot(r.seat),
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
    h('h2', null, 'Earlier matches of yours'),
    h('div', { class: 'gallery' }, matches.map(thumb)));
}

/** Builds the page and fills it. */
async function start() {
  const page = document.getElementById('page');
  const seedStart = randomInt(1, 9999);
  dealButton = h('button', { class: 'btn quiet', type: 'button', onclick: dealForMe }, 'Deal for me');
  weaveButton = h('button', { class: 'btn', type: 'button', onclick: weave }, 'Weave');
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
    h('h1', null, 'Seat your own bench'),
    h('p', { class: 'lede' }, 'Choose who sits at the loom and what each is trying to do, then weave the rug.'),
    h('div', { class: 'seats' }, cards),
    h('div', { class: 'row controls' },
      h('span', { class: 'small muted' }, 'Seed'), seedInput, seedMessage, dealButton, weaveButton),
    statusNote,
    errorLine);

  getJSON('/api/status')
    .then(status => statusNote.replaceChildren(...statusLine(status)))
    .catch(() => statusNote.replaceChildren('Could not tell whether this server has a Jev key.'));

  getJSON('/runs/play/index.json')
    .then(index => {
      const section = earlierSection(index);
      if (section) page.append(section);
    })
    .catch(() => {});

}

start().catch(e => {
  document.getElementById('page').replaceChildren(h('p', { class: 'small' }, `This page could not start: ${e.message}.`));
});
