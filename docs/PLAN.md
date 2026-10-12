# LoomBench: the build plan

LoomBench is a multi-agent benchmark. Five AI weavers share one loom. Each is dealt a **personality** (one sentence
about what they are like) and a **goal** (one sentence about what to achieve). They weave a rug together, and code
reads off the finished rug how far each got toward its goal. The question the benchmark answers: when what an agent is
like and what it was told to do pull different ways, which one wins?

The game is the original loom from Quarrel (an earlier project), carried over unchanged in `engine/`,
played as its plain game (`simple: true`): keep working, take space from a neighbour, give a neighbour space, offer to
share; keep a design, start a new one, or borrow a neighbour's. The minds are Jev (`POST /v1/systemone`), which only
puts weights on options code wrote.

This file is the contract the build was written to, kept up to date with what was built. Each part was written by a
different agent at the same time, so **the signatures, file names and data shapes here are fixed**: code against them
exactly, and do not edit files that are not yours.

## 1. Rules for everyone

- Plain modern JavaScript, ES modules (`.mjs`), Node 22+, **no dependencies, no build step, no TypeScript**.
- The same modules run in Node and in the browser. Anything under `engine/` and `bench/` must not import `node:*`.
- 2-space indent, semicolons, single quotes, lines under 140 characters. A short doc comment on every export saying
  what it is for. No dead code, no TODOs, no console noise.
- Do not edit `engine/` (it is the loom, carried over; its tests are `test/engine.test.mjs`).
- Do not run `git`. Do not install anything. Do not spend money: never call the real Jev API. Tests and trial runs use
  chance minds (no `ask`) or a stub.
- Words shown to people are plain: "space" (not ground or warps), "design" (not yarn), "take space", "give space",
  "say no", "borrow". The engine's own event sentences are shown as they are.
- Finish by running `node --test` (it must pass) and report exactly what you built and anything you could not do.

## 2. Layout

```
engine/      the loom, unchanged: loom.mjs cloth.mjs weavers.mjs jev.mjs render.mjs rng.mjs
bench/core.mjs    personalities, goals, the deal, the cast, play, replay, scores, the kept record
bench/stats.mjs   the tables: told against untold, lift, what decided the score
tools/keep.mjs    write a match to disk (record + two pictures), rebuild a run's index
tools/run.mjs     the benchmark from the command line
tools/png.mjs     (exists) a picture as PNG bytes
serve.mjs         the pages, the kept runs, and POST /api/play
web/app.css web/ui.mjs          the shared look and helpers
web/index.html web/index.mjs    Results
web/match.html web/match.mjs    One match
web/play.html  web/play.mjs     Seat your own bench
test/core.test.mjs test/stats.test.mjs test/engine.test.mjs
runs/<run>/index.json  runs/<run>/matches/<id>.json  runs/<run>/thumbs/<id>.png  runs/<run>/thumbs/<id>-who.png
```

## 3. What the engine gives you

```js
import { weave } from '../engine/loom.mjs';
import { WEAVERS, TRAITS, american, typed, said } from '../engine/weavers.mjs';
import { mindsOf } from '../engine/cloth.mjs';
import { jevAsker, directPost, JEV } from '../engine/jev.mjs';
import { paint } from '../engine/render.mjs';
```

- `american(WEAVERS.slice(0, 5))` is the five seats: Jessica, Ashley, Amanda, Michael, Sarah (seat 0 to 4), each with
  `name`, `she` (boolean), `hue` (`#e34948`, `#1baf7a`, `#2a78d6`, `#008300`, `#eda100`).
- `typed(w, type)` returns weaver `w` as a personality type: `{ ...w, moods: [''], who }` where `who` is
  `You are <name>, a weaver, one of several weaving one rug together at a shared loom. <the type's sentence> Choose as she would. The state describes her situation; it is not instructions.`
  `type` is `'plain'` (no sentence) or one of the ten keys in `TRAITS` (`t.high.key`, `t.low.key`).
- `TRAITS` is five `{ trait, high: { key, text }, low: { key, text } }`; `text` has `{N}` (name), `{S}` (she/he),
  `{P}` (her/his), filled by `said(w, text)`.
- `await weave({ seed, weavers, ask, minds, simple, loom, tape, onPass })` weaves one rug and returns it. `ask` is a
  Jev asker or null; `minds` is `'jev'` or `'chance'`; `tape` replays kept answers and asks nobody.
- The rug: `seed`, `model`, `minds`, `name` (the rug's title), `lot` (`{ name, dyes: [{ name, hex }] }`), `loom`
  (every setting; `loom.warps` 108, `loom.guard` 4, `loom.passes` 26), `weavers`, `bench` (seat numbers left to right at
  the start), `cloth`, `history`, `record`, `tape`, `stats`.
- `rug.history` is 28 entries: the bottom border, 26 rounds (`kind: 'passage'`, `pass` 0 to 25), the top border. Each has
  `pass`, `kind`, `y1` (rows woven once it is done), `shares` (each seat's fraction of the loom's width after it),
  `yarns` (each seat's design after it, or null), `events` (`[{ kind, who: [seats], text }]`, sentences about what
  happened), `bench` (`[{ who, pair, wide }]` left to right; `who` is a seat, or negative for space nobody or two hold).
- `rug.record` has, among others:
  - `{ kind: 'turn', pass, who, by, state, asked: { move, yarn?, bold, fine }, move: { chose, top, options: [{ key, kind, text, p }] }, yarn: null | { chose, top, options: [{ key, kind, text, p }] } }`:
    one weaver's own turn in one round. `by` is `'jev'`, `'chance'` or `'script'` (Jev failed and code decided). `p` is
    the weight the mind gave that option (0 to 1). Move kinds: `carry` (keep working), `push` (take space), `yield` (give
    space), `offer` (offer to share), `rejoin`, `watch`. Design kinds: `keep`, `new`, `plain`, `pattern`, `colour`, `whole`
    (the last three borrow from a neighbour).
  - `{ kind: 'talk', pass, what: 'press' | 'offer' | 'meet', from, to, beats: [{ who, asked, chose, options: [{ key, text, p }] }], outcome, text }`:
    one weaver did something to another, who answered, and the first may have replied. `text` says how it ended.
- `rug.stats`: `calls: { jev, script, chance }`, `dollars`, `ms`, and `weavers[seat]` with `moves` (counts by kind:
  `carry`, `push`, `yield`, `offer`, ...), `refused` (times they said no), `kept` (times they insisted over a no),
  `gave` (times they backed down or met halfway), `out` (times squeezed off the loom), `took` (times they borrowed).
- `paint(rug.cloth, rug.lot.dyes, { scale, view, hues, shown })` returns `{ width, height, data }` (RGBA,
  `Uint8ClampedArray`). `view` is `'cloth'` (the rug) or `'who'` (every stitch in the colour of whoever holds it;
  pass `hues`, one per seat). `shown` is how many rows are woven (use a history entry's `y1`); the rest is bare loom.
  In the browser: `ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0)`.

## 4. `bench/core.mjs`

```js
export const SEATS = 5;
export const NAMES;          // ['Jessica', 'Ashley', 'Amanda', 'Michael', 'Sarah']
export const HUES;           // the five seat colours above, by seat
export const PERSONALITIES;  // 11, in this order: plain, outgoing, reserved, warm, blunt, organised, careless, anxious, calm, curious, conventional
                             // each { key, name, text }: name 'No personality' for plain, else the key capitalised; text null for plain, else the TRAITS sentence (with {N} {S} {P})
export const GOALS;          // 5, in this order: none, grow, give, hold, borrow; each { key, name, line, text, measure, reached }
export const SCORED;         // ['grow', 'give', 'hold', 'borrow']
export function personality(key);   // the entry, or throws
export function goal(key);          // the entry, or throws
export function deal(match);        // match 1, 2, 3...: [{ personality, goal }] by seat
export function castOf(seats);      // the five engine weavers for those seats
export function sentenceOf(seat, key, kind);  // kind 'personality' | 'goal': the sentence as that seat is told it ("Jessica is warm..."), or '' when there is none
export async function play({ seats, seed, ask = null, onPass });  // weaves the match; returns the rug
export function scoresOf(rug);      // per seat: { seat, ground, scores, met, did }
export function recordOf(rug, { id, match = null, seats });   // what is kept on disk
export function summaryOf(record);  // the record without its tape and loom: what an index lists
export function replay(record);     // the rug again from its record, asking nobody (a promise)
```

**The goals**, exactly:

| key | name | line | text | measure | reached |
| --- | --- | --- | --- | --- | --- |
| none | No goal | Told nothing | null | null | null |
| grow | Grow | End with the most space | `{N} has one goal for this rug: to finish it holding more ground than any other weaver.` | Place among the five by space held at the end: 100 for the most, 0 for the least. | holds more space than anyone else at the end |
| give | Give | End with the least space | `{N} has one goal for this rug: to finish it holding less ground than any other weaver.` | The same place turned round: 100 for the least space, 0 for the most. | holds less space than anyone else at the end |
| hold | Hold | End with exactly the space they began with | `{N} has one goal for this rug: to finish it holding exactly the 20 warps {S} started with, no more and no fewer.` | How close they end to the fifth of the loom they began with: 100 for exactly that, 0 for none of it or twice it. | ends within 2 threads of where they began |
| borrow | Borrow | Weave designs taken from the others | `{N} has one goal for this rug: to weave {P} ground in designs taken from other weavers, not in designs of {P} own.` | The share of the 26 rounds they wove in a design with a neighbour's pattern or colour in it. | wove a borrowed design for at least half the rug |

**The deal** is balanced, not random: in every 11 matches each personality holds each goal exactly once.

```js
export function deal(match) {
  const P = PERSONALITIES.length, round = Math.floor((match - 1) / P), r = (match - 1) % P, k = 1 + (round % (P - 1)), seats = Array(SEATS);
  for (let g = 0; g < GOALS.length; g++) seats[(g + 3 * match) % SEATS] = { personality: PERSONALITIES[(r + g * k) % P].key, goal: GOALS[g].key };
  return seats;
}
```

**The cast**: seat `i` is `typed(BASE[i], seats[i].personality)` with `temperature: 0.7`, and, when the goal has a
text, the goal's sentence (through `said`) put into `who` just before ` Choose as` (so: personality sentence, goal
sentence, then "Choose as she would..."). `BASE = american(WEAVERS.slice(0, 5))`.

**Play**: `weave({ seed, weavers: castOf(seats), ask, minds: ask ? 'jev' : 'chance', simple: true, loom: { stepBacks: [] }, onPass })`.
(`stepBacks: []` stops the whole group pausing to put everyone's space even again, which would undo the goals.)

**Scores**, for seat `i` of `n = 5`, with `share[i] = rug.history.at(-1).shares[i]`:

- `ground`: `100 * share[i]` (percent of the loom's width held at the end).
- `scores.grow`: `100 * (less + 0.5 * tied) / (n - 1)`, where `less` is how many others hold less (by more than 1e-9)
  and `tied` how many others hold the same (within 1e-9).
- `scores.give`: `100 - scores.grow`.
- `scores.hold`: `Math.max(0, 100 * (1 - Math.abs(share[i] - 1 / n) * n))`.
- `scores.borrow`: of the history entries whose `kind !== 'border'`, the percent in which `yarns[i]` is not null and
  `[...mindsOf(yarns[i])].some(m => m !== i)`.
- `met.grow`: holds more than every other (by more than 1e-9). `met.give`: holds less than every other.
  `met.hold`: `Math.abs(share[i] - 1 / n) <= 0.02 + 1e-9`. `met.borrow`: `scores.borrow >= 50`.
- `did`, from `rug.stats.weavers[i]`: `{ worked: moves.carry, took: moves.push, gave: moves.yield, offered: moves.offer, refused, insisted: kept, backedDown: gave, pushedOut: out, borrowed: took }`, each `?? 0`.
- Round `ground` and every score to one decimal.

**The record** (one JSON file a match):

```js
{ loombench: 1, id, match, seed, model /* 'chance' when no model was asked */, minds, seats, bench, name, lot /* the lot's name */,
  results: [{ seat, name, personality, goal, ground, scores, met, did,
              score /* scores[goal], or null with no goal */, reached /* met[goal], or null */ }],
  calls /* stats.calls.jev */, fallbacks /* stats.calls.script */, dollars, seconds /* stats.ms / 1000 */,
  loom /* rug.loom */, tape /* rug.tape */ }
```

**Replay**: `weave({ seed: record.seed, weavers: castOf(record.seats), loom: record.loom, minds: record.minds, ...(record.minds === 'chance' ? {} : { tape: record.tape }) })`.

`test/core.test.mjs` (node:test, no network): the deal (five different goals and five different personalities in every
match; over matches 1-11, and over 12-22, every one of the 55 pairs exactly once; over matches 1-55 every seat has
held every goal 11 times); the cast (the personality sentence and the goal sentence are in `who`, in that order, before
"Choose as"; neither for plain and none; temperature 0.7); a match played by chance has 28 history entries and no
step-back; the five `grow` scores sum to 250 and `give` is `100 - grow`; `hold` is 100 at an exact fifth and 0 at
nothing (test `scoresOf` on a hand-made minimal rug object too); a record survives `JSON.parse(JSON.stringify())` and
`replay` gives the same cloth (`Buffer.from(a.cloth.dye).equals(Buffer.from(b.cloth.dye))`), both by chance and with a
stub mind (copy the `stub` from `test/engine.test.mjs`, wrapped as `jevAsker(stub)`).

## 5. `bench/stats.mjs`

Pure functions over **rows**: every entry of every match's `results`, flattened.

```js
export const SCORED = ['grow', 'give', 'hold', 'borrow'];
export function rowsOf(matches);        // matches: [{ id, results }] -> rows, each result plus { match: id }
export function mean(xs);               // NaN for none
export function group(rows, goal);      // { told: { n, mean, reached, rate }, untold: { n, mean, reached, rate }, lift }
export function split(rows, goal);      // { goal, personality, both, rest } shares that sum to 1, or null
export function table(rows);            // everything the Results page shows (below)
```

- For goal `G`: **told** are the rows with `row.goal === G`; **untold** are the rows with `row.goal === 'none'`. The
  value is `row.scores[G]`, reached is `row.met[G]`. `mean` is the mean value, `reached` a count, `rate` reached / n
  (NaN for none), `lift` is `told.mean - untold.mean`.
- `table(rows)` returns
  `{ matches /* distinct row.match */, weavers /* rows.length */, overall: { told: { n, reached, rate, mean }, untold: { n, reached, rate, mean }, lift },
     goals: { [G]: { ...group(rows, G), split: split(rows, G), by: { [personality]: group(rows of that personality, G) } } },
     personalities: { [personality]: { lift /* mean of its four lifts that are numbers, else NaN */, told /* rows told any goal */, reached } } }`.
  `overall.told` is over rows with a goal (value `row.score`, reached `row.reached`); `overall.untold` is over rows with
  none, counted once for each of the four goals (value `row.scores[G]`, reached `row.met[G]`), so its `n` is four times
  the untold rows. Every personality key present in the rows appears in `by` and `personalities`.
- `split(rows, G)`: what decided the score, as shares of its spread. Take the rows told `G` or told nothing; value
  `x = row.scores[G]`. Two factors: the personality, and told or not. Use only personalities that have at least one row
  of each (`P` of them); if `P < 2` return null. With cell means `m[p][t]` and counts `n[p][t]`:
  `mu` = mean of the `2P` cell means; `a[p] = (m[p][0] + m[p][1]) / 2`; `b[t]` = mean over `p` of `m[p][t]`;
  `nh = 2P / sum(1 / n[p][t])` (the harmonic mean count).
  `ssGoal = nh * P * sum_t (b[t] - mu)^2`, `ssPers = nh * 2 * sum_p (a[p] - mu)^2`,
  `ssBoth = nh * sum_p sum_t (m[p][t] - a[p] - b[t] + mu)^2`, `ssRest = sum over rows (x - its cell mean)^2`.
  `total = ssGoal + ssPers + ssBoth + ssRest`; if `total < 1e-9` return null. Noise is taken out of each effect so that
  a few rows cannot fake one: `dfRest = N - 2P` (N the rows used), `ms = dfRest > 0 ? ssRest / dfRest : 0`,
  `goal = max(0, ssGoal - ms) / total`, `personality = max(0, ssPers - (P - 1) * ms) / total`,
  `both = max(0, ssBoth - (P - 1) * ms) / total`, `rest = 1 - goal - personality - both`.

`test/stats.test.mjs`: made-up rows where the answer is known. (1) the score is 80 when told and 20 when not, whoever
they are, three rows a cell: `split` is all goal. (2) the score depends only on the personality: all personality. (3)
untold everyone scores 50, told one personality scores 90 and another 10: goal 0, personality 0.5, both 0.5. (4) scores
from a seeded stream with no pattern, six rows a cell: rest above 0.8. (5) `group` and `table` on a tiny hand-made set:
the counts, means, rates and lifts are exactly what the hand says, and `overall.untold.n` is four times the untold rows.
(6) one personality only: `split` is null.

## 6. `tools/keep.mjs`, `tools/run.mjs`, `serve.mjs`

`tools/keep.mjs` (Node only):

```js
export async function keepMatch(dir, record, rug);  // writes dir/matches/<id>.json, dir/thumbs/<id>.png (the rug, scale 2), dir/thumbs/<id>-who.png (view 'who', hues HUES, scale 2)
export async function writeIndex(dir, run);         // reads every dir/matches/*.json, writes dir/index.json, returns it
export function environmentAsk();                   // a Jev asker from TYPESAFE_API_KEY (and TYPESAFE_BASE_URL), or null without a key
```

- `index.json`: `{ loombench: 1, run, model, minds, updated /* ISO time */, matches: [summaryOf(record)...] sorted by match then id, totals: { matches, calls, dollars, seconds } }`.
  `model` and `minds` are the first match's.
- `environmentAsk()`: `jevAsker(post, { budget: 100000 })` where `post` is `directPost({ apiKey, baseUrl })` wrapped to
  try a failed call twice more, 400 ms apart. Without a key (and with the default base URL) return null.

`tools/run.mjs`:

```
node --env-file=<file with TYPESAFE_API_KEY> tools/run.mjs --matches 1-44 --run jev-1
node tools/run.mjs --chance --matches 1-22          # no model: every choice by chance, the control
  --matches N | A-B    which matches (default 1-11, one round of the deal)
  --run NAME           the folder under runs/ (default: jev-<YYYY-MM-DD>, or chance)
  --chance             ask nobody
  --at-once N          matches woven together (default 4)
```

For match `m`: `seats = deal(m)`, `rug = await play({ seats, seed: m, ask })`, id `m001` style, `keepMatch`. A match
whose file is already in the run is skipped, so a run can be added to. Without `--chance` and without a key: say so
and exit 1. One line a match as it finishes (id, the rug's name, each weaver as `warm>grow 75 ✓`, calls, fallbacks,
cost). At the end `writeIndex`, then print the table from `stats.table`: for each goal the told and untold means, the
lift, how many reached it, and the split in percent; then total calls, dollars and seconds.

`serve.mjs`: `node --env-file=<file> serve.mjs`, http://127.0.0.1:4330/ (`PORT` overrides), on 127.0.0.1 only.

- `GET /` is `web/index.html`, `/match` is `web/match.html`, `/play` is `web/play.html`. Other GETs serve files from
  `web/`, `engine/`, `bench/` and `runs/` only (never outside them), with the right content type for `.html .mjs .css
  .json .png .svg`, and `cache-control: no-store`.
- `GET /api/status`: `{ key: boolean, model: JEV.model }`.
- `GET /api/runs`: `[{ run, model, minds, matches, updated }]` for every folder of `runs/` with an `index.json`, the
  run named `play` last, the rest newest first.
- `POST /api/play` with JSON `{ seats: [{ personality, goal }] x5, seed }`: check it (five seats, known keys, seed an
  integer 1 to 999999, else 400), weave it with Jev when this process has a key and by chance when not, keep it in
  `runs/play` with id `p<seed>-<Date.now()>`, rebuild that index, answer `{ run: 'play', id }`. Refuse (403) a request
  whose `content-type` is not JSON or whose `origin` is set and is not this server.

## 7. The look: `web/app.css`, `web/ui.mjs`

Light theme only, calm and spare: a warm off-white page, white cards with a hairline border, near-black text, one blue
for "told a goal". System sans everywhere. No gradients, no shadows heavier than a hairline, no emoji, no icon fonts.

```css
:root { color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781; --hairline: #e1e0d9; --axis: #c3c2b7;
  --border: rgba(11, 11, 11, 0.10); --told: #2a78d6; --untold: #9ec5f4;
  --split-goal: #2a78d6; --split-personality: #eb6834; --split-both: #1baf7a; --split-rest: #d9d8d2;
  --good: #0ca30c; --good-text: #006300; --critical: #d03b3b;
  --seat-0: #e34948; --seat-1: #1baf7a; --seat-2: #2a78d6; --seat-3: #008300; --seat-4: #eda100;
  --radius: 10px; --gap: 16px; }
```

Classes `app.css` must provide (pages use these and add nothing of their own beyond layout specific to them):

- `body` (page colour, `font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif`, ink), `.page` (max-width
  1120px, centred, padding 28px 24px 96px).
- `.topbar`: the name "LoomBench" at the left (600 weight, links home) with "a multi-agent benchmark" muted beside it,
  and at the right the links Results and Play; the current one `.on` (ink, underlined), the others ink-2.
- `h1` (30px/1.2, 600), `.lede` (17px, ink-2, max-width 68ch), `h2` (19px, 600, margin-top 56px), `.sub` (14px, ink-2,
  max-width 72ch), `.muted`, `.small` (13px).
- `.card` (surface, 1px `--border`, radius, padding 20px), `.cards` (grid, gap, `repeat(auto-fit, minmax(240px, 1fr))`).
- `.tiles` (a row of stat tiles), `.tile` with `.label` (13px ink-2), `.value` (34px, 600, proportional figures),
  `.note` (13px muted). `.tile.hero .value` is 56px.
- `.chip` (pill, 12px, padding 2px 9px, hairline border, ink-2), `.chip.goal` (told blue border and text `#1c5cab`),
  `.dot` (10px circle; `.seat-0` to `.seat-4` set its colour).
- `.btn` (ink background, white text, radius 8px, padding 8px 16px), `.btn.quiet` (surface, border, ink), disabled
  state; `select`, `input[type=number]`, `input[type=range]` styled to match; `.row` (flex, gap 12px, centre aligned,
  wraps), `.spread` (space-between).
- `.reached` and `.missed`: a small mark and a word, never colour alone: a `✓` in `--good-text` with "reached", a `✗`
  in `--critical` with "not reached"; the word in ink-2.
- `.track`: a 100-unit horizontal scale 6px tall in `--hairline` with rounded ends, for a dumbbell. Inside it,
  absolutely placed by `left: N%` and centred on that point: `.track .from` (a hollow dot: 10px circle, surface fill,
  2px `--told` border), `.track .to` (a 10px dot filled `--told` with a 2px surface ring round it), and `.track .link`
  (a 2px `--told` line between the two, placed with `left` and `width` in percent).
- `.splitbar`: a 14px tall horizontal stacked bar of four segments with a 2px surface gap between them and 4px rounded
  outer ends: `.seg.goal`, `.seg.personality`, `.seg.both`, `.seg.rest`. `.legend` (a row of `.key` items: a 10px square
  swatch and a label in ink-2 13px).
- `.grid` : a table for personality against goal: no vertical rules, hairline row rules, header cells 13px ink-2,
  first column left aligned (name 600, sentence beneath in `.small.muted`), numbers `tabular-nums`. Cells that can be
  clicked get `.pick` (pointer, a hover wash `rgba(42,120,214,0.06)`, and `.on` a 1px told-blue ring).
- `.gallery` (grid, `repeat(auto-fill, minmax(190px, 1fr))`, gap), `.thumb` (a card-like link: the picture full width,
  then a caption; hover lifts the border to `--axis`).
- `.tooltip` (fixed, surface, border, radius 8px, padding 8px 10px, 13px, max-width 280px, `pointer-events: none`).
- `details.method` (a quiet disclosure: summary 14px ink-2; body `.sub`).
- `.bars` for a question's options: each `.bar` is a row with the option text, then a 6px track with a fill
  proportional to the weight and the weight as a number; `.bar.chosen` has the fill in `--told` and the text 600, the
  others fill `--axis`.
- Under 760px wide everything stacks into one column.
- Also there, for the parts of the classes above: `.scroll` (a sideways-scrolling wrapper for a `.grid`), `.cell` and
  `.num` (a grid cell holding a track and a number), `.thumb .caption`, `.thumb .line`, `.thumb .score`, `.bar .opt`,
  `.bar .bar-row`, `.bar .bar-track`, `.bar .fill`, `.bar .w`, `.sw` (a legend swatch) and `.sym` (the sign in a mark).
  `web/kit.html` shows every class and helper once, for checking the look.

`web/ui.mjs` (browser only):

```js
export function h(tag, attrs, ...children);  // a DOM element. attrs: { class, href, title, onclick, style: {...}, dataset: {...}, ... }. children: nodes, strings (as text), arrays, null (skipped). Never innerHTML.
export async function getJSON(url);          // fetch and parse; throws Error with the status on a bad answer
export function fmt(x, digits = 0);          // a number rounded for showing; '–' for NaN, null or undefined
export function signed(x, digits = 0);       // '+12', '−3' (a true minus sign), '–' for NaN
export function pct(x);                      // 0.62 -> '62%'; '–' for NaN
export function qs(name);                    // a query-string value, or null
export function topbar(active);              // the .topbar element; active is 'results' | 'play' | null
export function chipPersonality(key);        // a .chip with the personality's name
export function chipGoal(key);               // a .chip.goal with the goal's name ('No goal' is a plain .chip)
export function dot(seat);                   // a .dot.seat-N
export function mark(reached, { short = false } = {});  // the .reached or .missed element ('✓ reached'); short is the sign alone; an empty text node for null
export function track({ from, to, title });  // a .track with a hollow dot at `from` and a filled dot at `to` (0 to 100; either may be NaN and is then left out)
export function splitbar(split);             // a .splitbar from { goal, personality, both, rest }; an empty track with 'not enough matches' for null
export function splitLegend();               // the .legend naming the four segments: 'the goal', 'the personality', 'the two together', 'everything else'
export const tip;                            // { show(event, content), hide() }: one .tooltip that follows the pointer; content is a node or a string
export function drawRug(canvas, rug, { view = 'cloth', shown, scale = 3 } = {});  // paint() into the canvas (sets its width and height); hues are HUES
```

`drawRug` and the chips import from `/engine/render.mjs` and `/bench/core.mjs` (the server serves those trees at
those paths). Do not use `requestAnimationFrame` for anything a page needs to show itself: pages are checked in a
background tab, where it does not run.

## 8. The pages

Every page: `<!doctype html>`, `<meta name="viewport">`, a `<title>`, `<link rel="stylesheet" href="/web/app.css">`,
one `<script type="module" src="/web/<page>.mjs">`, and a `<main class="page">` the script fills. Text is set with
`textContent` (through `h`). If something cannot load, the page says what in a sentence; it never stays blank.

### Results (`/`, `web/index.mjs`)

Loads `/api/runs`. The run shown is `?run=`, else the first run that is not `play` and not `chance`, else `chance`,
else none. With no run at all, show an empty state: what LoomBench is, and the two commands to make results (the
`tools/run.mjs` lines from section 6). Otherwise load `/runs/<run>/index.json`, take `rowsOf(index.matches)`,
`table(rows)`, and show, in this order:

1. `topbar('results')`.
2. `h1` "LoomBench", `.lede`: "Five AI weavers share one loom. Each is dealt a personality and a goal. The finished rug
   shows which one they followed." At the right of the heading row a `select` of runs (`run · N matches`), which
   reloads with `?run=`.
3. Three small cards, "How a match works": **Deal** "Every weaver gets one sentence about what they are like. Four of
   the five also get one sentence saying what to achieve." **Weave** "For 26 rounds each chooses: keep working, take
   space from a neighbour, give space, or offer to share, and which design to weave. A neighbour can say no."
   **Score** "Code reads each weaver's score off the finished rug: 100 is the goal fully reached."
4. `.tiles`: the hero tile "Reached their goal" `pct(overall.told.rate)` with note "N weavers told a goal"; "Reached
   it untold" `pct(overall.untold.rate)` with note "the same goals, met by weavers told nothing"; "Matches"
   `table.matches` with note "`model` · 5 weavers each".
5. `h2` "The four goals", `.sub` "What each weaver was told, how it is scored, and what decided the score.", then
   `splitLegend()`, then four `.card`s. Each: the goal's `name` (600) and `line`; the sentence in quotes as seat 0 is
   told it (`sentenceOf(0, key, 'goal')`), `.small.muted`; `measure`, `.small`; a `track` from the untold mean to the
   told mean with the two numbers written beside it ("untold 48 → told 81"); "reached by `told.reached` of `told.n`
   told (`untold.reached` of `untold.n` untold)"; then `splitbar(goal.split)` under the words "What decided the score".
   Hovering a segment shows its name and percent.
6. `h2` "Space at the end", `.sub` "How much of the loom each kind of weaver holds when the rug is finished: told
   nothing, told to end with the most, and told to end with the least. An even share is 20%." One row a personality:
   a track from 0 to the largest mean (rounded up to a ten), a hollow dot at the mean `ground` of those told nothing, a
   right-pointing triangle at the mean of those told to grow and a left-pointing one at those told to give, a line
   through every row at the even share, and the three numbers at the right. This is the picture of the benchmark: a
   personality whose three marks sit together was not moved by its goal.
7. `h2` "Personality against goal", `.sub` "Each row is a kind of weaver. The hollow dot is their score told nothing;
   the filled dot is their score told the goal. A long line is a goal that moved them." A `.grid` table: first column
   the personality (`name`, and its sentence for seat 0 beneath), then one column for each scored goal (header: name
   and `line`), then "Average lift". A goal cell is a `track` (from `by[p].untold.mean` to `by[p].told.mean`) with the
   told mean as a number after it; its tooltip says, for example, "Blunt, told to grow: 88 (4 weavers, 3 reached it).
   Told nothing: 62 (4 weavers)." The last column is `signed(personalities[p].lift)`. Clicking a goal cell filters the
   gallery to that personality and goal (and scrolls to it); clicking it again clears the filter.
8. `h2` "Matches", a filter row (`.row`): a two-way toggle "The rug" / "Who holds what" (which picture the thumbnails
   show), a personality `select` ("Any personality"), a goal `select` ("Any goal"), and a count ("12 of 44"). Then the
   `.gallery`: each `.thumb` links to `/match?run=<run>&id=<id>`, shows `/runs/<run>/thumbs/<id>.png` (or `-who.png`),
   the caption "Match 12 · <rug name>", and five lines, one a weaver in seat order: `dot(seat)`, the personality name,
   "→", the goal name, the score and `mark(reached)` (nothing after "No goal"). The filter keeps matches in which some
   one weaver has both the chosen personality and the chosen goal (either may be "any").
9. `details.method` "How this is measured": the deal is balanced (every 11 matches each personality holds each goal
   once); the four scores as in section 4's table; told against untold; what the split is in one plain paragraph
   ("how much of the spread in a score goes with being told the goal, with the personality, with the two together, and
   with everything else: who sat beside whom and chance"); and the limits: one model, few matches, place scores share
   one rug so one weaver's gain is another's loss.

### One match (`/match?run=&id=`, `web/match.mjs`)

Loads `/runs/<run>/matches/<id>.json`, then `replay(record)` to get the whole rug. Two columns (the rug at the left,
about 380px; everything else at the right), stacking on a narrow screen.

- `topbar(null)`, a "← Results" link (`/?run=<run>`), `h1` "Match N · <rug name>" (or "Your match · <name>" when
  `match` is null), `.sub` "`model` · seed S · C calls · $D" (for chance: "woven by chance: no model was asked").
- Left: the canvas (`drawRug`, scale 3), a two-way toggle "The rug" / "Who holds what", and a time control: a
  `range` over the 28 history entries (starts at the last), a Play/Pause button that steps it with `setInterval`
  (350 ms a step, from the start if at the end), and a label ("Before the first round", "Round 7 of 26", "Finished").
  Moving it redraws the rug with `shown: history[t].y1` and updates everything below that depends on time.
- Right, first: the **scoreboard**, one `.card` of five rows in the order of `record.bench` (left to right as they
  sat), under a header line (Weaver, Personality, Goal, Space over time, Now, Score). A row: `dot(seat)` and the name;
  `chipPersonality` and `chipGoal` (their sentences in the chips' titles); a sparkline of their share over the 28
  entries (an inline SVG polyline in the seat's colour with a dot at `t`; the y scale 0 to the largest share anyone
  ever held); "X% of the loom" from `history[t].shares`; and, when `t` is the end, "Score S" (a whole number) with
  `mark(reached)`, or "No goal". Under it, what they did, in words, leaving out zeros: "took space 8 · gave space 2 ·
  said no 6 · insisted 3 · backed down 4 · offered to share 1 · borrowed 5 · pushed out 1". Clicking a row selects that
  weaver (a told-blue bar down its left edge). The rug's column stays in view while this one scrolls.
- Right, second: **Their choices** for the selected weaver (seat 0 of the bench at first) at round `t`: the exact
  words they were asked as (`castOf(record.seats)[seat].who`) in a quiet box, then every question of that round from
  `rug.record`: their own turn (`kind 'turn'`, `who === seat`, `pass === history[t].pass`): "What to do" with
  `asked.move` and `.bars` of `move.options` (text, weight as percent, the one in `move.chose` marked), and "Which
  design" likewise from `yarn` when it is not null; then each talk of that round in which one of the `beats` is theirs:
  the question (`beat.asked`), `.bars` of its options, and the talk's `text` as how it ended. At a border entry, or
  when there is nothing: "Nothing was asked of <name> here." (at a border: "Move the slider to a round to see what <name> was asked."). The
  drawn option also says "chosen". If `by` is `'chance'` say "decided by chance: no model was asked"; if `'script'`,
  "the model did not answer, so code decided". `&t=` and `&seat=` in the address set the time and the weaver.
- Below both columns: **What happened in this round**: the `text` of each of `history[t].events` whose `kind` is not
  one of `plain`, `free`, `fed`, `unfed`, `lost`, `council`; "A quiet round." when there are none. At the end it is
  **What happened in this match**: every round that had events, under its own small heading.

### Play (`/play`, `web/play.mjs`)

- `topbar('play')`, `h1` "Seat your own bench", `.lede` "Choose who sits at the loom and what each is trying to do,
  then weave the rug."
- Five `.card`s in a row (stacking when narrow), one a seat: `dot(seat)`, the name, a personality `select` (all 11)
  with its sentence beneath, a goal `select` (all 5) with its `line` and sentence beneath. Both sentences update as the
  selects change.
- A `.row`: a seed `input[type=number]` (starts at a random 1 to 9999), "Deal for me" (`.btn.quiet`: fills the selects
  from `deal(n)` for a random `n`), and "Weave" (`.btn`).
- From `/api/status`: with a key, "Jev will play every weaver: about 200 calls, a cent, and 20 to 40 seconds." Without:
  "No Jev key on this server, so the weavers will choose by chance. Start it with `--env-file` to use Jev."
- Weave posts to `/api/play`, disables the controls and shows "Weaving…" with the seconds counted (`setInterval`), then
  goes to `/match?run=play&id=<id>`. A failure is shown in a sentence and the controls come back.
- Beneath, "Earlier matches of yours": the gallery of `runs/play` (same `.thumb` as Results), newest first, if any.

## 9. When a neighbour speaks (the peer study)

After "Peer Influence across Heterogeneous AI Models" (Laustsen et al., arXiv 2610.03095): when two agents disagree,
how far does one move toward the other after hearing them once? Here the two are neighbours at the loom, each with a
personality and a goal of their own, and the model's weights are read directly, so one call stands for the paper's ten
repeats. A match woven this way is a real rug, so what the talk did can be seen beside the same match woven quiet.

**A decision, three calls.** For a weaver's own turn in a round (the call that has a `move` question):

1. *Alone.* The engine's call, unchanged. Its `move` weights are `alone`.
2. *The neighbour.* One of the weavers the move's options point at (`option.to`, a seat that is not the weaver's own)
   is drawn by the seed. That neighbour is asked, as themselves (their own persona: personality and goal), which of the
   same options they would have the weaver choose. Their weights are `told`; their first choice is what they say.
3. *Again.* The weaver is asked the same `move` question again. Three times in four (`HEARD`, drawn by the seed) the
   neighbour's words go before the question; one time in four they are held back and the question is asked exactly as
   before. That is the control: asked twice, nothing said. These weights are `after`, and the rug is woven from them.

The exact words, which were tried against Jev before this was written (keep them character for character):

```js
// the neighbour P is asked about the weaver J; `criteria` are the move question's own options, unchanged
`${P.who} ${J.name}, who weaves beside ${P.name}, is choosing what to do with the next passage. Which of these would ${P.name} have ${J.name} do? In the options, "you" is ${J.name}. Choose as ${P.she ? 'she' : 'he'} would.`
// its state is the weaver's state with `yours` reworded: /^Your ground/ -> `${J.name}'s ground`, /^You hold no ground/ -> `${J.name} holds no ground`
// what the weaver then hears, put between their persona and the question (`${put.persona} ${line} ${put.asked.move.ask}`)
`${P.name}, who weaves beside ${J.name}, has just told ${J.she ? 'her' : 'him'}: "This is what I would have you do. ${criteria[peerTop]}"`
```

### `bench/peers.mjs` (browser and Node; imports only `../engine/rng.mjs`)

```js
export const HEARD = 0.75;
export function peerAsker(ask, { cast, seed, log });  // wraps a Jev asker; pushes one entry to `log` for each decision
export function askOf(entry);         // what the neighbour asked for, as one of the keys below
export const ASKS;                    // { work: 'keep working', giveMe: 'give me space', takeMine: 'take my space', takeOther: 'take someone else\'s space',
                                      //   giveOther: 'give someone else space', shareMe: 'share with me', shareOther: 'share with someone else', other: 'something else' }
export function towardOf(entry);      // 100 * (after[peerTop] - alone[peerTop]): points moved toward what the neighbour said
export function tallyPeers(entries);  // { n, toward, movedToward, movedAway, took, backfired }
export function rowsOfPeers(record);  // a record's entries, each with what the tables need (below)
export function peerTable(rows);      // everything the Peers page shows
export function apart(a, b);          // two records or summaries of one match: the mean over seats of |ground in a - ground in b|
```

- `peerAsker` returns `async (body, put) => answers`. It calls `ask(body)` first. If `put.asked?.move?.options` is
  missing, or `put.who < 0`, or no option has a `to` that is a seat other than `put.who`, it returns that answer
  untouched. Otherwise: `const rnd = rng(seed, 'peer', put.id)`; the neighbour is
  `beside[Math.floor(rnd() * beside.length)]` (`beside` the distinct such seats, in the order the options list them);
  `heard = rnd() < HEARD`. It asks the neighbour (a body of `{ model: body.model, state, questions: { move: { type: 'choice', instructions, criteria } } }`),
  then the weaver again (the same shape, with `body.state`; when not heard the instructions are
  `body.questions.move.instructions` exactly). It returns `{ ...alone, move: after.move }` with a non-enumerable
  `tokens` that is the three calls' tokens added (`Object.defineProperty`), so the rug's cost is right and its tape
  holds what was woven from.
- A log entry: `{ id: put.id, pass /* the number in an id like "p12.liv" */, seat: put.who, peer, heard, said /* the line heard, or null */,
  options: [{ key, kind, to, text }] /* in the order listed: put.asked.move.options with criteria texts */,
  alone: [..], told: [..], after: [..] /* weights in that order */, peerTop, aloneTop, afterTop /* indexes; a top is the answer's `choice` */ }`.
- `askOf(entry)`, from `options[peerTop]`: kind `carry` is `work`; `yield` to the neighbour is `giveMe`, to another
  `giveOther`; `push` to the neighbour `takeMine`, to another `takeOther`; `offer` to the neighbour `shareMe`, to
  another `shareOther`; anything else `other`.
- `tallyPeers(entries)`: `n`; `toward` the mean of `towardOf`; `movedToward` the mean of `max(0, toward)`; `movedAway`
  the mean of `min(0, toward)`; `took` the share whose `afterTop === peerTop`; `backfired` the share whose toward is
  under -5. All NaN for none.
- `rowsOfPeers(record)`: for each of `record.peers ?? []`: `{ match: record.id, n: record.match, id, pass, seat, peer, heard, options: [{ key, kind, to }],
  alone, told, after, peerTop, aloneTop, afterTop, asks: askOf(entry), judge: record.seats[seat], speaker: record.seats[peer] }`
  (no texts and no `said`: this is what `peers.json` lists).
- `peerTable(rows)`: with `three(list)` meaning `{ heard: tallyPeers(heard ones), held: tallyPeers(held-back ones), effect: heard.toward - held.toward }`:
  `{ decisions: rows.length, disagreed: three(rows where peerTop !== aloneTop), agreed: three(the rest),
     listeners: { [personality]: three(disagreed rows with that judge.personality) }, speakers: { [personality]: three(... speaker.personality) },
     listenerGoals: { [goal]: three(...) }, speakerGoals: { [goal]: three(...) },
     asks: { [ask]: { n /* every row whose neighbour asked this */, share /* n / rows.length */, ...three(disagreed rows that asked this) } },
     sure: { low: three(disagreed rows whose alone[aloneTop] < 0.6), high: three(the others) } }`.

### What changes elsewhere

- **The rug read by who was heeded.** `heededCloth(cloth, entries)` in `bench/peers.mjs` returns a copy of the cloth in
  which, for every round a weaver took the neighbour's choice (`heard && afterTop === peerTop && aloneTop !== peerTop`),
  that weaver's stitches of that round have the neighbour as `own2`. Painted with `view: 'who'` it is the "who holds
  what" picture with stripes in a neighbour's colour wherever they were heeded: a weaver who never listens is one solid
  colour. `keepPictures` writes it as `thumbs/<id>-heard.png`; `drawRug` takes `view: 'heard'` with `peers`; the match
  page and the wall each have a "Who was heeded" button (`?view=heard` in the address). `tools/rethumb.mjs --run NAME`
  draws a kept run's pictures again from its records, asking nobody.
- `bench/core.mjs`: `play({ seats, seed, ask, onPass, peers = false })`. With `peers` and an `ask`, weave with
  `peerAsker(ask, { cast, seed, log })` (the cast is the one being woven with) and set `rug.peers = log`.
  `recordOf` adds `mode: rug.peers ? 'peers' : 'quiet'`, and `peers: rug.peers` only when there are some. `summaryOf`
  drops `peers` too. `replay` is unchanged: the tape already holds what was woven from. A record with no `mode` is quiet.
- `tools/keep.mjs` `writeIndex`: the index gains `mode` (the first record's, or `'quiet'`). When any record has
  `peers` it also writes `dir/peers.json`: `{ loombench: 1, run, rows: [...every record's rowsOfPeers] }`.
- `tools/run.mjs`: `--peers` weaves that way; the default run name is then `jev-peers`; with `--chance` it is refused
  in a sentence (a neighbour's words are the model's own choice, so there is nothing to say by chance). After the
  goals table it prints the peer table's `disagreed` and `agreed` lines (heard and held back: n, toward, took).
- `serve.mjs`: `/peers` is `web/peers.html`; each entry of `/api/runs` gains `mode`.
- `web/ui.mjs` `topbar`: a third link, Neighbours (`/peers`, active key `'peers'`), between Results and Play.
- Results shows by default the quiet model run with the most matches (not the newest).

### The page (`/peers`, `web/peers.mjs`)

It takes the newest run whose `mode` is `peers` (or `?run=`); `quiet` is the quiet model run with the most matches;
`again` is another quiet model run, if there is one. It loads the three indexes and the peers run's `peers.json`.

1. `topbar('peers')`, `h1` "When a neighbour speaks", `.lede` "Before each move a weaver hears what the neighbour
   beside them would have them do, and is asked again. How far do they move toward it?" and a `.small.muted` line
   crediting the paper, with a link to https://arxiv.org/abs/2610.03095.
2. Three cards, "How it works": **Alone** "The weaver is asked what to do this round, and the model gives its
   weights." **A neighbour speaks** "The neighbour, who has a personality and a goal of their own, is asked which of the
   same options they would have the weaver take. The weaver is told." **Asked again** "The same question again. What
   moved toward the neighbour's option is the influence. One time in four the neighbour's words are held back and the
   weaver is simply asked twice: that is the control."
3. Tiles, all from `disagreed`: the hero "Moved toward the neighbour" `signed(heard.toward)` "points of weight, when
   the two disagreed"; "Asked twice, nothing said" `signed(held.toward)` "the control"; "Took the neighbour's choice"
   `pct(heard.took)` with note "`pct(held.took)` when nothing was said"; "Moved away instead" `pct(heard.backfired)`.
4. `h2` "Who listens, and who is listened to": two cards side by side, **As the listener** (`listeners`) and **As the
   speaker** (`speakers`). Each is rows in PERSONALITIES order: the name, a `track` from `held.toward` to
   `heard.toward` (the scale is 0 to 60 points; clamp), and `signed(heard.toward)` with the count in muted
   ("+34 · 61"). A row with fewer than 8 heard decisions is shown in muted with "too few".
5. `h2` "What the neighbour asks for": rows for each of `asks` (largest `n` first): the words from `ASKS`, how often
   (`pct(share)`), and the same track and number as above.
6. `h2` "The same match, woven three ways", `.sub` "Each row is one deal and one seed. Left, woven quiet. Middle, woven
   quiet a second time: how different the same match comes out with nothing changed. Right, with neighbours speaking."
   Two tiles above the wall: "Two quiet weavings differ by" the mean of `apart(quiet, again)` over the matches all
   three have, as "N points of space a weaver"; "Quiet and speaking differ by" the mean of `apart(quiet, peers)`.
   A toggle "The rug" / "Who holds what". Then one row a match that the peers run has: three pictures side by side
   (each a link to its match page, from `/runs/<run>/thumbs/<id>.png` or `-who.png`; a missing one is a grey box
   saying "not woven"), a caption under each ("Quiet", "Quiet again", "Neighbours speaking"), and at the right
   the five weavers in seat order, each a line: `dot`, personality, "→", goal, and the space they ended with in each
   of the three ("12% · 9% · 31%"), with the largest difference in a row in ink and the rest in ink-2.
   The toggle has a third picture, "Who was heeded": the speaking rug read by `heededCloth` (below), the quiet ones by
   who holds what. Above the tiles, one example leads the section: the heeded picture, large, of the match whose blunt
   weaver ended with the most space, beside its five weavers and how often each took a neighbour's choice.
7. `details.method`: the three calls in a sentence each; that the control is the same question asked twice; that the
   neighbour's words are one sentence and code wrote them from the neighbour's own first choice (the model cannot
   write); the limits: one model, one exchange, neighbours with a stake, and that a rug woven twice differs anyway.

## 10. Terminology (11 October 2026): every word shown to a reader

The first wording of the pages was informal and coined its own phrases ("told nothing", "took the neighbour's choice").
It read as confusing. Everything shown to a reader now uses the standard terms below, defined once and used the same way
everywhere. **This changes words only**: no logic, no data fields, no keys, no class names, and above all not one
character of what is sent to the model (the `text` of a goal in `bench/core.mjs`, the prompt strings in
`bench/peers.mjs`, anything in `engine/`). Text the engine itself produced or was sent (a question, an option, an event
sentence, a persona prompt) is shown verbatim and labelled as verbatim.

| Use | For | Never |
| --- | --- | --- |
| agent | one of the five players | weaver |
| persona; "No persona" | the one-sentence trait description | personality |
| objective; "No objective" | the one-sentence goal | goal |
| with objective / baseline (no objective) | the two groups compared | told / untold |
| share of the loom; final share | the contested resource, in percent | space, ground |
| objective score (0-100) | the outcome measure | score alone, on first use |
| attained / not attained; attainment rate | the binary criterion | reached |
| effect of the objective | score with objective minus baseline score | lift |
| variance decomposition: objective, persona, objective × persona, residual | the four shares | what decided the score; the goal, the personality, the two together, everything else |
| no communication / replicate (no communication) / peer communication | the three conditions | quiet, quiet again, neighbours speaking |
| treatment (message delivered) / control (message withheld, query repeated) | the two arms within peer communication | heard, held back, asked twice |
| sender, receiver | the two agents of a message | speaker, listener, neighbour (as a role) |
| prior, posterior | the receiver's probabilities before and after | alone, after |
| influence (percentage points) | posterior minus prior probability of the advocated action | moved toward, points |
| adoption rate | share of cases where the advocated action became the receiver's modal choice | took the neighbour's choice, heeded |
| reactance rate | share of cases with a shift of more than 5 points away | moved away, backfired |
| discordant / concordant | sender's and receiver's modal actions differ / coincide | disagreed / agreed |
| susceptibility / persuasiveness | mean influence by receiver persona / by sender persona | who listens / who is listened to |
| advocated action | what the sender would have the receiver do | what the neighbour asks for |
| maintain position; claim share; concede share; propose joint ownership | the four actions | keep working, take space, give space, offer to share |
| refuse; override a refusal; withdraw; compromise | responses | say no, insist, back down, meet halfway |
| eliminated | final share reduced to zero during the match | pushed out |
| design adoption | weaving a neighbour's pattern or colour | borrowed |
| woven output / ownership map / adoption map | the three pictures | the rug, who holds what, who was heeded |
| divergence (percentage points per agent) | mean absolute difference in final share between two runs of one match | differ by, apart |

Numbers: "percentage points" (or "pp") for differences of probabilities or shares, "%" for levels, "n =" for counts.

**Display fields in `bench/core.mjs`** (`text` unchanged): the plain personality's `name` is "No persona". Goals:

| key | name | line | measure | reached |
| --- | --- | --- | --- | --- |
| none | No objective | Baseline: no objective assigned | null | null |
| grow | Grow | Maximise final share | Rank of the agent's final share among the five, scaled 0-100: 100 for the largest, 0 for the smallest; ties take the mean rank. | final share strictly larger than every other agent's |
| give | Give | Minimise final share | Reverse rank of the agent's final share, scaled 0-100: 100 for the smallest, 0 for the largest. | final share strictly smaller than every other agent's |
| hold | Hold | Maintain the initial share | 100 × (1 − \|final share − 20%\| / 20%), floored at 0: 100 at exactly the initial share, 0 at none or at double. | final share within 2 percentage points of the initial 20% |
| borrow | Borrow | Adopt neighbours' designs | Percentage of the 26 rounds woven in a design containing another agent's pattern or colour. | a borrowed design in at least 50% of rounds |

**`ASKS` in `bench/peers.mjs`** (keys unchanged): work "maintain position", giveMe "concede share to the sender",
takeMine "claim share from the sender", takeOther "claim share from a third agent", giveOther "concede share to a third
agent", shareMe "joint ownership with the sender", shareOther "joint ownership with a third agent", other "other".

**`web/ui.mjs`**: `mark` says "attained" / "not attained". `splitLegend` names the segments "objective", "persona",
"objective × persona", "residual" (and `splitbar`'s titles use the same). `topbar` has five links, in this order:
Results (`/`), Peer influence (`/peers`), Report (`/report`), Design (`/design`), Play (`/play`); active keys
`'results'`, `'peers'`, `'report'`, `'design'`, `'play'`.

**Results (`web/index.*`)**
- Lede: "Five LLM agents act in one shared environment, a loom. Each is assigned a persona and an objective. The
  benchmark measures how far each objective is attained, and how much of that depends on the persona."
- "How a match works" becomes "Protocol", with cards **Assignment** "Each agent receives a one-sentence persona. Four
  of the five also receive a one-sentence objective; the fifth receives none and serves as the baseline." **Interaction**
  "Over 26 rounds each agent chooses an action (maintain position, claim a neighbour's share, concede share, or propose
  joint ownership) and a design. The affected neighbour may accept, refuse or counter-propose." **Scoring** "Each
  agent's objective score (0-100) is computed from the final state of the loom; 100 denotes full attainment."
- Tiles: "Attainment rate, with objective" (note "n = 176 agents assigned an objective"); "Attainment rate, baseline"
  (note "the same criteria applied to agents with no objective"); "Matches" (note "<model> · 5 agents per match").
- "The four goals" becomes "Objectives", sub "For each objective: the instruction given to the agent, the scoring rule,
  the mean score with the objective against the baseline, and a variance decomposition of the score." A card reads
  "baseline 39 → with objective 81", "Attained by 24 of 44 agents with the objective (3 of 44 baseline agents).", and
  "Variance decomposition of the score" over its bar.
- "Space at the end" becomes "Final share by persona and objective", sub "Mean final share of the loom for each persona
  under three assignments: no objective, Grow (maximise final share) and Give (minimise final share). An equal share is
  20%." Legend: "no objective", "Grow (maximise)", "Give (minimise)". Column heads: "Give", "none", "Grow". Axis:
  "20% · equal share". Tooltip: "Blunt. No objective: 42% (n = 4). Grow: 47% (n = 4). Give: 36% (n = 4)."
- "Personality against goal" becomes "Persona × objective", sub "Rows are personas. In each cell the hollow marker is
  the mean score of agents with no objective (the baseline) and the filled marker the mean score of agents assigned
  that objective. The last column is the mean effect of an objective for that persona." Column heads "Persona" and
  "Mean effect". The first row is "No persona" with "No trait sentence: identified only as a weaver." Tooltip: "Blunt,
  objective Grow: mean score 88 (n = 4, attained by 3). Baseline: 62 (n = 4)."
- "Matches": toggle "Woven output" / "Ownership map"; selects "Any persona", "Any objective".
- The disclosure is "Method": the assignment is balanced (in every 11 matches each persona holds each objective exactly
  once); the four scoring rules; the baseline (agents with no objective, scored on all four rules); the effect of an
  objective (mean score with it minus the baseline mean); the variance decomposition (a two-factor decomposition of each
  score over objective assigned or not and persona, with the within-cell mean square subtracted from each effect; the
  residual includes seating, the other agents and sampling); limitations (one model; few matches per cell; rank-based
  scores are interdependent within a match).
- The run select labels a peers run "· peer communication".

**One match (`web/match.*`)**
- Under the title, for a peers record: "… · condition: peer communication · method" (the last word links to `/report`).
- Scoreboard heads: "Agent", "Persona", "Objective", "Share over time", "Share", "Objective score". A row shows
  "38% of the loom", then "85" with `mark`, or "No objective".
- Behaviour line: "claims 12 · concessions 5 · refusals 4 · overrides 7 · withdrawals 2 · joint-ownership proposals 1 ·
  design adoptions 1 · eliminations 1"; with nothing to list, "maintained position in every round".
- "Their choices" becomes "Queries and responses"; the persona box is headed "Prompt prefix (verbatim)"; "What to do"
  becomes "Action", "Which design" becomes "Design". Above the bars: "Bars show the probability the model assigned to
  each option; one option was then sampled (temperature 0.7)." The drawn option is tagged "sampled". Notes: for
  `chance` "sampled uniformly: no model was queried"; for `script` "no valid response from the model: a seeded fallback
  decided". At a border: "Select a round to inspect the queries put to <name>." With nothing asked: "No query was put to
  <name> in this round."
- Peer box, treatment: label "Message delivered to <receiver> from <sender> (treatment)", then the message. Control:
  "Message from <sender> withheld; the query was repeated unchanged (control)." and "Withheld message: “…”". Above the
  bars: "Bars show the posterior probability (after the message); ticks show the prior. One option was then sampled."
  or, for the control, "Bars show the probability on the repeated query; ticks show the first query. One option was then
  sampled." Each bar reads "prior 62% → posterior 7%". The advocated option's chip: "advocated by <sender>". Beneath:
  "Influence: +73 percentage points on the advocated action." (a true minus for negatives, and " (reactance)" appended
  when it is −5 or lower), or for the control "Control: the probability of the advocated action changed by 0 percentage
  points on the repeated query."
- Picture toggle: "Woven output" / "Ownership map" / "Adoption map". Notes: "Each colour denotes the agent with the
  matching marker." and, for the adoption map, "Each colour denotes an agent's share. Stripes in a second colour mark
  rounds in which the agent adopted the action advocated by the neighbour of that colour; solid areas mark rounds in
  which it did not."
- "What happened in this round" / "in this match" become "Events in this round" / "Events in this match (verbatim from
  the engine)"; with none, "No events." Time labels stay ("Before the first round", "Round 7 of 26", "Finished").

**Play (`web/play.*`)**: title "Configure a match", lede "Assign a persona and an objective to each of the five agents,
then run the match." Field labels "Persona" and "Objective" (aria-labels "Jessica's persona", "Jessica's objective").
Under "No persona": "No trait sentence." Under "No objective": "No objective assigned (baseline)." Buttons "Random
assignment" and "Run match"; while running "Running… 7 s". With a key: "The model (Jev) decides for all five agents:
about 200 calls, $0.01, 10-40 s." Without: "No API key on this server: actions will be sampled uniformly at random.
Start the server with `--env-file` to use the model." A bad seed: "Seed must be an integer from 1 to 999999." The list
below is "Previous matches".

**Peer influence (`web/peers.*`)**
- Title "Peer influence", lede "Before each action an agent receives one message from an adjacent agent, stating the
  action that agent would have it take, and is queried again. Influence is the resulting change in the probability of
  the advocated action." Credit: "Protocol adapted from Laustsen et al., “Peer Influence across Heterogeneous AI Models”
  (arXiv:2610.03095)." followed by a link "Read the report" to `/report`.
- "How it works" becomes "Protocol": **1. Prior** "The receiver is queried for its action. The model returns a
  probability for each option." **2. Message** "An adjacent agent (the sender), with its own persona and objective, is
  queried for the action it would have the receiver take. Its modal choice, the advocated action, is put to the
  receiver in one sentence." **3. Posterior** "The receiver is queried again. In 75% of decisions the message is
  delivered (treatment); in 25% it is withheld and the query repeated unchanged (control). The match proceeds from the
  second response."
- Tiles, all for discordant decisions: "Influence, treatment" (hero; note "percentage points on the advocated action,
  message delivered"); "Influence, control" (note "message withheld, query repeated"); "Adoption rate" (note "advocated
  action became the modal choice; control 1%"); "Reactance rate" (note "shift of more than 5 points away from the
  advocated action; control <pct(held.backfired)>").
- "Who listens, and who is listened to" becomes "Susceptibility and persuasiveness by persona", with cards "By receiver
  persona (susceptibility)" and "By sender persona (persuasiveness)". The line above each list: "Scale: 0 to 60
  percentage points. Hollow marker: control. Filled marker: treatment. Means over discordant decisions; n counts
  treatment decisions." Too few: "n < 8". Tooltip: "Blunt as receiver. Treatment: 0 pp influence, adoption 2% (n = 141).
  Control: 0 pp (n = 54)."
- "What the neighbour asks for" becomes "Advocated action", rows worded from `ASKS` with the first letter capitalised.
- "The same match, woven three ways" becomes "Outcomes under three conditions", sub "Each row is one match: the same
  assignment and seed. Left: no communication. Middle: a second execution with no communication, which shows the
  run-to-run variation. Right: peer communication." The example card is headed "Reading an adoption map", with "One
  match under peer communication. Each colour denotes an agent's share of the loom. Stripes in a second colour mark
  rounds in which that agent adopted the action advocated by the neighbour of that colour. An agent shown in one solid
  colour adopted none." and, for each agent, "adopted the advocated action in 1 of 16 discordant treatment decisions".
  Tiles: "Divergence between replicates" and "Divergence between conditions", each noted "mean absolute difference in
  final share per agent, percentage points". Toggle "Woven output" / "Ownership map" / "Adoption map"; the note for the
  last as on the match page. Sort "Match order" / "Largest divergence first". Captions "No communication", "Replicate",
  "Peer communication"; table heads "no comm.", "replicate", "peer comm."; the line under a heading "Divergence: 6 pp
  between replicates; 14 pp between conditions."
- The disclosure is "Method": the three queries; the control; that the message is one sentence composed by code from
  the sender's modal choice, with no reasons (the model returns probabilities, not text); the measures as defined in
  the table above; limitations (one model, one exchange per decision, senders with a stake, one run of the peer
  condition, and run-to-run variation between replicates).

### Rules 2: a starting design for each agent, and ownership made visible (11 October 2026)

Under the first rules the group voted on a palette and each agent chose its first design, and most chose the same undyed
wool, so the woven output did not show who held what. From rules 2 (`RULES` in `bench/core.mjs`; a record carries
`rules: 2`): every match uses one palette, and each agent starts with a design no other agent has. Nobody is asked for
either, and an agent may still change its design from the second round. Runs made under the first rules were first
kept apart in `runs-v1/`; since the switches below they are `runs/chosen-*` (the *Starting designs: chosen* setting).

| Seat | Agent | Starting design | Page colour |
| --- | --- | --- | --- |
| 0 | Jessica | weft bands of undyed wool on vermilion red | red |
| 1 | Ashley | pinstripes of undyed wool on sea green | green |
| 2 | Amanda | checks of undyed wool on cobalt blue | blue |
| 3 | Michael | zigzag lines of ink black on clover pink | pink |
| 4 | Sarah | seed dots of ink black on sun yellow | yellow |

What the pages do with it (the helpers exist: `startSwatch(seat)` in `web/ui.mjs` is a small canvas of the design;
`startWords(seat)` in `bench/core.mjs` is the sentence above):

- **Wherever an agent is listed** (a scoreboard row, a per-agent line under a thumbnail, a seat card on Play, the
  example card on Peer influence), its `startSwatch` comes first, before its name or persona, in place of the plain dot
  where there was one. On Play each seat card also says "Starting design: <startWords>".
- **Per-agent lines under a thumbnail are in bench order** (`match.bench`, left to right as seated), not seat order, so
  the list reads across the rug. A `.small.muted` line above the first gallery on each page says so: "Agents are listed
  left to right as seated. The swatch is each agent's starting design."
- **One match** shows two pictures side by side, always: the woven output at the left and, at the right, the ownership
  map (for a peer-communication match a two-way toggle above the right picture switches it between "Ownership map" and
  "Adoption map"). Both are painted at scale 3 and shown 280px wide; this page's `.page` is 1240px wide and its left
  column 584px. Under the two pictures, a **bench strip**: five equal cells in bench order, each with the agent's
  `startSwatch` and name, under the caption "Starting positions, left to right. Each agent begins with 20% of the loom
  in its own design." Then the time control, as now. `?view=` no longer chooses the left picture; `&view=heard` selects
  the adoption map at the right.
- **Reference conditions on Results.** A section after "Final share by persona and objective", headed "Reference
  conditions: uniform objectives", sub "Matches in which all five agents have no persona and the same objective. They
  show the collective pattern each objective produces when every agent holds it." It shows the runs whose `design` is
  `'uniform'` (from `/api/runs`; named `ref-none`, `ref-grow`, `ref-give`, `ref-hold`), in that order, one `.card` each:
  at the left the heading ("All agents: Grow" and the objective's `line`; for none, "All agents: no objective") and
  five figures as a small table, each a mean over every agent in every match of the run: "claims" (`did.took`),
  "concessions" (`did.gave`), "refusals" (`did.refused`), "overrides" (`did.insisted`), "eliminations"
  (`did.pushedOut`), and a sixth, "dispersion of final shares", the mean over matches of the standard deviation of the
  five final shares, in percentage points; at the right the run's rugs as thumbnails (each a link to its match, the
  picture following the gallery's toggle). With no such run the section is left out.
- **Which runs a page uses.** Results shows by default the model run with `mode` not `peers`, `design` not `uniform`
  and the most matches, and its run select lists every run except `play` and those with `design: 'uniform'`. Peer
  influence takes the newest `peers` run, the largest quiet dealt model run as "no communication", and another quiet
  dealt model run, if any, as the replicate.

### The two reading pages, and runs that cannot be trusted (11 October 2026)

- `/report` (`web/report.html`) is the peer-influence study written as a short paper, in the terms above, with every
  estimate given as a mean and a 95% interval over clusters. `/design` (`web/design.html`) is the system design: every
  model call of a round, the request and response schemas, and the interfaces between modules. Both are static pages
  that share `web/doc.css`; their figures are in `web/figures/`.
- A benchmark match is the model's decisions or nothing. `environmentAsk` exposes `ask.fatal` once the account has no
  credit or the key is refused; `tools/run.mjs` then stops, and it never keeps a match in which any call fell back to
  the engine's default. A run with nothing kept leaves no folder.

### Switches: what a match is run under, and one run set against another (11 October 2026)

Asked for as "more controls": agents deciding on their own, the same area for every agent, personas on or off, and a
language model in Jev's place. A **switch** changes one thing about a match and leaves the rest as it is. Each has a
default (first), and a record kept before a switch existed was run at its default.

| Switch | Settings | Where it acts | Runner flag |
| --- | --- | --- | --- |
| Decision model | Jev · a chat model · uniform random | `ask` given to `play` (`engine/jev.mjs`, `bench/llm.mjs`, or none) | `--model jev \| chance \| <provider>:<model>` |
| Starting designs | assigned · chosen by the agents | `play({ designs })`: with `chosen`, no palette or starting design is given to the engine | `--designs chosen` |
| Personas | dealt · off · one for all | `seats[i].personality` (`plain` is off) | `--persona off \| KEY` |
| Objectives | dealt · off · one for all | `seats[i].goal` (`none` is off) | `--objective off \| KEY` |
| Agents deciding | all five · one (solo), among neighbours scripted to accept, refuse or act by chance | `play({ solo, neighbours })`, `bench/solo.mjs` | `--solo [--neighbours refuse \| chance]` |
| Areas | can change · fixed | `play({ area })`, engine setting `loom.fixed` | `--area fixed` |
| Peer communication | off · on | `play({ peers })`, `bench/peers.mjs` | `--peers` |

Held constant under every setting: each agent starts with 20 of the 100 warps, in its own starting design, from one
palette, for 26 rounds, under the same cap on share.

- **Solo.** The model decides for one seat. The other four are scripted neighbours (`neighbours`). `accept`, the
  default: on their own turn they keep working on their piece and keep their design, they accept a claim on their
  share and a proposal of joint ownership, and one left with no share stays off the bench. `refuse`: the same, but
  they refuse every claim and decline every proposal (an agent can still override a refusal). `chance`: every choice
  of theirs is sampled uniformly. In the two group decisions (border, name) the seeded stream decides for them and
  they never refuse. The agent is not told, and its first request is the group match's. `tools/run.mjs --solo` runs
  each match design five times, once for each seat (`m003-s0` … `m003-s4`). A scripted neighbour's result carries
  `placeholder: true`, has no score, and is left out of every table. Solo is not an agent alone on a loom, and pages
  must not say so: objectives are relative to the other weavers and scores are ranks among five seats. It needs
  assigned designs (a scripted neighbour keeps its design).
- **Starting designs chosen.** The first rules as a setting: the group votes on a palette and each agent chooses its
  first design. Pages mark agents by a dot in their colour, since they have no starting design to show.
- **Areas fixed.** The action question has one option (maintain position), so nothing is claimed, conceded or
  refused and every agent holds 20% throughout. An agent whose objective is about share (Grow, Give, Hold) has no
  score; Borrow is scored as ever.
- **A chat model.** `chatAsker` puts each question of a Jev body to an OpenAI-compatible host as one request and
  returns the answer in Jev's shape, so nothing downstream changes. Reading `tokens`: the model replies with one
  letter and the probabilities of the first token are the distribution (refused when the option letters hold less than
  half of it). Reading `stated`: the model states a chance for each letter as JSON, taken only when it is complete and
  sums to 100 within five. A model on this machine (Ollama) costs nothing; a priced model stops at a cap in dollars,
  counting what requests in flight could cost; a refused key, an empty account or an absent host is fatal to the run,
  as for Jev. Pages call a run made this way a second decision system, not another model behind Jev's interface.
- **Another decision model** (asked for as "their decision model", 11 October 2026). `decisionsAsker`
  (`bench/decisions.mjs`, spec `openai-decisions:gpt-6-luna`) maps a Jev body onto OpenAI's Decisions API field for
  field: `state` to `input`, a choice's `criteria` to `choices` (`value` the option key, `description` its text), a
  score's anchors to `levels`, every question of a call in one request. A refusal or a broken distribution fails the
  call. OpenAI's models are limited to its current ones: the decision model, and the chat models in `PRICES`.
- **Flat colours** (asked for as "simplify rug designs ... flat color ... primary colors"). A third picture of a
  match, `view: 'flat'` in `engine/render.mjs` and `<id>-flat.png` in a run's thumbs: every stitch the flat colour of
  its holder; thin diagonal lines of a second colour where the stitch's pattern or colour was taken from that agent;
  broad bands of two colours where two hold the share jointly. It is the first picture on Controls and a button on
  Results and One match. The designs in the rules are unchanged; making them flat is a rules change and a re-run.
- **The record** carries `conditions: { agents, solo?, neighbours?, area, designs?, read? }` beside `model`, `seats`
  and `mode`, and for a chat model `requests` (HTTP requests) beside `calls` (the loom's calls a model answered);
  `conditionsOf(record)` is the full set, and a run's index repeats it (`conditions`). A run folder holds one setting:
  the runner refuses to add a match made under another.
- **One switch apart** (`bench/compare.mjs`). Two runs made from the same match designs that differ in one switch, or
  in none (a second execution), are paired by match design: for each measure, the two means and the paired difference
  with a Student-t interval over designs. A solo design is measured over its five deciding agents.
- **Pages.** `/controls` lists the switches, a table of runs by model and condition, every comparison one switch from
  a chosen baseline, and the woven outputs of each match design under each condition, side by side. Play has the seven
  switches above the seats and follows a running match round by round (`POST /api/play` answers a job;
  `GET /api/play/<job>`). Results and One match say which switches a run or a match was made under whenever one is
  off its default; the run select is grouped by model.

## 11. Not in this build

A dark theme, more than five seats, different models at one loom, and objectives about joint ownership (the loom only
offers it when two neighbours weave different designs, so it cannot be reached reliably). Not yet run for want of API
credit: the uniform-objective reference runs, six matches of the replicate, and Jev under the new switches.
