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
 * --persona KEY|off    every agent gets this persona (blunt, warm, ...), or none
 * --objective KEY|off  every agent gets this objective (grow, give, hold, borrow), or none. With neither of these two,
 *                      personas and objectives are dealt in the balanced design
 * --solo               one agent decides at a time: each match is run five times, once for each seat, with the other
 *                      four seats scripted (bench/solo.mjs)
 * --neighbours HOW     with --solo, how the other four seats are scripted: accept (the default: they never act and
 *                      accept every request), refuse (they never act and refuse every request), or chance (they act,
 *                      every choice sampled uniformly at random)
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
import { SCORED, SEATS, conditionsOf, deal, goal, personality, play, recordOf } from '../bench/core.mjs';
import { rowsOf, table } from '../bench/stats.mjs';
import { peerTable } from '../bench/peers.mjs';
import { JEV } from '../engine/jev.mjs';
import { askerFor, keepMatch, writeIndex } from './keep.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const USAGE = 'usage: node tools/run.mjs [--model jev|chance|<provider>:<model>] [--read tokens|stated] [--effort LEVEL] [--price IN,OUT] [--cap DOLLARS] '
  + '[--persona KEY|off] [--objective KEY|off] [--solo] [--neighbours accept|refuse|chance] [--area fixed] [--designs chosen] [--peers] [--matches N | A-B] [--run NAME] [--at-once N]';
const FLAGS = new Set(['--chance', '--peers', '--solo']);
const VALUED = new Set(['--model', '--read', '--effort', '--price', '--cap', '--objective', '--persona', '--area', '--designs', '--neighbours', '--matches', '--run', '--at-once']);
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

const read = option('read'), price = option('price'), cap = Number(option('cap') ?? 1);
if (read && !['tokens', 'stated'].includes(read)) fail(`--read takes tokens or stated, not "${read}"`);
const prices = price ? price.split(',').map(Number) : null;
if (prices && !(prices.length === 2 && prices.every(x => Number.isFinite(x) && x >= 0))) fail(`--price takes IN,OUT in dollars a million tokens, not "${price}"`);
if (!(cap > 0)) fail('--cap takes a number of dollars above 0');

const slug = text => text.replace(/^openai-decisions:(.*)$/, '$1-decisions').replace(/^[a-z]+:/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
const tags = [peers && 'peers', solo && (neighbours === 'accept' ? 'solo' : `solo-${neighbours}`), area === 'fixed' && 'fixed', designs === 'chosen' && 'designs-chosen', persona && `persona-${option('persona')}`, objective && `objective-${option('objective')}`].filter(Boolean);
const structural = peers || solo || area === 'fixed' || designs === 'chosen';
const named = model === 'jev' && objective && !structural ? `ref-${objective}`
  : model === 'jev' && !tags.length ? `jev-${new Date().toISOString().slice(0, 10)}`
  : [model === 'jev' || chance ? model : slug(model), ...tags].join('-');
const run = option('run') ?? named;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(run) || run === 'play') {
  fail(`--run takes a folder name of letters, digits, dots, dashes or underscores (not play), not "${run}"`);
}
/** The seats of match `n`: the balanced deal, or every seat given the one objective or persona asked for. */
const seatsOf = n => deal(n).map(s => ({ personality: persona ?? s.personality, goal: objective ?? s.goal }));

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
  agents: solo ? 'solo' : 'group', ...(solo ? { neighbours } : {}), area, designs, peers, ...(ask?.read ? { read: ask.read } : {}) };
if (was) {
  const differs = Object.keys(now).filter(k => (was[k] ?? { designs: 'assigned', neighbours: 'accept' }[k]) !== now[k]);
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
  const cost = `${record.calls} calls${record.requests == null ? '' : ` (${record.requests} requests)`} · ${record.fallbacks} fallbacks · $${record.dollars.toFixed(4)} · ${Math.round(record.seconds)} s`;
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
const switches = [`persona ${c.persona}`, `objective ${c.objective}`, c.agents === 'solo' ? `solo (one agent decides, among four scripted neighbours ${scripted[c.neighbours]})` : 'group',
  c.area === 'fixed' ? 'areas fixed' : 'areas free', c.designs === 'chosen' ? 'designs chosen by the agents' : null, c.peers ? 'peer communication' : null].filter(Boolean).join(' · ');
console.log(`\n${index.totals.matches} ${solo ? 'looms' : 'matches'} in runs/${run} · ${t.weavers} agents · ${index.model ?? 'no model'}${c.read ? ` (read by ${c.read})` : ''}`);
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
if (ask?.used && ask.used().requests != null) { const u = ask.used(); console.log(`${u.requests} requests · ${u.input} input tokens · ${u.failed} failed · $${u.dollars.toFixed(4)} of a $${u.cap} cap`); }
if (ask?.fatal) console.error(`\nRun stopped: ${ask.fatal}. ${failures} matches were not kept; run the same command again to weave what is missing.`);
process.exitCode = ask?.fatal ? 2 : failures ? 1 : 0;
