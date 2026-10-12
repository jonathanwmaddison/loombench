// The decision models against each other under the same switches: `node analysis/models.mjs [--scores] [--designs A-B]`.
// No key or network needed. Prints from the run indexes under runs/, and writes analysis/models.json.
//
// analysis/controls.mjs sets a run against the run one switch away for the same model. This sets two models against
// each other with every other switch alike: for each setting of the switches under which two or more models have a
// run, each model's attainment over the match designs all of them have (and with --scores its objective scores),
// then every pair of models with the paired difference in attainment (second minus first) and a Student-t 95%
// interval over match designs. Where nobody has an objective there is no attainment, and what the agents did
// (claims, concessions and design adoptions per agent) is compared instead; --did adds those everywhere. A model's run under a setting is the one with the most matches; another run made the
// same way is a second execution and is listed, not compared (analysis/controls.mjs compares it).
//
// --designs A-B keeps to those match designs (default 1-11, the designs every model was run on).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { SWITCH_KEYS, byDesign, compare, measuresOf, switchesOf } from '../bench/compare.mjs';
import { SCORED } from '../bench/stats.mjs';

const RUNS = new URL('../runs/', import.meta.url);
const runs = readdirSync(RUNS, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'play')
  .map(d => { try { return JSON.parse(readFileSync(new URL(`${d.name}/index.json`, RUNS), 'utf8')); } catch { return null; } }).filter(Boolean);
const span = /^(\d+)-(\d+)$/.exec(process.argv[process.argv.indexOf('--designs') + 1] ?? '') ?? [null, 1, 11];
const from = Number(span[1]), to = Number(span[2]), scores = process.argv.includes('--scores'), did = process.argv.includes('--did');
const DID = ['claims', 'concessions', 'adoptions'];

// The runs by setting of every switch but the model, and within a setting by model: the largest run first.
const OTHER = SWITCH_KEYS.filter(k => k !== 'model'), settings = new Map();
for (const r of runs) {
  const s = switchesOf(r), key = OTHER.map(k => `${k}=${s[k]}`).join(' ');
  const models = settings.get(key) ?? settings.set(key, new Map()).get(key);
  models.set(s.model, [...(models.get(s.model) ?? []), r].sort((a, b) => b.matches.length - a.matches.length || a.run.localeCompare(b.run)));
}
const DEFAULTS = { persona: 'dealt', objective: 'dealt', agents: 'group', area: 'free', designs: 'assigned', peers: false };
const words = key => { const off = key.split(' ').map(p => p.split('=')).filter(([k, v]) => String(DEFAULTS[k]) !== v); return off.length ? off.map(([k, v]) => `${k} ${v}`).join(', ') : 'default'; };
const num = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const signed = x => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}` : '–');

const out = {};
for (const [key, models] of [...settings].sort((a, b) => words(a[0]).localeCompare(words(b[0])))) {
  if (models.size < 2) continue;
  const first = [...models.values()].map(list => list[0]);
  // The match designs every model has under this setting, within the span asked for.
  const designs = [...byDesign(first[0].matches).keys()].filter(n => n >= from && n <= to && first.every(r => byDesign(r.matches).has(n))).sort((a, b) => a - b);
  if (designs.length < 2) continue;
  const within = r => r.matches.filter(m => designs.includes(m.match));
  const fixed = key.includes('area=fixed');
  console.log(`\n== ${words(key)} · match designs ${designs[0]}-${designs.at(-1)} (${designs.length})`);
  console.log(`${'model'.padEnd(34)}${'run'.padEnd(30)}${'attained'.padStart(16)}${scores ? SCORED.map(g => g.padStart(12)).join('') : ''}`);
  if (scores) console.log(`${''.padEnd(80)}${SCORED.map(() => 'score (met)'.padStart(12)).join('')}`);
  const entry = out[words(key)] = { designs: designs.length, models: {}, pairs: [] };
  for (const r of first) {
    const told = within(r).flatMap(m => m.results.filter(x => !x.placeholder && x.score != null)), reached = told.filter(x => x.reached).length;
    const m = measuresOf(within(r)), others = models.get(switchesOf(r).model).slice(1).map(x => x.run);
    const met = g => { const mine = told.filter(x => x.goal === g); return mine.length ? `${num(m[`score.${g}`], 0)} (${mine.filter(x => x.reached).length}/${mine.length})` : '–'; };
    entry.models[r.model] = { run: r.run, reached, of: told.length, scores: Object.fromEntries(SCORED.map(g => [g, m[`score.${g}`] ?? null])),
      met: Object.fromEntries(SCORED.map(g => [g, told.filter(x => x.goal === g && x.reached).length])) };
    console.log(`${String(r.model).padEnd(34)}${r.run.padEnd(30)}${(told.length ? `${Math.round(100 * reached / told.length)}% (${reached} of ${told.length})` : '–').padStart(16)}`
      + `${scores ? SCORED.map(g => met(g).padStart(12)).join('') : ''}${others.length ? `   also: ${others.join(', ')}` : ''}`);
  }
  for (let i = 0; i < first.length; i++) for (let j = i + 1; j < first.length; j++) {
    const result = compare(within(first[i]), within(first[j]), { fixed });
    const scored = result.rows.some(r => r.key === 'attainment' || r.key.startsWith('score.'));
    const rows = result.rows.filter(r => r.key === 'attainment' || (scores && r.key.startsWith('score.')) || ((did || !scored) && DID.includes(r.key)));
    for (const r of rows) {
      const d = r.difference, clear = Number.isFinite(d.lo) && (d.lo > 0 || d.hi < 0);
      entry.pairs.push({ first: first[i].model, second: first[j].model, measure: r.key, difference: d });
      console.log(`  ${`${first[j].run} minus ${first[i].run}`.padEnd(58)}${r.name.padEnd(28)}${num(r.base).padStart(6)} → ${num(r.other).padEnd(6)} ${signed(d.mean)} [${num(d.lo)}, ${num(d.hi)}] k=${d.k}${clear ? '  *' : ''}`);
    }
  }
}
try { writeFileSync(new URL('./models.json', import.meta.url), JSON.stringify(out)); } catch (e) { console.error(`analysis/models.json was not written: ${e.message}`); }
