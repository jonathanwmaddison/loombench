// Every run set against the run it differs from in one switch: `node analysis/controls.mjs [--answers]`. No key or
// network needed. Prints what the Controls page shows, from the run indexes under runs/, and writes analysis/controls.json.
//
// For each baseline (a model's run at the default switches with the most matches) and each run that differs from it in
// one switch or in none: the match designs both have, and for each measure the two means and the paired difference
// (other minus baseline) with a Student-t 95% interval over match designs. Each condition was executed once, so the
// comparison with nothing changed (a second execution), where there is one, is the scale for all the others.
//
// --answers also replays every match of each baseline and describes how its model answers the action question: how
// much probability its modal option gets, how far the place an option is listed in moves its probability, and how the
// probability is spread over the kinds of action for each objective. A minute or two for the larger runs.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { compare, differsIn, isBaseline, switchesOf } from '../bench/compare.mjs';
import { replay } from '../bench/core.mjs';
import { mean } from '../bench/stats.mjs';

const RUNS = new URL('../runs/', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, RUNS), 'utf8'));
const runs = readdirSync(RUNS, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'play')
  .map(d => { try { return read(`${d.name}/index.json`); } catch { return null; } }).filter(Boolean);

const bases = new Map();
for (const r of runs.filter(isBaseline)) if (!bases.has(r.model) || r.matches.length > bases.get(r.model).matches.length) bases.set(r.model, r);

const num = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const signed = x => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}` : '–');
const words = (base, other, differs) => {
  if (!differs.length) return 'nothing changed (a second execution)';
  const a = switchesOf(base), b = switchesOf(other);
  return differs.map(k => `${k}: ${a[k]} → ${b[k]}`).join('; ');
};

const out = {};
for (const base of bases.values()) {
  // One switch apart, or none. Another model is compared through its own baseline run only.
  const near = runs.filter(r => r !== base).map(r => ({ run: r, differs: differsIn(base, r) })).filter(o => o.differs.length <= 1 && (o.differs[0] !== 'model' || bases.get(o.run.model) === o.run))
    .sort((x, y) => x.differs.length - y.differs.length || x.run.run.localeCompare(y.run.run));
  console.log(`\n== baseline ${base.run} · ${base.model} · ${base.matches.length} matches`);
  out[base.run] = { model: base.model, matches: base.matches.length, comparisons: {} };
  for (const { run, differs } of near) {
    const result = compare(base.matches, run.matches, { fixed: switchesOf(base).area === 'fixed' || switchesOf(run).area === 'fixed' });
    out[base.run].comparisons[run.run] = { differs, designs: result.designs.length, rows: result.rows };
    console.log(`\n${base.run} against ${run.run} · ${words(base, run, differs)} · ${result.designs.length} match designs in both`);
    console.log(`${'measure'.padEnd(32)}${base.run.slice(0, 11).padStart(12)}${run.run.slice(0, 11).padStart(12)}   difference [95% interval]`);
    for (const r of result.rows.filter(r => !r.key.startsWith('share.'))) {
      const d = r.difference, clear = Number.isFinite(d.lo) && (d.lo > 0 || d.hi < 0);
      console.log(`${r.name.padEnd(32)}${num(r.base).padStart(12)}${num(r.other).padStart(12)}   ${signed(d.mean)} [${num(d.lo)}, ${num(d.hi)}] k=${d.k}${clear ? '  *' : ''}`);
    }
  }
}

if (process.argv.includes('--answers')) {
  for (const base of bases.values()) {
    if (base.model === 'chance') continue;
    const place = {}, kinds = {}, modal = [];
    for (const m of base.matches) {
      const record = read(`${base.run}/matches/${m.id}.json`), rug = await replay(record);
      for (const t of rug.record.filter(r => r.kind === 'turn' && r.move.options.length > 1)) {
        const goal = record.seats[t.who].goal, n = t.move.options.length;
        modal.push(Math.max(...t.move.options.map(o => o.p)));
        for (const o of t.move.options) {
          (place[o.listed] ??= []).push(o.p - 1 / n);
          const kind = /^(carry|push|yield|offer)/.exec(o.key)?.[1];
          if (kind) ((kinds[goal] ??= {})[kind] ??= []).push(o.p);
        }
      }
    }
    // The probability an objective's agents give each kind of action: summed over the options of that kind in a decision, then averaged.
    console.log(`\n== how ${base.model} answers the action question (${base.run}, ${modal.length} decisions)`);
    console.log(`mean probability of the modal option: ${num(mean(modal), 2)}`);
    console.log(`probability above an even share, by the place an option was listed (pp): ${Object.entries(place).map(([k, v]) => `${k}: ${signed(100 * mean(v))}`).join('  ')}`);
    for (const [goal, k] of Object.entries(kinds)) console.log(`${goal.padEnd(7)} mean probability of one option of each kind (%): ${Object.entries(k).map(([key, v]) => `${key} ${num(100 * mean(v), 0)}`).join('  ')}`);
    out[base.run].answers = { decisions: modal.length, modal: mean(modal), place: Object.fromEntries(Object.entries(place).map(([k, v]) => [k, 100 * mean(v)])),
      kinds: Object.fromEntries(Object.entries(kinds).map(([g, k]) => [g, Object.fromEntries(Object.entries(k).map(([key, v]) => [key, 100 * mean(v)]))])) };
  }
}
try { writeFileSync(new URL('./controls.json', import.meta.url), JSON.stringify(out)); } catch (e) { console.error(`analysis/controls.json was not written: ${e.message}`); }
