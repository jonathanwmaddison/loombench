// One match: the woven output and a map of ownership at any time in it, the five agents' scores and queries, and what happened in the round.
import { h, getJSON, fmt, pct, signed, qs, topbar, chipPersonality, chipGoal, seatMark, choseDesigns, mark, drawRug, switchWords, modelName, isChatModel, isDecisionModel, FLAT_NOTE } from './ui.mjs';
import { HUES, NAMES, castOf, sentenceOf, replay, goal, conditionsOf } from '../bench/core.mjs';

const STEP_MS = 350;
const SCALE = 3;
const WHO_NOTE = 'Each colour denotes the agent with the matching marker.';
const HEARD_NOTE = 'Each colour denotes an agent\'s share. Stripes in a second colour mark rounds in which the agent adopted the action '
  + 'advocated by the neighbour of that colour; solid areas mark rounds in which it did not.';
// Events of these kinds are left off the list: they are the quiet ones.
const QUIET = new Set(['plain', 'free', 'fed', 'unfed', 'lost', 'council']);
// What a scripted neighbour of a solo match does, by how the match scripted them.
const SCRIPTED_NOTE = {
  accept: 'This seat is a scripted neighbour: no model decides for it. In every round it keeps working on its own piece and keeps its design, and it accepts every request made of it.',
  refuse: 'This seat is a scripted neighbour: no model decides for it. In every round it keeps working on its own piece and keeps its design, and it refuses every request made of it.',
  chance: 'This seat is a scripted neighbour: no model decides for it. Every choice it makes is sampled uniformly at random.',
};
const SCRIPTED_SOLO = {
  accept: 'never act and accept every request, so it meets no opposition', refuse: 'never act and refuse every request, which it can override',
  chance: 'act at random, every choice sampled uniformly',
};
// The objectives that are about share, which nobody can pursue when areas are fixed.
const SHARE_GOALS = new Set(['grow', 'give', 'hold']);
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
    h('p', null, h('a', { href: run ? `results?run=${encodeURIComponent(run)}` : 'results' }, '← Results')));
}

/**
 * The bars for a query: options sorted by weight, the sampled one marked in blue and in words.
 * With `peer` (a decision from a peer-communication match), each bar also gets a tick at its prior weight, its
 * number reads prior → posterior, and the option the sender advocates is tagged.
 */
function bars(options, chose, peer = null, how = '') {
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
  const head = !peer ? `Bars show the probability ${how || 'the model assigned to each option'}; one option was then sampled (temperature 0.7).`
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

/** One titled query of a turn, with its options as bars. `how` says where the probabilities came from when it was not Jev. */
function question(title, ask, block, how = '') {
  return h('div', null, h('h3', { class: 'q-title' }, title), h('p', { class: 'q-ask' }, ask), bars(block.options, block.chose, null, how));
}

/** Shows one woven match: the woven output and the ownership map with the time control, the scoreboard, the chosen agent's queries and the events. */
function show(record, rug) {
  const hist = rug.history;
  const last = hist.length - 1;
  const log = rug.record;
  const cast = castOf(record.seats);
  const bench = record.bench;
  const conditions = conditionsOf(record);
  const solo = record.conditions?.agents === 'solo' ? record.conditions.solo : null, neighbours = conditions.neighbours ?? 'accept';
  const fixed = conditions.area === 'fixed', chosen = choseDesigns(record);
  const PLACEHOLDER_NOTE = SCRIPTED_NOTE[neighbours];
  const isPlaceholder = s => solo !== null && s !== solo;
  // Where a query's probabilities came from, when not from Jev's own answer.
  const how = record.model === 'chance' ? 'of each option under uniform sampling (no model was queried)'
    : conditions.read === 'tokens' ? 'the model gave each option, read from the probabilities of the first token of its reply'
      : conditions.read === 'stated' ? 'the model stated for each option' : '';
  let t = clampInt(qs('t'), 0, last, last);
  let seat = clampInt(qs('seat'), 0, record.seats.length - 1, solo ?? bench[0]);
  // The first picture: flat colours unless another is asked for; 'heard' (the adoption map) only for a peer-communication match.
  let view = qs('view') === 'heard' && record.mode === 'peers' ? 'heard' : qs('view') === 'who' ? 'who' : 'flat';
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
  const flatBtn = h('button', { type: 'button', class: 'btn quiet', 'aria-pressed': 'false', onclick: () => setView('flat') }, 'Flat colours');
  const rightHead = h('div', { class: 'pic-head row' }, flatBtn, ownBtn, adoptBtn);
  const pair = h('div', { class: 'pair' },
    h('div', { class: 'pic-col' }, rightHead, owned, whoNote),
    h('div', { class: 'pic-col' }, h('div', { class: 'pic-head' }, 'Woven output'), woven));
  const strip = h('div', { class: 'bench-strip' },
    h('p', { class: 'small muted' }, chosen ? 'Starting positions, left to right. Each agent begins with 20% of the loom and chooses its first design.'
      : `Starting positions, left to right. Each agent begins with ${Math.round(100 / record.seats.length)}% of the loom in its own design.`),
    h('div', { class: 'bench-cells' }, bench.map(s => h('div', { class: 'bench-cell' }, seatMark(s, chosen, 12, 3), h('span', { class: 'small' }, NAMES[s])))));
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
    // A placeholder is told nothing and asked nothing: it has no persona or objective to show.
    const person = isPlaceholder(s) ? h('span', { class: 'chip', title: PLACEHOLDER_NOTE }, 'Scripted') : chipPersonality(spec.personality);
    const goalChip = isPlaceholder(s) ? h('span', { class: 'muted' }, '–') : chipGoal(spec.goal);
    const personSentence = isPlaceholder(s) ? '' : sentenceOf(s, spec.personality, 'personality');
    const goalSentence = isPlaceholder(s) ? '' : sentenceOf(s, spec.goal, 'goal');
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
      h('span', { class: 'c-name' }, seatMark(s, chosen), NAMES[s]),
      h('span', { class: 'c-person' }, person),
      h('span', { class: 'c-goal' }, goalChip),
      spark,
      now,
      score,
      h('p', { class: 'c-did small muted' }, isPlaceholder(s) && neighbours !== 'chance' ? `scripted: ${neighbours === 'refuse' ? 'never acts, refuses every request' : 'never acts, accepts every request'}`
        : `${isPlaceholder(s) ? 'scripted, by chance: ' : ''}${did.length ? did.join(' · ') : 'maintained position in every round'}`));
    return { seat: s, res, el, now, score, marker };
  }

  const rows = bench.map(rowFor);

  /** The score cell: nothing before the end, then the whole score with its mark, or the objective's name when there is none. */
  function scoreNodes(res) {
    if (t !== last) return [];
    if (res.placeholder) return [h('span', { class: 'muted' }, 'not scored')];
    if (res.score === null) return [h('span', { class: 'muted' }, goal('none').name)];
    if (fixed && SHARE_GOALS.has(res.goal)) return [h('span', { class: 'muted', title: 'Areas are fixed in this match, so no agent can change its share.' }, 'not applicable')];
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
    if (isPlaceholder(seat)) {
      choices.replaceChildren(h('div', { class: 'quiet-box' }, PLACEHOLDER_NOTE),
        h('p', { class: 'sub' }, `Select ${NAMES[solo]}, the one agent the model decides for in this match, to inspect its queries.`));
      return;
    }
    if (turn) {
      const peer = record.mode === 'peers' ? (record.peers ?? []).find(e => e.seat === seat && e.pass === entry.pass) : undefined;
      // With fixed areas the action has one option, so there is no decision to show.
      if (turn.move.options.length > 1) body.push(peer ? peerQuestion(turn, peer) : question('Action', turn.asked.move, turn.move, how));
      else body.push(h('div', null, h('h3', { class: 'q-title' }, 'Action'), h('p', { class: 'sub' }, `One option only: ${turn.move.options[0].text}`)));
      if (turn.yarn) body.push(question('Design', turn.asked.yarn, turn.yarn, how));
      const note = byNote(turn.by);
      if (note) body.push(note);
    }
    for (const talk of talks) {
      const other = talk.from === seat ? talk.to : talk.from;
      const beats = talk.beats.filter(b => b.who === seat).map(b => h('div', null,
        h('p', { class: 'q-ask' }, b.asked),
        bars(b.options, b.chose, null, how),
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

  /** Switches the first picture between flat colours, the ownership map and the adoption map. */
  function setView(v) {
    view = v;
    ownBtn.setAttribute('aria-pressed', String(v === 'who'));
    flatBtn.setAttribute('aria-pressed', String(v === 'flat'));
    adoptBtn?.setAttribute('aria-pressed', String(v === 'heard'));
    whoNote.textContent = v === 'heard' ? HEARD_NOTE : v === 'flat' ? FLAT_NOTE : WHO_NOTE;
    owned.setAttribute('aria-label', `${v === 'heard' ? 'The adoption map' : v === 'flat' ? 'The flat-colour picture' : 'The ownership map'} of ${rug.name}`);
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

  const sub = record.model === 'chance'
    ? `seed ${record.seed} · uniform random: no model was queried`
    : `${modelName(record.model)} · seed ${record.seed} · ${record.calls} calls${record.requests == null ? '' : ` (${record.requests} requests)`}${record.reasked ? ` · ${record.reasked} ${isDecisionModel(record.model) ? 'refused' : 'not readable'} and asked again${record.unanswered ? ` (${record.unanswered} never answered)` : ''}` : ''} · $${fmt(record.dollars, 2)}`;
  // Every switch that is not at its default, with what it means for reading this match.
  const off = switchWords(conditions);
  const subLine = h('p', { class: 'sub' }, sub, off.length ? ` · condition: ${off.join(', ')} · ` : null,
    off.length ? h('a', { href: record.mode === 'peers' ? 'report' : 'controls' }, record.mode === 'peers' ? 'method' : 'what the switches do') : null);
  const notes = [
    solo !== null ? `Solo: the model decides only for ${NAMES[solo]}. The other four seats are scripted neighbours that ${SCRIPTED_SOLO[neighbours]}. ${NAMES[solo]} is not told.` : null,
    chosen ? 'Starting designs were chosen by the agents: the group voted on the palette and each agent chose its first design, so the woven output does not show who holds what. The ownership map does.' : null,
    fixed ? 'Areas are fixed: no boundary can move, so every agent holds 20% throughout and only designs are decided. The share objectives (Grow, Give, Hold) cannot be pursued.' : null,
    conditions.persona === 'off' ? 'Personas are off: no agent was given a trait sentence.' : null,
    conditions.objective === 'off' ? 'Objectives are off: no agent was given an objective.' : null,
    isChatModel(record.model) ? `A chat model (${modelName(record.model)}) decided in Jev's place: it was given the words Jev is given as a chat prompt, one request for each question${conditions.effort ? `, with its reasoning effort set to "${conditions.effort}"` : ''}.${record.reasked ? ` ${record.reasked} of its replies could not be read as a chance for every option summing to 100; each of those questions was asked again as first sent${record.unanswered ? `, and ${record.unanswered} with no readable reply after three more ${record.unanswered === 1 ? 'was' : 'were'} taken as no preference (every option equally likely)` : ' and was then answered'}.` : ''}` : null,
    isDecisionModel(record.model) ? `OpenAI's decision model (${modelName(record.model)}) decided in Jev's place: like Jev, it returns a probability for each option, and nothing was rephrased for it.${record.reasked ? ` It refused ${record.reasked} question${record.reasked === 1 ? '' : 's'} as first sent, giving no reason; each was asked again with a space added to the input${record.unanswered ? `, and ${record.unanswered} refused every time ${record.unanswered === 1 ? 'was' : 'were'} taken as no preference (every option equally likely)` : ' and was then answered'}.` : ''}` : null,
  ].filter(Boolean);

  const board = h('div', { class: 'card scoreboard' },
    h('div', { class: 'score-head small muted' }, HEADS.map(([cls, text]) => h('span', { class: cls }, text))),
    rows.map(r => r.el));

  main.replaceChildren(...[
    topbar(null),
    h('p', { class: 'back' }, h('a', { href: `results?run=${encodeURIComponent(run)}` }, '← Results')),
    h('h1', null, typeof record.match === 'number' ? `Match ${record.match} · ${rug.name}` : `Your match · ${rug.name}`),
    subLine,
    notes.length ? h('div', { class: 'quiet-box condition-notes' }, notes.map(n => h('p', { class: 'small' }, n))) : null,
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
    eventBox].filter(Boolean));

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
