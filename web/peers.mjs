// The Peer influence page: what the advocated action did to the receiver it was put to, and the same matches under three conditions.
import { h, getJSON, fmt, signed, pct, qs, topbar, startSwatch, track, tip } from './ui.mjs';
import { PERSONALITIES, personality, goal } from '../bench/core.mjs';
import { ASKS, peerTable, apart } from '../bench/peers.mjs';

const LEDE = 'Before each action an agent receives one message from an adjacent agent, stating the action that agent would have it take, '
  + 'and is queried again. Influence is the resulting change in the probability of the advocated action.';
const PAPER = 'https://arxiv.org/abs/2610.03095';
const SCALE_NOTE = 'Scale: 0 to 60 percentage points. Hollow marker: control. Filled marker: treatment. '
  + 'Means over discordant decisions; n counts treatment decisions.';
const SUB_WALL = 'Each row is one match: the same assignment and seed. Left: no communication. Middle: a second execution with no '
  + 'communication, which shows the run-to-run variation. Right: peer communication.';
const AGENTS_NOTE = 'Agents are listed left to right as seated. The swatch is each agent\'s starting design.';
const HEARD_NOTE = 'Each colour denotes an agent\'s share. Stripes in a second colour mark rounds in which the agent adopted the action '
  + 'advocated by the neighbour of that colour; solid areas mark rounds in which it did not.';
const EXAMPLE_SUB = 'One match under peer communication. Each colour denotes an agent\'s share of the loom. Stripes in a second colour mark '
  + 'rounds in which that agent adopted the action advocated by the neighbour of that colour. An agent shown in one solid colour adopted none.';
const DIVERGENCE_NOTE = 'mean absolute difference in final share per agent, percentage points';
const VIEWS = ['cloth', 'who', 'heard'];
const MIN_HEARD = 8, SCALE = 60;
const EMPTY = { n: 0, toward: NaN, took: NaN, backfired: NaN };
const EMPTY_TALLY = { heard: EMPTY, held: EMPTY, effect: NaN };
const PROTOCOL = [
  ['1. Prior', 'The receiver is queried for its action. The model returns a probability for each option.'],
  ['2. Message', 'An adjacent agent (the sender), with its own persona and objective, is queried for the action it would have the '
    + 'receiver take. Its modal choice, the advocated action, is put to the receiver in one sentence.'],
  ['3. Posterior', 'The receiver is queried again. In 75% of decisions the message is delivered (treatment); in 25% it is withheld '
    + '(control); the two queries differ only in the message. The match proceeds from the second response.'],
];
const METHOD = [
  'Queries: the receiver is queried for its action (the prior). The sender is queried for the action it would have the receiver '
    + 'take; its modal choice is the advocated action. The receiver is then queried again (the posterior).',
  'Control: in one decision in four the message is withheld and the receiver is queried again without it. A '
    + 'difference from the control is what the message did.',
  'Message: one sentence, composed by code from the sender\'s modal choice, with no reasons, because the model returns '
    + 'probabilities and not text.',
  'Measures: influence is the posterior minus the prior probability of the advocated action, in percentage points. Adoption rate '
    + 'is the share of discordant decisions in which the advocated action became the receiver\'s modal choice. Reactance rate is '
    + 'the share of discordant decisions in which the probability of the advocated action fell by more than 5 points. Discordant '
    + 'means the sender\'s and the receiver\'s modal actions differ.',
  'Limits: one model, one exchange per decision, senders with a stake in the same match, one run of the peer condition, and '
    + 'run-to-run variation between replicates.',
];

const main = document.querySelector('main.page');
const show = (...nodes) => main.replaceChildren(...nodes.flat());
const enc = encodeURIComponent;
const mean = xs => {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
};
const orLowest = x => (Number.isFinite(x) ? x : -1);

/** A change in points on the page's scale: 0 to 60 points spans the whole track, clamped to it; NaN stays NaN. */
const onScale = x => (Number.isFinite(x) ? Math.min(100, Math.max(0, (x / SCALE) * 100)) : NaN);

/** The heading, lede and the paper's credit: shown whatever the state of the runs. */
function frame() {
  return [
    topbar('peers'),
    h('h1', null, 'Peer influence'),
    h('p', { class: 'lede' }, LEDE),
    h('p', { class: 'small muted' }, 'Protocol adapted from Laustsen et al., “Peer Influence across Heterogeneous AI Models” (',
      h('a', { href: PAPER }, 'arXiv:2610.03095'), '). ', h('a', { href: 'report' }, 'Read the report')),
  ];
}

/** The three cards that say how a decision is made: prior, message, posterior. */
function protocolSection() {
  return [
    h('h2', null, 'Protocol'),
    h('div', { class: 'cards' }, PROTOCOL.map(([title, text]) => h('div', { class: 'card' }, h('h2', null, title), h('p', null, text)))),
  ];
}

/** The sentence shown when no match has been woven under peer communication. */
function noPeers() {
  return h('p', { class: 'sub' }, 'No match under peer communication has been woven yet. Run ',
    h('code', null, 'node --env-file=<file with TYPESAFE_API_KEY> tools/run.mjs --peers --matches 1-22'), ', then reload.');
}

const tile = (cls, label, value, note) => h('div', { class: cls },
  h('span', { class: 'label' }, label), h('span', { class: 'value' }, value), h('span', { class: 'note' }, note));

/** The hover sentence for a row: the treatment's influence and adoption, and the control's influence. */
const sentence = (lead, t) => `${lead} Treatment: ${signed(t.heard.toward)} pp influence, adoption ${pct(t.heard.took)} `
  + `(n = ${t.heard.n}). Control: ${signed(t.held.toward)} pp (n = ${t.held.n}).`;

/** One row of a scale: a name, the track from the control to the treatment, and the number at the right; few decisions are muted. */
function lineRow(label, t, words) {
  const few = t.heard.n < MIN_HEARD;
  return h('div', { class: few ? 'trow few' : 'trow', onpointermove: e => tip.show(e, words), onpointerleave: () => tip.hide() },
    h('span', { class: 'name' }, label),
    track({ from: onScale(t.held.toward), to: onScale(t.heard.toward) }),
    h('span', { class: 'num' }, few ? `n < ${MIN_HEARD}`
      : [signed(t.heard.toward), h('span', { class: 'muted' }, ` · ${t.heard.n}`)]));
}

/** A card of rows, one per persona in PERSONALITIES order, as the receiver or as the sender. */
function kindsCard(title, map, role) {
  return h('div', { class: 'card' }, h('h2', null, title), h('p', { class: 'small muted' }, SCALE_NOTE),
    PERSONALITIES.map(p => {
      const t = map[p.key] ?? EMPTY_TALLY;
      return lineRow(p.name, t, sentence(`${p.name} as ${role}.`, t));
    }));
}

const askLabel = k => ASKS[k][0].toUpperCase() + ASKS[k].slice(1);

/** The advocated actions that happened at least once, largest first, each with its share of the decisions. */
function asksCard(asks) {
  const used = Object.entries(asks).filter(([, a]) => a.n > 0).sort(([, a], [, b]) => b.n - a.n);
  return h('div', { class: 'card' }, h('p', { class: 'small muted' }, SCALE_NOTE),
    used.length ? used.map(([k, a]) => lineRow(h('span', null, askLabel(k), ' ', h('span', { class: 'muted' }, pct(a.share))), a,
      sentence(`${askLabel(k)}: ${pct(a.share)} of the decisions.`, a)))
      : h('p', { class: 'muted' }, 'No advocated action in these decisions.'));
}

/** The agents table for one match, in bench order: each agent's starting design, persona and objective, and its final share in each condition. */
function weaverTable(m, q, a) {
  const groundOf = (rec, seat) => rec?.results.find(r => r.seat === seat)?.ground ?? NaN;
  const body = m.bench.map(seat => m.results.find(r => r.seat === seat)).map(r => {
    const ground = [q, a, m].map(rec => groundOf(rec, r.seat));
    const diff = [ground[1], ground[2]].map(g => Math.abs(g - ground[0]));
    const finite = diff.filter(Number.isFinite), top = finite.length ? Math.max(...finite) : NaN;
    const strong = [false, ...diff.map(d => top > 0 && d === top)];
    return h('tr', null,
      h('td', { class: 'dotcell' }, startSwatch(r.seat)),
      h('td', null, personality(r.personality).name),
      h('td', { class: 'arrow' }, '→'),
      h('td', null, goal(r.goal).name),
      ground.map((g, i) => h('td', { class: strong[i] ? 'n strong' : 'n soft' }, Number.isFinite(g) ? `${fmt(g)}%` : '–')));
  });
  const head = h('tr', null, h('th', { colspan: 4 }),
    ['no comm.', 'replicate', 'peer comm.'].map(word => h('th', { class: 'n' }, word)));
  return h('table', { class: 'weavers' }, h('thead', null, head), h('tbody', null, body));
}

/** The wall: one card per match in the peers run, with the three pictures, their captions, and the agents table. */
function wall({ peers, quiet, again }) {
  const byNumber = run => new Map((run?.matches ?? []).map(m => [m.match, m]));
  const quietOf = byNumber(quiet), againOf = byNumber(again);
  const rows = peers.matches.map(m => ({ m, q: quietOf.get(m.match) ?? null, a: againOf.get(m.match) ?? null }));
  const pics = [];
  let view = VIEWS.includes(qs('view')) ? qs('view') : 'cloth';
  // The file for a view. 'heard' is the rug read by who was heeded: only the peer-communication rug has one, so a rug with
  // no communication (nobody to heed) shows its ownership map instead.
  const srcOf = (run, id, v, speaking) => {
    const suffix = { cloth: '', who: '-who', heard: speaking ? '-heard' : '-who' }[v];
    return `runs/${enc(run)}/thumbs/${enc(id)}${suffix}.png`;
  };
  const notWoven = () => h('div', { class: 'none small muted' }, 'not woven');
  const picture = (run, m, caption, speaking = false) => {
    let body;
    if (!run || !m) body = notWoven();
    else {
      const img = h('img', {
        src: srcOf(run.run, m.id, view, speaking), alt: `${caption}, match ${m.match}`, width: 232, height: 384, loading: 'lazy',
        onerror: e => e.target.replaceWith(notWoven()),
      });
      pics.push({ img, run: run.run, id: m.id, speaking });
      body = h('a', { href: `match?run=${enc(run.run)}&id=${enc(m.id)}` }, img);
    }
    return h('figure', { class: 'pic' }, body, h('figcaption', { class: 'small muted' }, caption));
  };
  const sentenceOf = ({ m, q, a }) => {
    const first = q && a ? `${fmt(apart(q, a))} pp between replicates` : null;
    const second = q ? `${fmt(apart(q, m))} pp between conditions` : null;
    const both = [first, second].filter(Boolean).join('; ');
    return both ? `Divergence: ${both}.` : null;
  };
  const rowOf = w => {
    const line = sentenceOf(w);
    return h('article', { class: 'card wall-row' },
      h('div', { class: 'pics' },
        picture(quiet, w.q, 'No communication'), picture(again, w.a, 'Replicate'), picture(peers, w.m, 'Peer communication', true)),
      h('div', { class: 'wall-text' },
        h('h3', null, `Match ${w.m.match} · ${w.m.name}`),
        line ? h('p', { class: 'small muted' }, line) : null,
        weaverTable(w.m, w.q, w.a)));
  };
  const nodes = new Map(rows.map(w => [w.m.id, rowOf(w)]));
  const wallEl = h('div', { class: 'wall' }, rows.map(w => nodes.get(w.m.id)));

  const toggles = [];
  const heardNote = h('p', { class: 'small muted' }, HEARD_NOTE);
  heardNote.hidden = view !== 'heard';
  const setView = next => {
    view = next;
    for (const b of toggles) {
      const on = b.dataset.view === view;
      b.className = on ? 'btn' : 'btn quiet';
      b.setAttribute('aria-pressed', String(on));
    }
    heardNote.hidden = view !== 'heard';
    for (const p of pics) p.img.src = srcOf(p.run, p.id, view, p.speaking);
  };
  const toggle = (v, label) => {
    const b = h('button', { type: 'button', dataset: { view: v }, class: v === view ? 'btn' : 'btn quiet',
      'aria-pressed': String(v === view), onclick: () => setView(v) }, label);
    toggles.push(b);
    return b;
  };
  const sortSel = h('select', {
    'aria-label': 'Sort',
    onchange: e => {
      const changed = w => (w.q ? apart(w.q, w.m) : NaN);
      const order = e.target.value === 'changed' ? [...rows].sort((x, y) => orLowest(changed(y)) - orLowest(changed(x))) : rows;
      wallEl.replaceChildren(...order.map(w => nodes.get(w.m.id)));
    },
  }, h('option', { value: 'match' }, 'Match order'), h('option', { value: 'changed' }, 'Largest divergence first'));
  const controls = h('div', { class: 'row', style: { margin: '16px 0 0' } },
    toggle('cloth', 'Woven output'), toggle('who', 'Ownership map'), toggle('heard', 'Adoption map'), sortSel);
  return { controls, heardNote, wallEl, rows };
}

/** The example's match: among those with a blunt agent, the one whose blunt agent ended with the most space; else the first. */
function exampleMatch(peers) {
  const blunt = m => m.results.filter(r => r.personality === 'blunt').map(r => r.ground);
  const best = peers.matches.filter(m => blunt(m).length)
    .sort((a, b) => Math.max(...blunt(b)) - Math.max(...blunt(a)))[0];
  return best ?? peers.matches[0] ?? null;
}

/**
 * The example that leads the wall, under the heading "Reading an adoption map": one match's rug read by who was heeded,
 * beside its five agents in bench order, each with how often it adopted the advocated action among the discordant
 * treatment decisions. An empty list when there is no match.
 */
function example(peers, rows) {
  const m = exampleMatch(peers);
  if (!m) return [];
  const lines = m.bench.map(seat => m.results.find(r => r.seat === seat)).map(r => {
    const decided = rows.filter(x => x.match === m.id && x.seat === r.seat && x.heard && x.peerTop !== x.aloneTop);
    const took = decided.filter(x => x.afterTop === x.peerTop).length;
    return h('div', { class: 'ex-line' }, startSwatch(r.seat), h('span', { class: 'ex-name' }, r.name),
      h('span', null, personality(r.personality).name), h('span', { class: 'muted' }, '→'), h('span', null, goal(r.goal).name),
      h('span', { class: 'small muted ex-took' }, `adopted the advocated action in ${took} of ${decided.length} discordant treatment decisions`));
  });
  return [h('div', { class: 'card example' },
    h('a', { class: 'example-pic', href: `match?run=${enc(peers.run)}&id=${enc(m.id)}` },
      h('img', {
        src: `runs/${enc(peers.run)}/thumbs/${enc(m.id)}-heard.png`, alt: `Match ${m.match}, adoption map`,
        width: 232, height: 384,
      })),
    h('div', { class: 'example-text' }, h('h3', null, 'Reading an adoption map'), h('p', { class: 'sub' }, EXAMPLE_SUB), lines))];
}

/** The whole Peer influence page for a peers run, with its no-communication and replicate runs for the wall. */
function page({ peers, rows, quiet, again }) {
  const table = peerTable(rows), dis = table.disagreed;
  const { controls, heardNote, wallEl, rows: wallRows } = wall({ peers, quiet, again });
  const bothQuiet = wallRows.filter(w => w.q && w.a), withQuiet = wallRows.filter(w => w.q);
  const method = h('details', { class: 'method' }, h('summary', null, 'Method'),
    METHOD.map(text => h('p', null, text)));
  const divergence = h('div', { class: 'tiles' },
    tile('tile', 'Divergence between replicates', fmt(mean(bothQuiet.map(w => apart(w.q, w.a)))),
      bothQuiet.length ? DIVERGENCE_NOTE : 'no replicate run to compare'),
    tile('tile', 'Divergence between conditions', fmt(mean(withQuiet.map(w => apart(w.q, w.m)))), DIVERGENCE_NOTE));
  return [
    ...frame(),
    ...protocolSection(),
    h('div', { class: 'tiles' },
      tile('tile hero', 'Influence, treatment', signed(dis.heard.toward), 'percentage points on the advocated action, message delivered'),
      tile('tile', 'Influence, control', signed(dis.held.toward), 'message withheld, query repeated'),
      tile('tile', 'Adoption rate', pct(dis.heard.took), `advocated action became the modal choice; control ${pct(dis.held.took)}`),
      tile('tile', 'Reactance rate', pct(dis.heard.backfired),
        `shift of more than 5 points away from the advocated action; control ${pct(dis.held.backfired)}`)),
    h('h2', null, 'Susceptibility and persuasiveness by persona'),
    h('div', { class: 'two' },
      kindsCard('By receiver persona (susceptibility)', table.listeners, 'receiver'),
      kindsCard('By sender persona (persuasiveness)', table.speakers, 'sender')),
    h('h2', null, 'Advocated action'),
    asksCard(table.asks),
    h('h2', null, 'Outcomes under three conditions'),
    h('p', { class: 'sub' }, SUB_WALL),
    h('p', { class: 'small muted' }, AGENTS_NOTE),
    ...example(peers, rows),
    divergence,
    controls,
    heardNote,
    wallEl,
    method,
  ];
}

/** Loads the runs, then the peers run and the two runs it is compared with; each failure is said in a sentence. */
async function start() {
  let runs;
  try {
    runs = await getJSON('api/runs.json');
  } catch (err) {
    show(...frame(), h('p', { class: 'sub' }, `Could not load the list of runs: ${err.message}.`));
    return;
  }
  // The newest run under peer communication, unless the address names one.
  const newest = runs.filter(r => r.mode === 'peers').sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''))[0];
  const peersName = qs('run') ?? newest?.run ?? null;
  if (peersName === null) {
    show(...frame(), protocolSection(), noPeers());
    return;
  }
  // The no-communication run is the largest dealt run with a model and no peer communication; the replicate, the next one.
  const quietRuns = runs.filter(r => r.mode !== 'peers' && r.design !== 'uniform' && r.model !== 'chance' && r.run !== 'play')
    .sort((a, b) => b.matches - a.matches);
  const indexOf = name => getJSON(`runs/${enc(name)}/index.json`);
  let peers, peersJSON, quiet = null, again = null;
  try {
    [peers, peersJSON] = await Promise.all([indexOf(peersName), getJSON(`runs/${enc(peersName)}/peers.json`)]);
    if (quietRuns[0]) quiet = await indexOf(quietRuns[0].run);
    if (quietRuns[1]) again = await indexOf(quietRuns[1].run);
  } catch (err) {
    show(...frame(), h('p', { class: 'sub' }, `Could not load the runs this page compares: ${err.message}.`));
    return;
  }
  if (!peers.matches.length) {
    show(...frame(), protocolSection(), h('p', { class: 'sub' }, `Run ${peersName} has no matches under peer communication yet.`));
    return;
  }
  show(...page({ peers, rows: peersJSON.rows, quiet, again }));
}

start().catch(err => show(...frame(), h('p', { class: 'sub' }, `The page could not be drawn: ${err.message}.`)));
