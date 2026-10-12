#!/usr/bin/env node
/**
 * The benchmark from the command line. Each match is dealt, woven and kept under runs/<run>/; a match already kept
 * there is skipped, so a run can be added to. Then the index is rebuilt and the table printed.
 *
 *   node --env-file=<file with TYPESAFE_API_KEY> tools/run.mjs --matches 1-44 --run main
 *   node tools/run.mjs --chance --matches 1-22                              # no model: every choice by chance
 *   node tools/run.mjs --model ollama:gemma3:4b --matches 1-11              # a chat model on this machine
 *   node tools/run.mjs --model ollama:gemma3:4b --matches 1-11 --solo       # the same agents, each deciding alone
 *
 * --matches N | A-B    which matches (default 1-11, one round of the deal)
 * --run NAME           the folder under runs/ (default: named from the switches, e.g. jev-<date>, chance, gemma3-4b-solo)
 *
 * THE SWITCHES. A run is made under one setting of each, and its index records them (`conditions`).
 * --model SPEC         who decides: jev (the default); chance; OpenAI's decision model, openai-decisions:gpt-6-luna
 *                      (bench/decisions.mjs); or a chat model as <provider>:<model> with a provider of openai, ollama
 *                      or compatible (bench/llm.mjs). --chance is --model chance
 * --read tokens|stated how a chat model's answer is read as probabilities: its first token's probabilities, or the
 *                      chances it states (default: the model's or the provider's own)
 * --effort LEVEL       a reasoning effort for a chat model that takes one (for example none, low)
 * --price IN,OUT       a chat model's prices in dollars a million tokens, for a model not in the price list
 * --cap DOLLARS        the most a chat-model run may spend (default 1)
 * --persona KEY|off    every agent gets this persona (blunt, warm, ..., or cooperative, greedy), or none
 * --objective KEY|off  every agent gets this objective (grow, give, hold, borrow), or none. With neither of these two,
 *                      personas and objectives are dealt in the balanced design
 * --odd TYPE           a mixed group: some seats hold this type and not the one --persona and --objective give the
 *                      rest. TYPE is a persona, persona>objective or >objective (greedy, plain>grow, greedy>grow); what
 *                      it leaves out is as the rest have it. Needs both --persona and --objective, which give the rest
 * --odd-count K        how many seats hold the odd type, 0 to the group's size (default 1). The seats are nested and rotate with the
 *                      match number (oddSeats in bench/core.mjs), so runs with K = 0, 1, 2 ... are paired by match
 * --solo               one agent decides at a time: each match is run five times, once for each seat, with the other
 *                      four seats scripted (bench/solo.mjs)
 * --neighbours HOW     with --solo, how the other four seats are scripted: accept (the default: they never act and
 *                      accept every request), refuse (they never act and refuse every request), or chance (they act,
 *                      every choice sampled uniformly at random)
 * --size N             a group of N agents, 2 to 5 (default 5), for a group of one type or two: needs --persona and
 *                      --objective. Each agent then starts with an equal part of the same loom, and is offered no
 *                      further claims once it holds the larger of 46% and that part plus 20 points
 * --area fixed         no boundary can move: every agent keeps its 20 warps, and only designs are decided
 * --designs chosen     the group votes on a palette and each agent chooses its first design (the first rules); by
 *                      default every match has one palette and each agent a starting design of its own
 * --peers              peer communication: before each action an agent hears what an adjacent agent would have it
 *                      do (needs a model; bench/peers.mjs)
 * --at-once N          matches woven together (default 4 for Jev, 1 for a chat model)
 */
import { access, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCORED, SEATS, conditionsOf, deal, goal, oddSeats, personality, play, recordOf } from '../bench/core.mjs';
import { rowsOf, table } from '../bench/stats.mjs';
import { peerTable } from '../bench/peers.mjs';
import { JEV } from '../engine/jev.mjs';
import { askerFor, keepMatch, writeIndex } from './keep.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const USAGE = 'usage: node tools/run.mjs [--model jev|chance|<provider>:<model>] [--read tokens|stated] [--effort LEVEL] [--price IN,OUT] [--cap DOLLARS] '
  + '[--persona KEY|off] [--objective KEY|off] [--odd TYPE] [--odd-count K] [--size N] [--solo] [--neighbours accept|refuse|chance] [--area fixed] [--designs chosen] [--peers] [--matches N | A-B] [--run NAME] [--at-once N]';
const FLAGS = new Set(['--chance', '--peers', '--solo']);
const VALUED = new Set(['--model', '--read', '--effort', '--price', '--cap', '--objective', '--persona', '--odd', '--odd-count', '--size', '--area', '--designs', '--neighbours', '--matches', '--run', '--at-once']);
const fail = message => { console.error(message); process.exit(1); };

const args = process.argv.slice(2);
for (const a of args) if (a.startsWith('--') && !FLAGS.has(a) && !VALUED.has(a)) fail(`unknown option ${a}. ${USAGE}`);
const option = name => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const value = args[i + 1];
  if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value. ${USAGE}`);
  return value;
};

const peers = args.includes('--peers'), solo = args.includes('--solo');
if (args.includes('--chance') && option('model') && option('model') !== 'chance') fail('--chance and --model name two different deciders; give one');
const model = args.includes('--chance') ? 'chance' : option('model') ?? 'jev', chance = model === 'chance';
if (peers && chance) {
  fail('--peers needs a model: a neighbour\'s words are the model\'s own choice, so there is nothing to say by chance. Drop --chance.');
}
if (peers && solo) fail('--peers needs neighbours that decide, and with --solo only one agent does. Give one of the two.');
const neighbours = option('neighbours') ?? 'accept';
if (!['accept', 'refuse', 'chance'].includes(neighbours)) fail(`--neighbours takes accept, refuse or chance, not "${neighbours}"`);
if (option('neighbours') && !solo) fail('--neighbours says how the other four seats of a solo match are scripted: give --solo with it.');
const area = option('area') ?? 'free';
if (!['free', 'fixed'].includes(area)) fail(`--area takes fixed (or free, the default), not "${area}"`);
if (peers && area === 'fixed') fail('--peers is about the action, and with --area fixed there is one action. Give one of the two.');
const designs = option('designs') ?? 'assigned';
if (!['assigned', 'chosen'].includes(designs)) fail(`--designs takes chosen (or assigned, the default), not "${designs}"`);
if (solo && designs === 'chosen') fail('--solo needs assigned designs: a placeholder keeps its design and chooses nothing. Give one of the two.');
const span = option('matches') ?? '1-11', m = /^(\d+)(?:-(\d+))?$/.exec(span);
const from = m ? Number(m[1]) : NaN, to = m ? Number(m[2] ?? m[1]) : NaN;
if (!m || from < 1 || to < from) fail(`--matches takes N or A-B with 1 <= A <= B, not "${span}"`);
// "off" is the key each list uses for nobody having one: the plain persona, the objective none.
const persona = option('persona') === 'off' ? 'plain' : option('persona'), objective = option('objective') === 'off' ? 'none' : option('objective');
try { if (objective) goal(objective); if (persona) personality(persona); } catch (e) { fail(`${e.message}. ${USAGE}`); }
// A mixed group: the odd type as { personality, goal }, either left out when it is as the rest have it.
const oddSpec = option('odd'), oddCount = option('odd-count') === null ? (oddSpec ? 1 : 0) : Number(option('odd-count'));
if (option('odd-count') !== null && !oddSpec) fail('--odd-count says how many seats hold the odd type: give --odd with it.');
const size = option('size') === null ? SEATS : Number(option('size'));
if (!(Number.isInteger(size) && size >= 2 && size <= SEATS)) fail(`--size takes a whole number from 2 to ${SEATS}`);
if (size !== SEATS && !(persona && objective)) fail('--size is for a group of one type or two: give both --persona and --objective (the balanced deal is for five agents).');
if (size !== SEATS && (solo || peers || designs === 'chosen')) fail('--size cannot be combined with --solo, --peers or --designs chosen.');
if (!(Number.isInteger(oddCount) && oddCount >= 0 && oddCount <= size)) fail(`--odd-count takes a whole number from 0 to ${size}`);
// The rest must be one type, or the seats would hold more than two and be no mix: both its persona and its objective are given.
if (oddSpec && !(persona && objective)) fail('--odd swaps seats of a group made of one type: give both --persona and --objective for the rest (for example --persona calm --objective off).');
if (oddSpec && (oddSpec.split('>').length > 2 || !oddSpec.replace('>', ''))) fail(`--odd takes a persona, persona>objective or >objective, not "${oddSpec}"`);
const [oddPersona, oddGoal] = oddSpec ? (oddSpec.includes('>') ? oddSpec.split('>') : [oddSpec, '']).map(x => (x === 'off' ? null : x || undefined)) : [];
const odd = oddSpec ? { personality: oddPersona === null ? 'plain' : oddPersona, goal: oddGoal === null ? 'none' : oddGoal } : null;
try { if (odd?.goal) goal(odd.goal); if (odd?.personality) personality(odd.personality); } catch (e) { fail(`--odd: ${e.message}. ${USAGE}`); }

const read = option('read'), price = option('price'), cap = Number(option('cap') ?? 1);
if (read && !['tokens', 'stated'].includes(read)) fail(`--read takes tokens or stated, not "${read}"`);
const prices = price ? price.split(',').map(Number) : null;
if (prices && !(prices.length === 2 && prices.every(x => Number.isFinite(x) && x >= 0))) fail(`--price takes IN,OUT in dollars a million tokens, not "${price}"`);
if (!(cap > 0)) fail('--cap takes a number of dollars above 0');

const slug = text => text.replace(/^openai-decisions:(.*)$/, '$1-decisions').replace(/^[a-z]+:/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
const tags = [size !== SEATS && `size-${size}`, odd && `${oddCount}-${slug(oddSpec)}`, peers && 'peers', solo && (neighbours === 'accept' ? 'solo' : `solo-${neighbours}`), area === 'fixed' && 'fixed', designs === 'chosen' && 'designs-chosen', persona && `persona-${option('persona')}`, objective && `objective-${option('objective')}`].filter(Boolean);
const structural = peers || solo || area === 'fixed' || designs === 'chosen';
const named = model === 'jev' && objective && !structural ? `ref-${objective}`
  : model === 'jev' && !tags.length ? `jev-${new Date().toISOString().slice(0, 10)}`
  : [model === 'jev' || chance ? model : slug(model), ...tags].join('-');
const run = option('run') ?? named;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(run) || run === 'play') {
  fail(`--run takes a folder name of letters, digits, dots, dashes or underscores (not play), not "${run}"`);
}
/** The seats of match `n`: the balanced deal, or every seat given the one objective or persona asked for; then the odd type in its seats. */
const seatsOf = n => {
  const seats = deal(n).slice(0, size).map(s => ({ personality: persona ?? s.personality, goal: objective ?? s.goal }));
  for (const i of odd ? oddSeats(n, oddCount, size) : []) seats[i] = { personality: odd.personality ?? seats[i].personality, goal: odd.goal ?? seats[i].goal };
  return seats;
};

let ask = null;
if (!chance) {
  try { ask = askerFor(model, { read, effort: option('effort'), prices, cap }); } catch (e) { fail(`${e.message}. ${USAGE}`); }
  if (!ask) fail(model === 'jev' ? 'No Jev key: set TYPESAFE_API_KEY (for example with --env-file), or run with --chance to ask nobody.'
    : `No key for ${model}: set its provider's key in the environment (for example with --env-file).`);
}
const atOnce = Number(option('at-once') ?? (model === 'jev' || chance ? 4 : 1));
if (!Number.isInteger(atOnce) || atOnce < 1) fail('--at-once takes a whole number of at least 1');

const dir = join(ROOT, 'runs', run);
// A run is one condition: matches are added only to a run made under the same switches.
const was = await readFile(join(dir, 'index.json'), 'utf8').then(text => JSON.parse(text).conditions ?? null, () => null);
const now = { model: chance ? 'chance' : ask.model ?? JEV.model, persona: persona === 'plain' ? 'off' : persona ?? 'dealt', objective: objective === 'none' ? 'off' : objective ?? 'dealt',
  agents: solo ? 'solo' : 'group', ...(solo ? { neighbours } : {}), area, designs, peers, ...(ask?.read ? { read: ask.read } : {}), ...(ask?.effort ? { effort: ask.effort } : {}) };
// A group of one type, or of two: what its seats say, as the records will (`conditionsOf`).
if (odd) { const c = conditionsOf({ seats: seatsOf(from), rules: 2 }); now.persona = c.persona; now.objective = c.objective; if (c.mix) now.mix = c.mix; }
if (size !== SEATS) now.size = size;
if (was) {
  // A reasoning effort the run was made under counts too, when this call names none.
  const differs = [...new Set([...Object.keys(now), ...(was.effort ? ['effort'] : []), ...(was.mix ? ['mix'] : []), ...(was.size ? ['size'] : [])])].filter(k => (was[k] ?? { designs: 'assigned', neighbours: 'accept' }[k]) !== now[k]);
  if (differs.length) fail(`runs/${run} was made under other switches (${differs.map(k => `${k}: ${was[k]}, not ${now[k]}`).join('; ')}). Give another --run.`);
}

/** The looms of match `n`: one, or with --solo one for each seat. */
const idOf = (n, seat = null) => `m${String(n).padStart(3, '0')}${seat === null ? '' : `-s${seat}`}`;
const loomsOf = n => (solo ? Array.from({ length: SEATS }, (_, seat) => ({ n, seat, id: idOf(n, seat) })) : [{ n, seat: null, id: idOf(n) }]);
const kept = async id => access(join(dir, 'matches', `${id}.json`)).then(() => true, () => false);
const pending = [];
for (let n = from; n <= to; n++) for (const loom of loomsOf(n)) if (!(await kept(loom.id))) pending.push(loom);

/** One line for a finished match: its id, its rug's name, each agent as `warm>grow 75 ✓`, then calls, fallbacks and cost. */
const lineOf = record => {
  const mark = r => (r.score == null ? '' : ` ${Math.round(r.score)} ${r.reached ? '✓' : '✗'}`);
  const who = record.results.filter(r => !r.placeholder).map(r => `${r.personality}>${r.goal}${mark(r)}${solo ? ` · final share ${r.ground}%` : ''}`);
  const cost = `${record.calls} calls${record.requests == null ? '' : ` (${record.requests} requests)`} · ${record.fallbacks} fallbacks${record.reasked ? ` · ${record.reasked} asked again${record.unanswered ? `, ${record.unanswered} never answered` : ''}` : ''} · $${record.dollars.toFixed(4)} · ${Math.round(record.seconds)} s`;
  return `${record.id} "${record.name}" ${who.join(' · ')} · ${cost}`;
};

let next = 0, failures = 0;
async function worker() {
  while (next < pending.length && !ask?.fatal) {
    const { n, seat, id } = pending[next++], seats = seatsOf(n);
    try {
      const rug = await play({ seats, seed: n, ask, peers, solo: seat, neighbours, area, designs });
      // A benchmark match is the model's decisions or nothing: one decided in part by the fallback is not kept.
      if (ask?.fatal) throw Error(ask.fatal);
      if (rug.stats.calls.script) throw Error(`${rug.stats.calls.script} calls had no valid response from the model, so the match is not kept`);
      const record = recordOf(rug, { id, match: n, seats });
      await keepMatch(dir, record, rug);
      console.log(lineOf(record));
    } catch (e) {
      failures++;
      console.error(`${id} failed: ${e.message ?? e}`);
    }
  }
}
if (pending.length) await Promise.all(Array.from({ length: Math.min(atOnce, pending.length) }, worker));
if (!pending.length) console.log(`all ${to - from + 1} matches are already in runs/${run}`);

// A run with nothing kept is not a run: no folder, no index, no table.
if (!(await readdir(join(dir, 'matches')).catch(() => [])).length) {
  await rm(dir, { recursive: true, force: true });
  console.error(ask?.fatal ? `Nothing was kept: ${ask.fatal}.` : 'Nothing was kept.');
  process.exit(ask?.fatal ? 2 : 1);
}
const index = await writeIndex(dir, run);
const num = (x, digits = 0) => (Number.isFinite(x) ? x.toFixed(digits) : '–');
const signed = x => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(0)}` : '–');
const pct = x => (Number.isFinite(x) ? `${Math.round(100 * x)}%` : '–');
const row = cells => cells.map((c, i) => String(c).padStart(i ? 9 : 8)).join('').trimEnd();
const t = table(rowsOf(index.matches)), c = conditionsOf(index.matches[0]);

const scripted = { accept: 'that never act and accept every request', refuse: 'that never act and refuse every request', chance: 'that act by chance' };
const switches = [c.size ? `${c.size} agents` : null, c.mix ? `a group of ${c.mix}` : null, `persona ${c.persona}`, `objective ${c.objective}`, c.agents === 'solo' ? `solo (one agent decides, among four scripted neighbours ${scripted[c.neighbours]})` : 'group',
  c.area === 'fixed' ? 'areas fixed' : 'areas free', c.designs === 'chosen' ? 'designs chosen by the agents' : null, c.peers ? 'peer communication' : null].filter(Boolean).join(' · ');
console.log(`\n${index.totals.matches} ${solo ? 'looms' : 'matches'} in runs/${run} · ${t.weavers} agents · ${index.model ?? 'no model'}${c.read ? ` (read by ${c.read}${c.effort ? `, reasoning effort ${c.effort}` : ''})` : ''}`);
console.log(switches);
if (area === 'fixed') console.log('Areas are fixed, so Grow, Give and Hold cannot be pursued: every agent ends with 20%. Only the Borrow row below is informative.');
console.log(row(['goal', 'told', 'untold', 'lift', 'reached', 'goal%', 'person%', 'both%', 'rest%']));
for (const g of SCORED) {
  const x = t.goals[g], s = x.split;
  console.log(row([goal(g).name, num(x.told.mean), num(x.untold.mean), signed(x.lift), `${x.told.reached} of ${x.told.n}`,
    s ? pct(s.goal) : '–', s ? pct(s.personality) : '–', s ? pct(s.both) : '–', s ? pct(s.rest) : '–']));
}
// The peer study's decisions, if this run has any: heard and held back, for the two kinds of disagreement.
const peerRows = await readFile(join(dir, 'peers.json'), 'utf8').then(text => JSON.parse(text).rows, () => null);
if (peerRows) {
  const p = peerTable(peerRows), side = (label, three) => {
    const h = three.heard, k = three.held;
    return `${label.padEnd(10)} heard ${h.n}, toward ${signed(h.toward)}, took it ${pct(h.took)}`
      + ` · held back ${k.n}, toward ${signed(k.toward)}, took it ${pct(k.took)}`;
  };
  console.log(`\npeers (${p.decisions} decisions; points toward the neighbour's choice):`);
  console.log(side('disagreed', p.disagreed));
  console.log(side('agreed', p.agreed));
}

const o = t.overall;
const told = `${o.told.reached} of ${o.told.n} reached (${pct(o.told.rate)})`;
const untold = `${o.untold.reached} of ${o.untold.n} (${pct(o.untold.rate)})`;
console.log(`\nall told a goal: ${told}; untold: ${untold}; lift ${signed(o.lift)}`);
console.log(`${index.totals.calls} calls answered by a model${index.totals.requests == null ? '' : ` (${index.totals.requests} requests)`} · $${index.totals.dollars.toFixed(4)} · ${index.totals.seconds.toFixed(1)} seconds`);
if (ask?.used && ask.used().requests != null) { const u = ask.used(); console.log(`${u.requests} requests · ${u.input} input tokens · ${u.failed} failed${u.reasked ? ` · ${u.reasked} questions asked again${u.unanswered ? `, ${u.unanswered} never answered` : ''}` : ''} · $${u.dollars.toFixed(4)} of a $${u.cap} cap`); }
if (ask?.fatal) console.error(`\nRun stopped: ${ask.fatal}. ${failures} matches were not kept; run the same command again to weave what is missing.`);
process.exitCode = ask?.fatal ? 2 : failures ? 1 : 0;
