#!/usr/bin/env node
/**
 * The benchmark from the command line. Each match is dealt, woven and kept under runs/<run>/; a match already kept
 * there is skipped, so a run can be added to. Then the index is rebuilt and the table printed.
 *
 *   node --env-file=<file with TYPESAFE_API_KEY> tools/run.mjs --matches 1-44 --run jev-1
 *   node tools/run.mjs --chance --matches 1-22          # no model: every choice by chance, the control
 *
 * --matches N | A-B    which matches (default 1-11, one round of the deal)
 * --run NAME           the folder under runs/ (default: jev-<YYYY-MM-DD>, jev-peers with --peers, or chance)
 * --chance             ask nobody
 * --peers              peer communication: before each action an agent hears what an adjacent agent would have it
 *                      do (needs a model; see bench/peers.mjs)
 * --objective KEY      a uniform assignment: all five agents get this objective (none, grow, give, hold, borrow);
 *                      the default run name is then ref-<KEY>
 * --persona KEY        all five agents get this persona (plain, blunt, warm, ...). With neither, the balanced deal
 * --at-once N          matches woven together (default 4)
 */
import { access, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCORED, deal, goal, personality, play, recordOf } from '../bench/core.mjs';
import { rowsOf, table } from '../bench/stats.mjs';
import { peerTable } from '../bench/peers.mjs';
import { environmentAsk, keepMatch, writeIndex } from './keep.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const USAGE = 'usage: node tools/run.mjs [--chance] [--peers] [--objective KEY] [--persona KEY] [--matches N | A-B] [--run NAME] [--at-once N]';
const KNOWN = new Set(['--chance', '--peers', '--objective', '--persona', '--matches', '--run', '--at-once']);
const fail = message => { console.error(message); process.exit(1); };

const args = process.argv.slice(2);
for (const a of args) if (a.startsWith('--') && !KNOWN.has(a)) fail(`unknown option ${a}. ${USAGE}`);
const option = name => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const value = args[i + 1];
  if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value. ${USAGE}`);
  return value;
};

const chance = args.includes('--chance'), peers = args.includes('--peers');
if (peers && chance) {
  fail('--peers needs a model: a neighbour\'s words are the model\'s own choice, so there is nothing to say by chance. Drop --chance.');
}
const span = option('matches') ?? '1-11', m = /^(\d+)(?:-(\d+))?$/.exec(span);
const from = m ? Number(m[1]) : NaN, to = m ? Number(m[2] ?? m[1]) : NaN;
if (!m || from < 1 || to < from) fail(`--matches takes N or A-B with 1 <= A <= B, not "${span}"`);
const objective = option('objective'), persona = option('persona');
try { if (objective) goal(objective); if (persona) personality(persona); } catch (e) { fail(`${e.message}. ${USAGE}`); }
const named = objective ? `ref-${objective}` : chance ? 'chance' : peers ? 'jev-peers' : `jev-${new Date().toISOString().slice(0, 10)}`;
const run = option('run') ?? named;
/** The seats of match `n`: the balanced deal, or every seat given the one objective or persona asked for. */
const seatsOf = n => deal(n).map(s => ({ personality: persona ?? s.personality, goal: objective ?? s.goal }));
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(run) || run === 'play') {
  fail(`--run takes a folder name of letters, digits, dots, dashes or underscores (not play), not "${run}"`);
}
const atOnce = Number(option('at-once') ?? 4);
if (!Number.isInteger(atOnce) || atOnce < 1) fail('--at-once takes a whole number of at least 1');

const ask = chance ? null : environmentAsk();
if (!chance && !ask) fail('No Jev key: set TYPESAFE_API_KEY (for example with --env-file), or run with --chance to ask nobody.');

const dir = join(ROOT, 'runs', run), idOf = n => `m${String(n).padStart(3, '0')}`;
const kept = async n => access(join(dir, 'matches', `${idOf(n)}.json`)).then(() => true, () => false);
const pending = [];
for (let n = from; n <= to; n++) if (!(await kept(n))) pending.push(n);

/** One line for a finished match: its id, its rug's name, each weaver as `warm>grow 75 ✓`, then calls, fallbacks and cost. */
const lineOf = record => {
  const mark = r => (r.score == null ? '' : ` ${Math.round(r.score)} ${r.reached ? '✓' : '✗'}`);
  const who = record.results.map(r => `${r.personality}>${r.goal}${mark(r)}`);
  const cost = `${record.calls} calls · ${record.fallbacks} fallbacks · $${record.dollars.toFixed(4)}`;
  return `${record.id} "${record.name}" ${who.join(' · ')} · ${cost}`;
};

let next = 0, failures = 0;
async function worker() {
  while (next < pending.length && !ask?.fatal) {
    const n = pending[next++], id = idOf(n), seats = seatsOf(n);
    try {
      const rug = await play({ seats, seed: n, ask, peers });
      // A benchmark match is the model's decisions or nothing: one decided in part by the fallback is not kept.
      if (ask?.fatal) throw Error(ask.fatal);
      if (rug.stats.calls.script) throw Error(`${rug.stats.calls.script} calls had no valid response from the model, so the match is not kept`);
      const record = recordOf(rug, { id, match: n, seats });
      await keepMatch(join(ROOT, 'runs', run), record, rug);
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
  console.error(ask?.fatal ? `Nothing was kept: ${ask.fatal}. Add credit and run the same command again.` : 'Nothing was kept.');
  process.exit(ask?.fatal ? 2 : 1);
}
const index = await writeIndex(dir, run);
const num = (x, digits = 0) => (Number.isFinite(x) ? x.toFixed(digits) : '–');
const signed = x => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(0)}` : '–');
const pct = x => (Number.isFinite(x) ? `${Math.round(100 * x)}%` : '–');
const row = cells => cells.map((c, i) => String(c).padStart(i ? 9 : 8)).join('').trimEnd();
const t = table(rowsOf(index.matches));

console.log(`\n${index.totals.matches} matches in runs/${run} · ${t.weavers} weavers · ${index.model ?? 'no model'}`);
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
console.log(`${index.totals.calls} Jev calls · $${index.totals.dollars.toFixed(4)} · ${index.totals.seconds.toFixed(1)} seconds`);
if (ask?.fatal) console.error(`\nRun stopped: ${ask.fatal}. ${failures} matches were not kept; add credit and run the same command again to weave what is missing.`);
process.exitCode = ask?.fatal ? 2 : failures ? 1 : 0;
