// The questions OpenAI's decision model refused, and what the handling of them does to the results:
// `node analysis/refusals.mjs [--check]`. No key or network needed without --check.
//
// The Decisions API answers some questions with { type: 'refusal' } and no reason. bench/decisions.mjs asks such a
// question again with a space added to the input, and takes one refused every time as no preference (every option
// equally likely). A match's record counts both (`reasked`, `unanswered`). This prints:
//
//   1. the counts in each run's records;
//   2. the refused questions by kind, from analysis/decision-refusals.json (the API's replies as they were logged
//      while the runs were made: the records keep counts, not which question);
//   3. attainment in each run with the affected looms left out, so a reader can see what the handling changes;
//   4. the same two tables for a chat model read by the chances it states (bench/llm.mjs): a reply that does not state
//      a chance for every option summing to 100 is asked for again, and a question with no readable reply after three
//      more is taken as no preference. The replies kept are therefore those that pass that test.
//
// --check sends every question in analysis/decision-refusals.json again, as it was first sent, and says how many are
// still refused: about 35 small requests, under a cent, charged to OPENAI_API_KEY.
import { readFileSync, readdirSync } from 'node:fs';

const RUNS = new URL('../runs/', import.meta.url);
const index = run => JSON.parse(readFileSync(new URL(`${run}/index.json`, RUNS), 'utf8'));
const every = readdirSync(RUNS, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'play')
  .map(d => { try { return index(d.name); } catch { return null; } }).filter(Boolean).sort((a, b) => a.run.localeCompare(b.run));
const runs = every.filter(r => /^openai-decisions:/.test(r.model ?? '')), stated = every.filter(r => r.conditions?.read === 'stated');
const pct = (a, b) => (b ? `${Math.round(100 * a / b)}% (${a} of ${b})` : '–');

console.log('1. Refused questions in the records');
let calls = 0, reasked = 0, unanswered = 0;
for (const r of runs) {
  const m = r.matches, c = m.reduce((s, x) => s + x.calls, 0), a = m.reduce((s, x) => s + (x.reasked ?? 0), 0), u = m.reduce((s, x) => s + (x.unanswered ?? 0), 0);
  // A second execution (a run made under the switches of one listed before it) repeats questions already counted, so it is shown and not added.
  const again = runs.slice(0, runs.indexOf(r)).some(o => JSON.stringify(o.conditions) === JSON.stringify(r.conditions));
  if (!again) { calls += c; reasked += a; unanswered += u; }
  console.log(`  ${r.run.padEnd(30)} ${String(m.length).padStart(3)} looms · ${c} calls · ${a} asked again (${(1000 * a / c).toFixed(1)} per 1,000 calls), in ${m.filter(x => x.reasked).length} looms · ${u} never answered, in ${m.filter(x => x.unanswered).length} looms${again ? ' · a second execution, not in the total' : ''}`);
}
console.log(`  total: ${reasked} asked again in ${calls} calls (${(1000 * reasked / calls).toFixed(1)} per 1,000), ${unanswered} never answered`);

const { refused } = JSON.parse(readFileSync(new URL('./decision-refusals.json', import.meta.url), 'utf8'));
console.log(`\n2. The ${refused.length} distinct refused questions, by kind (a question refused in two runs is one question)`);
console.log(`  ${'question'.padEnd(10)}${'refused'.padStart(8)}${'answered with 1 space'.padStart(24)}${'2'.padStart(4)}${'3'.padStart(4)}${'never'.padStart(7)}`);
for (const name of [...new Set(refused.map(q => q.name))]) {
  const of = refused.filter(q => q.name === name), n = k => of.filter(q => q.answeredWithSpaces === k).length;
  console.log(`  ${name.padEnd(10)}${String(of.length).padStart(8)}${String(n(1)).padStart(24)}${String(n(2)).padStart(4)}${String(n(3)).padStart(4)}${String(n(null)).padStart(7)}`);
}

const left = list => {
  console.log(`  ${'run'.padEnd(30)}${'all looms'.padStart(16)}${'none never answered'.padStart(22)}${'none asked again'.padStart(20)}`);
  for (const r of list) {
    const rate = keep => { const rows = r.matches.filter(keep).flatMap(m => m.results.filter(x => !x.placeholder && x.score != null && x.goal !== 'none')); return pct(rows.filter(x => x.reached).length, rows.length); };
    console.log(`  ${r.run.padEnd(30)}${rate(() => true).padStart(16)}${rate(m => !m.unanswered).padStart(22)}${rate(m => !m.reasked).padStart(20)}`);
  }
};
console.log('\n3. Attainment with the affected looms left out (agents with an objective that is scored)');
left(runs);

if (stated.length) {
  console.log('\n4. A chat model read by the chances it states: replies that could not be read');
  let requests = 0, again = 0, never = 0;
  for (const r of stated) {
    const m = r.matches, q = m.reduce((t, x) => t + (x.requests ?? 0), 0), a = m.reduce((t, x) => t + (x.reasked ?? 0), 0), u = m.reduce((t, x) => t + (x.unanswered ?? 0), 0);
    requests += q; again += a; never += u;
    console.log(`  ${r.run.padEnd(30)} ${String(m.length).padStart(3)} looms · ${q} requests answered · ${a} questions asked again (${(1000 * a / q).toFixed(1)} per 1,000 requests), in ${m.filter(x => x.reasked).length} looms · ${u} never readable`);
  }
  console.log(`  total: ${again} asked again in ${requests} requests (${(1000 * again / requests).toFixed(1)} per 1,000), ${never} never readable`);
  console.log('  attainment with the affected looms left out:');
  left(stated);
}

if (process.argv.includes('--check')) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.error('\n--check needs OPENAI_API_KEY'); process.exit(1); }
  let still = 0, tokens = 0;
  for (const q of refused) {
    const response = await fetch('https://api.openai.com/v1/decisions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-6-luna', input: q.input, questions: [q.question] }), signal: AbortSignal.timeout(30000) });
    const reply = await response.json().catch(() => ({}));
    if (!response.ok) { console.error(`\n--check stopped: HTTP ${response.status}`); process.exit(1); }
    tokens += reply.usage?.input_tokens ?? 0;
    if (reply.answers?.[0]?.type === 'refusal') still++;
  }
  console.log(`\n5. The decision model's refused questions, sent again as first sent: ${still} of ${refused.length} refused again (${tokens} input tokens, $${(tokens * 0.10e-6).toFixed(4)})`);
}
