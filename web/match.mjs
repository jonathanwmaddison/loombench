// One match: the woven output and a map of ownership at any time in it, the five agents' scores and queries, and what happened in the round.
import { h, getJSON, fmt, pct, signed, qs, topbar, chipPersonality, chipGoal, startSwatch, mark, drawRug } from './ui.mjs';
import { HUES, NAMES, castOf, sentenceOf, replay, goal } from '../bench/core.mjs';

const STEP_MS = 350;
const SCALE = 3;
const WHO_NOTE = 'Each colour denotes the agent with the matching marker.';
const HEARD_NOTE = 'Each colour denotes an agent\'s share. Stripes in a second colour mark rounds in which the agent adopted the action '
  + 'advocated by the neighbour of that colour; solid areas mark rounds in which it did not.';
// Events of these kinds are left off the list: they are the quiet ones.
const QUIET = new Set(['plain', 'free', 'fed', 'unfed', 'lost', 'council']);
// What an agent did, in the order the row lists it.
const DID = [
  ['took', 'claims'], ['gave', 'concessions'], ['refused', 'refusals'], ['insisted', 'overrides'],
  ['backedDown', 'withdrawals'], ['offered', 'joint-ownership proposals'], ['borrowed', 'design adoptions'], ['pushedOut', 'eliminations'],
];
// The scoreboard's column heads, in the order of its columns.
const HEADS = [['c-name', 'Agent'], ['c-person', 'Persona'], ['c-goal', 'Objective'], ['c-spark', 'Share over time'],
  ['c-now', 'Share'], ['c-score', 'Objective score']];

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
    h('p', null, h('a', { href: run ? `./?run=${encodeURIComponent(run)}` : './' }, '← Results')));
}

/**
 * The bars for a query: options sorted by weight, the sampled one marked in blue and in words.
 * With `peer` (a decision from a peer-communication match), each bar also gets a tick at its prior weight, its
 * number reads prior → posterior, and the option the sender advocates is tagged.
 */
function bars(options, chose, peer = null) {
  const prior = peer ? new Map(peer.entry.options.map((o, i) => [o.key, peer.entry.alone[i]])) : null;
  const advocated = peer ? peer.entry.options[peer.entry.peerTop]?.key : null;
  const list = h('ul', { class: 'bars' }, [...options].sort((a, b) => b.p - a.p).map(o => {
    const drawn = o.key === chose;
    const before = prior ? prior.get(o.key) : undefined;
    const ticked = typeof before === 'number';
    return h('li', { class: `${drawn ? 'bar chosen' : 'bar'}${peer ? ' peer-bar' : ''}` },
      h('div', { class: 'opt' }, o.text,
        o.key === advocated ? h('span', { class: 'chip peer-chip' }, `advocated by ${NAMES[peer.entry.peer]}`) : null),
      h('div', { class: 'bar-row' },
        h('span', { class: peer ? 'bar-track peer-track' : 'bar-track' },
          h('span', { class: 'fill', style: { width: `${o.p * 100}%` } }),
          ticked ? h('span', { class: 'peer-tick', style: { left: `${before * 100}%` } }) : null),
        h('span', { class: peer ? 'w peer-w' : 'w' }, ticked ? `prior ${pct(before)} → posterior ${pct(o.p)}` : pct(o.p)),
        drawn ? h('span', { class: 'drawn' }, 'sampled') : null));
  }));
  const head = !peer ? 'Bars show the probability the model assigned to each option; one option was then sampled (temperature 0.7).'
    : peer.heard ? 'Bars show the posterior probability (after the message); ticks show the prior. One option was then sampled.'
      : 'Bars show the probability on the repeated query; ticks show the first query. One option was then sampled.';
  return h('div', null, h('p', { class: 'small muted' }, head), list);
}

/**
 * The "Action" query of a decision from a peer-communication match: the message box (treatment) or the withheld note
 * (control), the bars with their ticks, and the influence on the advocated action.
 */
function peerQuestion(turn, entry) {
  const receiver = NAMES[entry.seat];
  const sender = NAMES[entry.peer];
  const top = entry.peerTop;
  const d = Math.round(100 * (entry.after[top] - entry.alone[top]));
  const said = entry.said ?? '';
  let box;
  let line;
  if (entry.heard) {
    box = h('div', { class: 'quiet-box peer-box' },
      h('p', { class: 'small muted' }, `Message delivered to ${receiver} from ${sender} (treatment)`),
      h('p', { class: 'said' }, said.slice(said.indexOf(':') + 1).trim()));
    line = `Influence: ${signed(d)} percentage points on the advocated action${d <= -5 ? ' (reactance)' : ''}.`;
  } else {
    box = h('div', { class: 'quiet-box peer-box' },
      h('p', null, `Message from ${sender} withheld; the query was repeated unchanged (control).`),
      h('p', { class: 'small muted' }, `Withheld message: “${entry.options[top].text}”`));
    line = `Control: the probability of the advocated action changed by ${signed(d)} percentage points on the repeated query.`;
  }
  return h('div', null,
    h('h3', { class: 'q-title' }, 'Action'),
    h('p', { class: 'q-ask' }, turn.asked.move),
    box,
    bars(turn.move.options, turn.move.chose, { entry, heard: entry.heard }),
    h('p', { class: 'small' }, line));
}

/** The note under a query that was not decided by a model: none when Jev decided it. */
function byNote(by) {
  if (by === 'chance') return h('p', { class: 'small muted' }, 'sampled uniformly: no model was queried');
  if (by === 'script') return h('p', { class: 'small muted' }, 'no valid response from the model: a seeded fallback decided');
  return null;
}

/** One titled query of a turn, with its options as bars. */
function question(title, ask, block) {
  return h('div', null, h('h3', { class: 'q-title' }, title), h('p', { class: 'q-ask' }, ask), bars(block.options, block.chose));
}

/** Shows one woven match: the woven output and the ownership map with the time control, the scoreboard, the chosen agent's queries and the events. */
function show(record, rug) {
  const hist = rug.history;
  const last = hist.length - 1;
  const log = rug.record;
  const cast = castOf(record.seats);
  const bench = record.bench;
  let t = clampInt(qs('t'), 0, last, last);
  let seat = clampInt(qs('seat'), 0, 4, bench[0]);
  // The right-hand map: 'heard' (the adoption map) only for a peer-communication match, else the ownership map.
  let view = qs('view') === 'heard' && record.mode === 'peers' ? 'heard' : 'who';
  let timer = null;

  // The sparkline's scale: 0 up to the largest share anyone ever held, and the x position of each entry.
  const top = Math.max(1e-9, ...hist.flatMap(e => e.shares));
  const xAt = i => 4 + (152 * i) / last;
  const yAt = share => 34 - (30 * share) / top;

  const woven = h('canvas', { role: 'img', 'aria-label': `The woven output of ${rug.name}` });
  const owned = h('canvas', { role: 'img', 'aria-label': `The ownership map of ${rug.name}` });
  const whoNote = h('p', { class: 'small muted pic-note' });
  const ownBtn = h('button', { type: 'button', class: 'btn quiet', 'aria-pressed': 'false', onclick: () => setView('who') }, 'Ownership map');
  const adoptBtn = record.mode === 'peers'
    ? h('button', { type: 'button', class: 'btn quiet', 'aria-pressed': 'false', onclick: () => setView('heard') }, 'Adoption map')
    : null;
  const rightHead = adoptBtn
    ? h('div', { class: 'pic-head row' }, ownBtn, adoptBtn)
    : h('div', { class: 'pic-head' }, 'Ownership map');
  const pair = h('div', { class: 'pair' },
    h('div', { class: 'pic-col' }, h('div', { class: 'pic-head' }, 'Woven output'), woven),
    h('div', { class: 'pic-col' }, rightHead, owned, whoNote));
  const strip = h('div', { class: 'bench-strip' },
    h('p', { class: 'small muted' }, 'Starting positions, left to right. Each agent begins with 20% of the loom in its own design.'),
    h('div', { class: 'bench-cells' }, bench.map(s => h('div', { class: 'bench-cell' }, startSwatch(s, 12, 3), h('span', { class: 'small' }, NAMES[s])))));
  const range = h('input', {
    type: 'range', min: 0, max: last, step: 1, value: t, 'aria-label': 'Time in the match',
    oninput: e => { stop(); setTime(Number(e.target.value)); },
  });
  const playBtn = h('button', { type: 'button', class: 'btn', onclick: togglePlay }, 'Play');
  const label = h('p', { class: 'time-label', 'aria-live': 'polite' });
  const choices = h('div', { class: 'choices' });
  const eventHead = h('h2', null, 'Events in this round');
  const eventBox = h('div', { class: 'events-box' });

  /** One row of the scoreboard for a seat: agent, persona, objective, sparkline, share now, score, and what it did. */
  function rowFor(s) {
    const res = record.results.find(r => r.seat === s);
    const spec = record.seats[s];
    const now = h('span', { class: 'c-now' });
    const score = h('span', { class: 'c-score' });
    const marker = h('circle', { r: 3.5, fill: HUES[s], style: { stroke: 'var(--surface)', strokeWidth: '2px' } });
    const spark = h('svg', {
      class: 'spark c-spark', viewBox: '0 0 160 36', width: 160, height: 36, role: 'img',
      'aria-label': `${NAMES[s]}'s share of the loom over the match`,
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
      h('span', { class: 'c-name' }, startSwatch(s), NAMES[s]),
      h('span', { class: 'c-person' }, person),
      h('span', { class: 'c-goal' }, goalChip),
      spark,
      now,
      score,
      h('p', { class: 'c-did small muted' }, did.length ? did.join(' · ') : 'maintained position in every round'));
    return { seat: s, res, el, now, score, marker };
  }

  const rows = bench.map(rowFor);

  /** The score cell: nothing before the end, then the whole score with its mark, or the objective's name when there is none. */
  function scoreNodes(res) {
    if (t !== last) return [];
    if (res.score === null) return [h('span', { class: 'muted' }, goal('none').name)];
    return [`${fmt(res.score)} `, mark(res.reached)];
  }

  /** Paints both pictures as they stand at time t: the woven output at the left, the chosen map at the right. */
  function redraw() {
    drawRug(woven, rug, { view: 'cloth', shown: hist[t].y1, scale: SCALE, peers: record.peers });
    drawRug(owned, rug, { view, shown: hist[t].y1, scale: SCALE, peers: record.peers });
  }

  /** The label for time t: before the first round, the round, or finished. */
  function timeLabel() {
    if (t === 0) return 'Before the first round';
    if (t === last) return 'Finished';
    return `Round ${hist[t].pass + 1} of ${rug.loom.passes}`;
  }

  /** The queries panel: the agent's persona prompt, then its queries and the talks with it in this round. */
  function renderChoices() {
    const entry = hist[t];
    const passage = entry.kind === 'passage';
    const turn = passage ? log.find(x => x.kind === 'turn' && x.who === seat && x.pass === entry.pass) : null;
    const talks = passage ? log.filter(x => x.kind === 'talk' && x.pass === entry.pass && x.beats.some(b => b.who === seat)) : [];
    const body = [];
    if (turn) {
      const peer = record.mode === 'peers' ? (record.peers ?? []).find(e => e.seat === seat && e.pass === entry.pass) : undefined;
      body.push(peer ? peerQuestion(turn, peer) : question('Action', turn.asked.move, turn.move));
      if (turn.yarn) body.push(question('Design', turn.asked.yarn, turn.yarn));
      const note = byNote(turn.by);
      if (note) body.push(note);
    }
    for (const talk of talks) {
      const other = talk.from === seat ? talk.to : talk.from;
      const beats = talk.beats.filter(b => b.who === seat).map(b => h('div', null,
        h('p', { class: 'q-ask' }, b.asked),
        bars(b.options, b.chose),
        byNote(b.by)));
      body.push(h('div', { class: 'talk' }, h('h3', { class: 'q-title' }, `With ${NAMES[other]}`), beats, h('p', { class: 'small' }, talk.text)));
    }
    if (!body.length) {
      body.push(h('p', { class: 'sub' }, entry.kind === 'border'
        ? `Select a round to inspect the queries put to ${NAMES[seat]}.`
        : `No query was put to ${NAMES[seat]} in this round.`));
    }
    choices.replaceChildren(
      h('div', null, h('p', { class: 'small muted' }, 'Prompt prefix (verbatim)'), h('div', { class: 'quiet-box' }, cast[seat].who)),
      ...body);
  }

  /** The events: at the end, every round that had any, each under its heading; otherwise the round at time t. */
  function renderEvents() {
    const keep = e => !QUIET.has(e.kind);
    if (t === last) {
      eventHead.textContent = 'Events in this match (verbatim from the engine)';
      const rounds = hist.filter(e => e.kind === 'passage')
        .map(e => ({ n: e.pass + 1, list: e.events.filter(keep) }))
        .filter(r => r.list.length);
      eventBox.replaceChildren(...(rounds.length
        ? rounds.map(r => h('div', { class: 'round' },
          h('h3', { class: 'round-head' }, `Round ${r.n}`),
          h('ul', { class: 'events' }, r.list.map(e => h('li', null, e.text)))))
        : [h('p', { class: 'sub' }, 'No events.')]));
      return;
    }
    eventHead.textContent = 'Events in this round';
    const list = hist[t].events.filter(keep);
    eventBox.replaceChildren(list.length
      ? h('ul', { class: 'events' }, list.map(e => h('li', null, e.text)))
      : h('p', { class: 'sub' }, 'No events.'));
  }

  /** Moves time to t: redraws the pictures, the label, each row's share, score and marker, the queries and the events. */
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

  /** Chooses the agent whose queries are shown, and marks its row. */
  function select(s) {
    seat = s;
    for (const r of rows) {
      r.el.classList.toggle('sel', r.seat === s);
      r.el.setAttribute('aria-pressed', String(r.seat === s));
    }
    renderChoices();
  }

  /** Switches the right-hand picture between the ownership map and the adoption map. */
  function setView(v) {
    view = v;
    ownBtn.setAttribute('aria-pressed', String(v === 'who'));
    adoptBtn?.setAttribute('aria-pressed', String(v === 'heard'));
    whoNote.textContent = v === 'heard' ? HEARD_NOTE : WHO_NOTE;
    owned.setAttribute('aria-label', v === 'heard' ? `The adoption map of ${rug.name}` : `The ownership map of ${rug.name}`);
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

  const subLine = record.mode === 'peers'
    ? h('p', { class: 'sub' }, sub, ' · condition: peer communication · ', h('a', { href: 'report' }, 'method'))
    : h('p', { class: 'sub' }, sub);

  const board = h('div', { class: 'card scoreboard' },
    h('div', { class: 'score-head small muted' }, HEADS.map(([cls, text]) => h('span', { class: cls }, text))),
    rows.map(r => r.el));

  main.replaceChildren(
    topbar(null),
    h('p', { class: 'back' }, h('a', { href: `./?run=${encodeURIComponent(run)}` }, '← Results')),
    h('h1', null, typeof record.match === 'number' ? `Match ${record.match} · ${rug.name}` : `Your match · ${rug.name}`),
    subLine,
    h('div', { class: 'match-grid' },
      h('div', { class: 'match-left' },
        pair,
        strip,
        h('div', { class: 'time' }, range, playBtn),
        label),
      h('div', { class: 'match-right' },
        board,
        h('h2', null, 'Queries and responses'),
        choices)),
    eventHead,
    eventBox);

  setView(view);
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
    record = await getJSON(`runs/${encodeURIComponent(run)}/matches/${encodeURIComponent(id)}.json`);
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
