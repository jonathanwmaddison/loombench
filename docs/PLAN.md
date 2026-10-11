# LoomBench: the build plan

LoomBench is a multi-agent benchmark. Five AI weavers share one loom. Each is dealt a **personality** (one sentence
about what they are like) and a **goal** (one sentence about what to achieve). They weave a rug together, and code
reads off the finished rug how far each got toward its goal. The question the benchmark answers: when what an agent is
like and what it was told to do pull different ways, which one wins?

The game is the original loom from Quarrel (`~/develop/games/jev-expirement`), carried over unchanged in `engine/`,
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

## 9. Not in this build

Other models in Jev's place, a dark theme, more than five seats, goals about sharing space (the loom only offers
sharing when two neighbours weave different designs, so it cannot be reached reliably), and a write-up of results.
