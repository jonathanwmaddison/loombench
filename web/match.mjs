// One match: the rug at any time in it, the five weavers' scores and choices, and what happened in the round.
import { h, getJSON, fmt, pct, qs, topbar, chipPersonality, chipGoal, dot, mark, drawRug } from './ui.mjs';
import { HUES, NAMES, castOf, sentenceOf, replay } from '../bench/core.mjs';

const STEP_MS = 350;
const SCALE = 3;
// Events of these kinds are left off the list: they are the quiet ones.
const QUIET = new Set(['plain', 'free', 'fed', 'unfed', 'lost', 'council']);
// What a weaver did, in the order the row lists it.
const DID = [
  ['took', 'took space'], ['gave', 'gave space'], ['refused', 'said no'], ['insisted', 'insisted'],
  ['backedDown', 'backed down'], ['offered', 'offered to share'], ['borrowed', 'borrowed'], ['pushedOut', 'pushed out'],
];
// The scoreboard's column heads, in the order of its columns.
const HEADS = [['c-name', 'Weaver'], ['c-person', 'Personality'], ['c-goal', 'Goal'], ['c-spark', 'Space over time'],
  ['c-now', 'Now'], ['c-score', 'Score']];

const main = document.querySelector('main');
const run = qs('run');
const id = qs('id');

/** An integer from the address, clamped to lo..hi; the fallback when it is missing or not a whole number. */
function clampInt(text, lo, hi, fallback) {
  const n = text === null ? NaN : Number(text);
  return Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/** The page's sentence about what is wrong, with a link back to Results. */
function fail(sentence) {
  main.replaceChildren(
    topbar(null),
    h('h1', null, 'One match'),
    h('p', { class: 'lede' }, sentence),
    h('p', null, h('a', { href: run ? `/?run=${encodeURIComponent(run)}` : '/' }, '← Results')));
}

/** The bars for a question: options sorted by weight, the drawn one marked in blue and in words. */
function bars(options, chose) {
  const list = h('ul', { class: 'bars' }, [...options].sort((a, b) => b.p - a.p).map(o => {
    const drawn = o.key === chose;
    return h('li', { class: drawn ? 'bar chosen' : 'bar' },
      h('div', { class: 'opt' }, o.text),
      h('div', { class: 'bar-row' },
        h('span', { class: 'bar-track' }, h('span', { class: 'fill', style: { width: `${o.p * 100}%` } })),
        h('span', { class: 'w' }, pct(o.p)),
        drawn ? h('span', { class: 'drawn' }, 'chosen') : null));
  }));
  return h('div', null, h('p', { class: 'small muted' }, 'The bar is the weight the model gave each option; one was then drawn.'), list);
}

/** The note under a question that was not decided by a model: none when Jev decided it. */
function byNote(by) {
  if (by === 'chance') return h('p', { class: 'small muted' }, 'decided by chance: no model was asked');
  if (by === 'script') return h('p', { class: 'small muted' }, 'the model did not answer, so code decided');
  return null;
}

/** One titled question of a turn, with its options as bars. */
function question(title, ask, block) {
  return h('div', null, h('h3', { class: 'q-title' }, title), h('p', { class: 'q-ask' }, ask), bars(block.options, block.chose));
}

/** Shows one woven match: the rug with its time control, the scoreboard, the chosen weaver's questions and the events. */
function show(record, rug) {
  const hist = rug.history;
  const last = hist.length - 1;
  const log = rug.record;
  const cast = castOf(record.seats);
  const bench = record.bench;
  let t = clampInt(qs('t'), 0, last, last);
  let seat = clampInt(qs('seat'), 0, 4, bench[0]);
  let view = 'cloth';
  let timer = null;

  // The sparkline's scale: 0 up to the largest share anyone ever held, and the x position of each entry.
  const top = Math.max(1e-9, ...hist.flatMap(e => e.shares));
  const xAt = i => 4 + (152 * i) / last;
  const yAt = share => 34 - (30 * share) / top;

  const canvas = h('canvas', { role: 'img', 'aria-label': `The rug ${rug.name}` });
  const whoNote = h('p', { class: 'small muted' }, 'Each colour is the weaver with that dot.');
  whoNote.hidden = true;
  const cloth = h('button', { type: 'button', class: 'btn quiet', 'aria-pressed': 'true', onclick: () => setView('cloth') }, 'The rug');
  const who = h('button', { type: 'button', class: 'btn quiet', 'aria-pressed': 'false', onclick: () => setView('who') }, 'Who holds what');
  const range = h('input', {
    type: 'range', min: 0, max: last, step: 1, value: t, 'aria-label': 'Time in the match',
    oninput: e => { stop(); setTime(Number(e.target.value)); },
  });
  const playBtn = h('button', { type: 'button', class: 'btn', onclick: togglePlay }, 'Play');
  const label = h('p', { class: 'time-label', 'aria-live': 'polite' });
  const choices = h('div', { class: 'choices' });
  const eventHead = h('h2', null, 'What happened in this round');
  const eventBox = h('div', { class: 'events-box' });

  /** One row of the scoreboard for a seat: name, personality, goal, sparkline, share now, score, and what it did. */
  function rowFor(s) {
    const res = record.results.find(r => r.seat === s);
    const spec = record.seats[s];
    const now = h('span', { class: 'c-now' });
    const score = h('span', { class: 'c-score' });
    const marker = h('circle', { r: 3.5, fill: HUES[s], style: { stroke: 'var(--surface)', strokeWidth: '2px' } });
    const spark = h('svg', {
      class: 'spark c-spark', viewBox: '0 0 160 36', width: 160, height: 36, role: 'img',
      'aria-label': `${NAMES[s]}'s share of the loom over the rug`,
    },
      h('line', { x1: 0, x2: 160, y1: 34.5, y2: 34.5, 'stroke-width': 1, style: { stroke: 'var(--hairline)' } }),
      h('polyline', {
        points: hist.map((e, i) => `${xAt(i)},${yAt(e.shares[s])}`).join(' '),
        fill: 'none', stroke: HUES[s], 'stroke-width': 2, 'stroke-linejoin': 'round',
      }),
      marker);
    const did = DID.filter(([k]) => res.did[k] > 0).map(([k, label]) => `${label} ${res.did[k]}`);
    const person = chipPersonality(spec.personality);
    const goalChip = chipGoal(spec.goal);
    const personSentence = sentenceOf(s, spec.personality, 'personality');
    const goalSentence = sentenceOf(s, spec.goal, 'goal');
    if (personSentence) person.title = personSentence;
    if (goalSentence) goalChip.title = goalSentence;
    const el = h('div', {
      class: s === seat ? 'score-row sel' : 'score-row', role: 'button', tabindex: 0,
      'aria-pressed': String(s === seat),
      onclick: () => select(s),
      onkeydown: e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select(s);
        }
      },
    },
      h('span', { class: 'c-name' }, dot(s), NAMES[s]),
      h('span', { class: 'c-person' }, person),
      h('span', { class: 'c-goal' }, goalChip),
      spark,
      now,
      score,
      h('p', { class: 'c-did small muted' }, did.length ? did.join(' · ') : 'kept working every round'));
    return { seat: s, res, el, now, score, marker };
  }

  const rows = bench.map(rowFor);

  /** The score cell: nothing before the end, then the whole score with its mark, or "No goal". */
  function scoreNodes(res) {
    if (t !== last) return [];
    if (res.score === null) return [h('span', { class: 'muted' }, 'No goal')];
    return [`Score ${fmt(res.score)} `, mark(res.reached)];
  }

  /** Paints the rug as it stands at time t, in the chosen view. */
  function redraw() {
    drawRug(canvas, rug, { view, shown: hist[t].y1, scale: SCALE });
  }

  /** The label for time t: before the first round, the round, or finished. */
  function timeLabel() {
    if (t === 0) return 'Before the first round';
    if (t === last) return 'Finished';
    return `Round ${hist[t].pass + 1} of ${rug.loom.passes}`;
  }

  /** The choices panel: the weaver's words, then its questions and the talks with it in this round. */
  function renderChoices() {
    const entry = hist[t];
    const passage = entry.kind === 'passage';
    const turn = passage ? log.find(x => x.kind === 'turn' && x.who === seat && x.pass === entry.pass) : null;
    const talks = passage ? log.filter(x => x.kind === 'talk' && x.pass === entry.pass && x.beats.some(b => b.who === seat)) : [];
    const nodes = [h('div', { class: 'quiet-box' }, cast[seat].who)];
    if (turn) {
      nodes.push(question('What to do', turn.asked.move, turn.move));
      if (turn.yarn) nodes.push(question('Which design', turn.asked.yarn, turn.yarn));
      const note = byNote(turn.by);
      if (note) nodes.push(note);
    }
    for (const talk of talks) {
      const other = talk.from === seat ? talk.to : talk.from;
      const beats = talk.beats.filter(b => b.who === seat).map(b => h('div', null,
        h('p', { class: 'q-ask' }, b.asked),
        bars(b.options, b.chose),
        byNote(b.by)));
      nodes.push(h('div', { class: 'talk' }, h('h3', { class: 'q-title' }, `With ${NAMES[other]}`), beats, h('p', { class: 'small' }, talk.text)));
    }
    if (nodes.length === 1) {
      nodes.push(h('p', { class: 'sub' }, entry.kind === 'border'
        ? `Move the slider to a round to see what ${NAMES[seat]} was asked.`
        : `Nothing was asked of ${NAMES[seat]} here.`));
    }
    choices.replaceChildren(...nodes);
  }

  /** The events: at the end, every round that had any, each under its heading; otherwise the round at time t. */
  function renderEvents() {
    const keep = e => !QUIET.has(e.kind);
    if (t === last) {
      eventHead.textContent = 'What happened in this match';
      const rounds = hist.filter(e => e.kind === 'passage')
        .map(e => ({ n: e.pass + 1, list: e.events.filter(keep) }))
        .filter(r => r.list.length);
      eventBox.replaceChildren(...(rounds.length
        ? rounds.map(r => h('div', { class: 'round' },
          h('h3', { class: 'round-head' }, `Round ${r.n}`),
          h('ul', { class: 'events' }, r.list.map(e => h('li', null, e.text)))))
        : [h('p', { class: 'sub' }, 'A quiet match.')]));
      return;
    }
    eventHead.textContent = 'What happened in this round';
    const list = hist[t].events.filter(keep);
    eventBox.replaceChildren(list.length
      ? h('ul', { class: 'events' }, list.map(e => h('li', null, e.text)))
      : h('p', { class: 'sub' }, 'A quiet round.'));
  }

  /** Moves time to t: redraws the rug, the label, each row's share, score and dot, the choices and the events. */
  function setTime(v) {
    t = v;
    range.value = String(t);
    label.textContent = timeLabel();
    redraw();
    for (const r of rows) {
      const share = hist[t].shares[r.seat];
      r.now.textContent = `${pct(share)} of the loom`;
      r.score.replaceChildren(...scoreNodes(r.res));
      r.marker.setAttribute('cx', xAt(t));
      r.marker.setAttribute('cy', yAt(share));
    }
    renderChoices();
    renderEvents();
  }

  /** Chooses the weaver whose questions are shown, and marks its row. */
  function select(s) {
    seat = s;
    for (const r of rows) {
      r.el.classList.toggle('sel', r.seat === s);
      r.el.setAttribute('aria-pressed', String(r.seat === s));
    }
    renderChoices();
  }

  /** Switches between the rug and the picture of who holds what. */
  function setView(v) {
    view = v;
    cloth.setAttribute('aria-pressed', String(v === 'cloth'));
    who.setAttribute('aria-pressed', String(v === 'who'));
    whoNote.hidden = v !== 'who';
    redraw();
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    playBtn.textContent = 'Play';
  }

  /** Plays the time forward a step at a time, or pauses it. */
  function togglePlay() {
    if (timer !== null) {
      stop();
      return;
    }
    if (t === last) setTime(0);
    playBtn.textContent = 'Pause';
    timer = setInterval(() => {
      setTime(t + 1);
      if (t === last) stop();
    }, STEP_MS);
  }

  const sub = record.minds === 'chance'
    ? `seed ${record.seed} · woven by chance: no model was asked`
    : `${record.model} · seed ${record.seed} · ${record.calls} calls · $${fmt(record.dollars, 2)}`;

  const board = h('div', { class: 'card scoreboard' },
    h('div', { class: 'score-head small muted' }, HEADS.map(([cls, text]) => h('span', { class: cls }, text))),
    rows.map(r => r.el));

  main.replaceChildren(
    topbar(null),
    h('p', { class: 'back' }, h('a', { href: `/?run=${encodeURIComponent(run)}` }, '← Results')),
    h('h1', null, typeof record.match === 'number' ? `Match ${record.match} · ${rug.name}` : `Your match · ${rug.name}`),
    h('p', { class: 'sub' }, sub),
    h('div', { class: 'match-grid' },
      h('div', { class: 'match-left' },
        h('div', { class: 'card rug-card' }, canvas),
        h('div', { class: 'row toggle' }, cloth, who),
        whoNote,
        h('div', { class: 'time' }, range, playBtn),
        label),
      h('div', { class: 'match-right' },
        board,
        h('h2', null, 'Their choices'),
        choices)),
    eventHead,
    eventBox);

  setTime(t);
}

/** Loads the record and weaves the match back from it, then shows it. */
async function start() {
  if (!run || !id) {
    fail('This page needs a run and a match, for example /match?run=chance&id=m003.');
    return;
  }
  let record;
  try {
    record = await getJSON(`/runs/${encodeURIComponent(run)}/matches/${encodeURIComponent(id)}.json`);
  } catch (e) {
    fail(`Match ${id} of run ${run} could not be loaded (${e.message}).`);
    return;
  }
  let rug;
  try {
    rug = await replay(record);
  } catch (e) {
    fail(`Match ${id} could not be woven again from its record (${e.message}).`);
    return;
  }
  show(record, rug);
}

main.replaceChildren(h('p', { class: 'sub' }, 'Loading…'));
start().catch(e => fail(`This page could not be shown (${e.message}).`));
