// Group composition: a group of one type of agent, and the same group with some seats given to a second type.
// `node analysis/mix.mjs`. No key or network needed. Prints from the run indexes under runs/, and writes analysis/mix.json.
//
// For each set of runs made of the same two types by the same model (bench/mix.mjs): each composition's final share
// and actions per agent of each type; then each composition against the one with one seat fewer of the second type,
// paired by match number: the seats whose type changed, the seats whose type did not, and how unequal the final
// shares are, each with a Student-t 95% interval over match numbers.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { compositions, levelOf, shift } from '../bench/mix.mjs';

const RUNS = new URL('../runs/', import.meta.url);
const runs = readdirSync(RUNS, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'play')
  .map(d => { try { return JSON.parse(readFileSync(new URL(`${d.name}/index.json`, RUNS), 'utf8')); } catch { return null; } }).filter(Boolean).sort((a, b) => a.run.localeCompare(b.run));
const num = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const signed = x => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}` : '–');
const ci = d => `${signed(d.mean)} [${num(d.lo)}, ${num(d.hi)}] k=${d.k}${Number.isFinite(d.lo) && (d.lo > 0 || d.hi < 0) ? '  *' : ''}`;

const out = [];
for (const set of compositions(runs)) {
  const [first, second] = set.types;
  console.log(`\n== ${set.model} · ${first} and ${second} · ${set.levels.map(l => `${l.count} (${l.run.run}, ${l.run.matches.length})`).join(', ')}`);
  const entry = { model: set.model, types: set.types, levels: [], shifts: [] };
  console.log(`${`${second} seats`.padEnd(16)}${'matches'.padStart(8)}${`share, ${second}`.padStart(22)}${`share, ${first}`.padStart(22)}${`claims, ${second}`.padStart(22)}${`claims, ${first}`.padStart(22)}${'dispersion'.padStart(12)}${'largest'.padStart(9)}${'held jointly'.padStart(14)}`);
  for (const { count, run } of set.levels) {
    const level = levelOf(run.matches, set.types), t = level.types;
    entry.levels.push({ count, run: run.run, ...level });
    console.log(`${String(count).padEnd(16)}${String(level.matches).padStart(8)}${num(t[second]?.share.mean).padStart(22)}${num(t[first]?.share.mean).padStart(22)}${num(t[second]?.claims.mean).padStart(22)}${num(t[first]?.claims.mean).padStart(22)}${num(level.dispersion.mean).padStart(12)}${num(level.largest.mean).padStart(9)}${num(level.joint.mean).padStart(14)}`);
  }
  for (let i = 1; i < set.levels.length; i++) {
    const a = set.levels[i - 1], b = set.levels[i], s = shift(a.run.matches, b.run.matches);
    if (s.matches < 2) continue;
    entry.shifts.push({ from: a.count, to: b.count, ...s });
    console.log(`\n${a.count} → ${b.count} ${second} (${a.run.run} → ${b.run.run}), ${s.matches} match numbers in both`);
    const lines = (label, rows) => { for (const r of rows) console.log(`  ${label.padEnd(44)}${r.name.padEnd(28)}${num(r.from).padStart(7)} → ${num(r.to).padEnd(7)}${ci(r.difference)}`); };
    if (s.changed) lines(`the ${s.changed.seats} seat${s.changed.seats === 1 ? '' : 's'} changed: ${s.changed.from} → ${s.changed.to}`, s.changed.rows);
    for (const [type, kept] of Object.entries(s.kept)) lines(`the ${kept.seats} seat${kept.seats === 1 ? '' : 's'} that stayed ${type}`, kept.rows);
    console.log(`  ${'the group'.padEnd(44)}${'Dispersion of final shares'.padEnd(28)}${num(s.dispersion.from).padStart(7)} → ${num(s.dispersion.to).padEnd(7)}${ci(s.dispersion.difference)}`);
    console.log(`  ${'the group'.padEnd(44)}${'Held jointly (%)'.padEnd(28)}${num(s.joint.from).padStart(7)} → ${num(s.joint.to).padEnd(7)}${ci(s.joint.difference)}`);
  }
  out.push(entry);
}
if (!out.length) console.log('No run of a mixed group yet. For example: node tools/run.mjs --chance --persona cooperative --objective off --odd greedy --matches 1-10');
try { writeFileSync(new URL('./mix.json', import.meta.url), JSON.stringify(out)); } catch (e) { console.error(`analysis/mix.json was not written: ${e.message}`); }
