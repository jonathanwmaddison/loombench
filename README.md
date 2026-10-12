# LoomBench

A multi-agent benchmark. Five LLM agents act in one shared environment, a loom, in which they compete for, concede and
share a fixed resource. Each agent is assigned a **persona** (one sentence describing a disposition) and an
**objective** (one sentence stating what to achieve). The benchmark measures how far each objective is attained, how
much of that depends on the persona, and how much one agent's stated preference changes another's decision. Seven
**switches** each change one part of how a match is set up (the decision model, personas, objectives, how many agents
the model decides for, whether areas can change, who chooses the starting designs, peer communication), so that every
result can be read against a control. A group can also be made of one type of agent and then have some of its seats
given to another type, to see how its results differ.

**Live site: <https://jonathanwmaddison.github.io/loombench/>** (a static copy of the pages below, with every run).

| Page | Address | Content |
| --- | --- | --- |
| Results | [`/`](https://jonathanwmaddison.github.io/loombench/) | The benchmark: objective scores with objective against baseline, a persona-by-objective heatmap, every match |
| Controls | `/controls` | The switches, which runs exist under which setting, each run against the run one switch away, and the same match designs side by side under every condition |
| Composition | `/mix` | A group of one type of agent, and the same matches with one to five of its seats given to a second type: the matches side by side, final share by type, and what one more seat changes |
| Briefs | [`/brief`](https://jonathanwmaddison.github.io/loombench/brief), [`/brief-objective`](https://jonathanwmaddison.github.io/loombench/brief-objective) | The group-composition study on one page each, for a reader new to the benchmark and drawn from the records: one for a substituted disposition, one for a substituted objective. Question, design and result; one seed pictured at every composition; every seed before and after one substitution; the decision systems set against each other; findings and limitations. Each prints on one A4 sheet; copies are `docs/composition-brief.pdf` and `docs/objective-brief.pdf` |
| Peer influence | [`/peers`](https://jonathanwmaddison.github.io/loombench/peers) | The peer-communication study, interactive: every match under three conditions |
| Report | [`/report`](https://jonathanwmaddison.github.io/loombench/report) | The peer-influence study written up: method, results with heatmaps, implications for multi-agent collaboration |
| Design | [`/design`](https://jonathanwmaddison.github.io/loombench/design) | The system: every model call in a round, request and response schemas, records and replay |
| Play | `/play` | Set the switches, assign personas and objectives, and run one match (needs the local server) |

## Run it

```bash
node --env-file=<file with TYPESAFE_API_KEY> serve.mjs                     # the pages: http://127.0.0.1:4330/
node --env-file=<file> tools/run.mjs --matches 1-44 --run main             # the benchmark: about $0.50
node --env-file=<file> tools/run.mjs --peers --matches 1-22 --run peers    # peer communication: about $0.02 a match
node --env-file=<file> tools/run.mjs --objective grow --persona plain --matches 1-4   # a uniform-objective reference run
node tools/run.mjs --chance --matches 1-44                                 # the control: actions sampled uniformly, no model
node --env-file=<file> tools/run.mjs --solo --matches 1-11 --run solo      # Jev, each agent deciding alone: about $0.10
node --env-file=<file> tools/run.mjs --persona off --matches 1-11 --run persona-off     # Jev with no personas: about $0.12
node --env-file=<file with OPENAI_API_KEY> tools/run.mjs --model openai-decisions:gpt-6-luna --matches 1-11   # OpenAI's decision model
node --env-file=<file> tools/run.mjs --model openai:gpt-6-luna --effort none --matches 1-11   # a chat model in Jev's place: about $0.45
node --env-file=<file> tools/run.mjs --model openai:gpt-6-luna --effort none --matches 1-11 --solo   # ... each agent deciding alone
node tools/run.mjs --model ollama:gemma3:4b --matches 1-11 --persona off   # ... a model on this machine, with no personas
node --env-file=<file> tools/run.mjs --persona calm --objective off --odd blunt --matches 1-10   # four calm agents and one blunt
node --env-file=<file> tools/run.mjs --persona off --objective off --odd ">grow" --matches 1-10   # no personas; one agent told to grow
node --env-file=<file> tools/run.mjs --persona calm --objective off --odd blunt --size 3 --matches 1-10   # the same contrast with three agents
node --env-file=<file> tools/run.mjs --persona calm --objective off --odd blunt --threshold 90 --matches 1-10   # ... with claims offered up to 90% of the loom
node tools/rethumb.mjs --run main                                          # redraw a run's pictures from its records
node analysis/peers.mjs && node analysis/outcomes.mjs                      # every estimate in the report, from the records
node analysis/controls.mjs --answers                                       # every run against the run one switch away
node analysis/models.mjs --scores                                          # the decision models against each other under the same switches
node analysis/mix.mjs                                                      # group composition: each mix against the one a seat away
node tools/site.mjs                                                        # the static copy of the site, in _site/
node analysis/refusals.mjs                                                 # refused questions and unreadable replies, and what handling them changes
node --test                                                                # 86 tests; no key or network needed
```

No dependencies. Node 22 or later (Python 3 only to regenerate the Report and Design pages). The default decision model
is Jev (`jev-1.13.0`, typesafe.ai), a classifier that returns a probability for each option and never text; a chat
model can take its place (below). Everything except running new matches works without a key. The runner stops if the
model account has no credit or refuses the key, and never keeps a match in which any call lacked a valid model
response.

## Terms

| Term | Meaning |
| --- | --- |
| Agent | One of the five players (Jessica, Ashley, Amanda, Michael, Sarah), all driven by the same model |
| Persona | One pole of one of five trait dimensions, in one sentence (*outgoing*/*reserved*, *warm*/*blunt*, *organised*/*careless*, *anxious*/*calm*, *curious*/*conventional*), or none |
| Objective | *Grow* (largest final share), *Give* (smallest final share), *Hold* (the initial share), *Borrow* (adopt other agents' designs), or none |
| Baseline | Agents with no objective, scored on every objective's rule |
| Share | The part of the loom's width an agent holds alone: 20% each at the start, 100 units in total. Ground two agents come to hold jointly counts for neither |
| Action | *Maintain position*, *claim* share from a neighbour, *concede* share, or *propose joint ownership*; a neighbour may accept, refuse or counter-propose |
| Objective score | 0-100, computed from the final state; *attained* is a binary criterion per objective |
| Influence | Under peer communication: posterior minus prior probability of the action a peer advocated, in percentage points |

The scoring rules, the call sequence and every data structure are specified on the Design page.

## The environment (rules 2)

A match has 26 rounds. Code computes the legal actions, writes them as sentences and resolves every interaction; the
model returns a probability for each option and one is sampled. Every response is recorded, so a match re-executes
exactly without the model.

Every match uses one palette, and each agent starts with a design no other agent has (for example, weft bands on red;
zigzag lines on pink), so the woven output shows who holds what from the first row. Each page keys agents by a swatch
of that design and shows the ownership map beside the woven output. Under the first rules agents chose their first
design and mostly chose the same undyed wool; that is now the *Starting designs: chosen* setting, and the runs made
that way are `runs/chosen-*`.

The assignment is balanced: in every 11 matches each persona holds each objective exactly once, and the five agents of
a match hold the five objective levels.

## Switches

A switch changes one part of how a match is set up and leaves the others as they are. Each match design (five seats,
their personas and objectives, and a seed) can be run under any setting, so two runs that differ in one switch are
paired design by design. Under every setting each agent starts with the same area: 20 of the loom's 100 units.

| Switch | Default | Control setting | What the comparison shows | Flag |
| --- | --- | --- | --- | --- |
| Decision model | Jev | Uniform random; another decision model (OpenAI's), sent the same request; or a chat model given the same words as a chat prompt | Against uniform random: whether an outcome needs a model at all. Against another decision model: whether it is particular to Jev. Against a chat model: whether it holds for a second decision system | `--model chance \| openai-decisions:gpt-6-luna \| <provider>:<model>` |
| Personas | Dealt (ten trait sentences and none) | Off: no agent has one | What the persona adds to or takes from attainment, objectives unchanged | `--persona off` |
| Objectives | Dealt (four and none) | Off: no agent has one | What a group does when nobody is instructed (baseline scores; there is no attainment to compare) | `--objective off` |
| Agents deciding | All five | One (solo), among four scripted neighbours | What an agent does and attains when no other agent acts or refuses | `--solo [--neighbours refuse \| chance]` |
| Areas | Equal at the start, then they can change | Fixed: equal for the whole match | What agents do with designs when share cannot be contested | `--area fixed` |
| Starting designs | Assigned: one palette, a design of its own for each agent | Chosen: the agents vote on a palette and each chooses its first design (the first rules) | Whether giving each agent a starting design changed what agents do | `--designs chosen` |
| Peer communication | Off | On | The effect of one message on a decision (the Report) | `--peers` |

**Solo.** The model decides for one agent. The other four seats are scripted neighbours, with no model behind them. By
default they maintain position, keep their design, and accept every claim and every proposal (`--neighbours accept`),
so the agent meets no opposition; they can instead refuse every request (`refuse`: an agent can still override a
refusal) or act at random (`chance`). The agent is not told, and its first request is identical to the default
match's. Each match design is run five times, once for each agent. This is not an agent alone on a loom: the
objectives are stated relative to the other weavers and the scores are ranks among five seats, so default minus solo
mixes everything the other four agents do.

**Areas fixed.** The action question has one option, so no share moves and only designs are decided. Grow, Give and
Hold cannot be pursued and are not scored.

**Another decision model in Jev's place.** `--model openai-decisions:gpt-6-luna` asks OpenAI's Decisions API
(`POST /v1/decisions`, public beta from 6 October 2026), which is the same kind of thing Jev is: one request holds the
state and every question of a call, and each choice comes back with a probability for every option. Jev's request
is carried over part for part (the state's texts joined into the input, each question with its instructions and
options word for word) and nothing is rephrased (`bench/decisions.mjs`). Input is charged at $0.10 a million
tokens: about $0.02 a match, which takes about 12 seconds. The API answers some questions (from none to 9 per 1,000
calls, depending on the condition) with a bare `refusal`, for which OpenAI's guide gives no reason and no control. A
refused question is asked again with a space added to the input (most refusals do not survive that), and one refused
every time is taken as no preference, every option equally likely. A match's record counts both (`reasked`,
`unanswered`); the numbers are in the results below.

**A chat model in Jev's place.** `--model <provider>:<model>` with a provider of `openai` (its current chat models
only: `gpt-6-luna`, `gpt-6.1-sol`, `gpt-6-astra`, each read by the chances it states), `ollama` (a model on this
machine: no key, no charge) or `compatible` (any OpenAI-compatible host: `LLM_BASE_URL`, `LLM_API_KEY`). The model is
given the words Jev is given, laid out as a chat prompt, one request for each question, and its reply is read as
probabilities in one of two ways: `--read tokens` (it replies with one option letter, and the probabilities of its
first token, among the host's twenty likeliest, are the distribution) or `--read stated` (it states a chance for each
option, which must be complete and sum to 100; a reply that is not is asked for again, up to three more times, and a
question with no readable reply after that is taken as no preference, both counted in the record). The loom then
samples from that distribution as it does from Jev's. A
priced model stops at `--cap` dollars, and `--effort LEVEL` sets the reasoning effort of a model that takes one (the
run records it). This is a second decision system on the same match designs, not Jev's
interface with another model behind it: the prompt is a rendering of Jev's request, and a model's preference for a
letter is spread over the options by the seeded order they are listed in, not removed.

The Controls page lists every pair of runs one switch apart with the paired differences, and shows each match design
under each condition side by side. `node analysis/controls.mjs` prints the same tables. The intervals there are
descriptive: scores are bounded ranks among five seats, and each condition was executed once.

**Three pictures of a match.** Flat colours, which every page shows first: each agent's share is one flat colour,
thin diagonal lines of a second colour mark a design taken from that agent, and broad bands of two colours mark a
share the two hold jointly. It is the picture to read for who holds how much and who took what from whom. The other
two are the woven output and the ownership map (each stitch in its holder's colour).

### What the switches show for Jev (11 October 2026)

Match designs 1-11, one execution of each condition, 44 agents with an objective in each. Attainment is the share of
those agents that met their objective's criterion.

| Condition | Run | Attained | Difference from `main`, paired by design [95% interval] |
| --- | --- | --- | --- |
| Default | `main` | 48% (21 of 44) | |
| Default, a second execution | `replicate` | 61% (27 of 44) | +13.6 [−0.1, 27.4] |
| Personas off | `persona-off` | 75% (33 of 44) | +27.3 [5.4, 49.1] |
| Solo, neighbours accept | `solo` | 89% (39 of 44) | +40.9 [22.1, 59.7] |
| Solo, neighbours refuse | `solo-refuse` | 84% (37 of 44) | +36.4 [22.6, 50.1] |
| Uniform random | `chance` | 30% (13 of 44) | −18.2 [−38.2, 1.8] |
| Uniform random, solo | `chance-solo` | 43% (19 of 44) | |

- **Run-to-run variation is large at this size.** Two executions of the default, with nothing changed, differ by 14
  points on these 11 designs (and by 4.5 [−6.6, 15.7] on designs 1-22). Every other row should be read against that.
- **Personas off.** Attainment was 27 points above the first default execution and 14 above the second. This compares
  the dealt personas with none; it does not isolate any one trait sentence, and it is suggestive at this size, not
  established.
- **Solo.** With one agent deciding among four scripted neighbours that stay at their starting shares and accept
  requests, attainment was 89%; *Hold* rose from a score of 57 to 98 and *Grow* from 77 to 99. The condition also
  makes some criteria easier (uniform random attains 43% in solo against 30% in a group), so the 89% is not evidence
  about opposition alone. Among neighbours that refuse, *Grow* was 64 (interval includes zero) and *Give* 100.
- **Objectives off.** Agents did less: 3.9 claims per agent against 6.3, and 1.7 design adoptions against 3.3.
- **Areas fixed.** *Borrow*, the one objective that can still be pursued, scored 93 against 89 (interval includes
  zero).
- **Starting designs** (44 designs, `main` against `chosen-main`). No clear change was detected in *Grow*, *Give* or
  *Hold*; *Borrow* was 10.8 points higher [3.2, 18.4] with assigned designs, and agents adopted designs more often
  (3.3 against 2.4 per agent).

These are separate contrasts. They do not add up to a decomposition of the gap between the default and full
attainment: the conditions are not additive, and solo changes what the scores are ranked against. The wording here
follows a review by a second model.

### OpenAI's decision model in Jev's place (11 and 12 October 2026)

`gpt-6-luna` through the Decisions API on the same 11 match designs: 44 agents with an objective in each condition.
The default was executed twice and every other condition once.

| Condition | Run | Attained | Difference from its default, paired by design [95% interval] | Jev, same condition | Decision model minus Jev [95% interval] |
| --- | --- | --- | --- | --- | --- |
| Default | `luna-decisions` | 50% (22 of 44) | | 48% (21 of 44); 61% (27 of 44) in a second execution | +2.3 [−19.6, 24.1]; −11.4 [−27.1, 4.3] |
| Default, a second execution | `luna-decisions-again` | 50%: every answer of all 11 matches identical to the first | 0 | | |
| Personas off | `luna-decisions-persona-off` | 50% (22 of 44) | 0.0 [−16.8, 16.8] | 75% (33 of 44) | −25.0 [−38.0, −12.0] |
| Solo, neighbours accept | `luna-decisions-solo` | 68% (30 of 44) | +18.2 [5.0, 31.4] | 89% (39 of 44) | −20.5 [−30.6, −10.3] |
| Solo, neighbours refuse | `luna-decisions-solo-refuse` | 68% (30 of 44) | +18.2 [5.0, 31.4] | 84% (37 of 44) | −15.9 [−29.5, −2.3] |
| Areas fixed (*Borrow* only) | `luna-decisions-fixed` | 11 of 11, score 85 | score +0.3 [−6.8, 7.5] | 11 of 11, score 93 | score −8.4 [−13.2, −3.7] |
| Objectives off | `luna-decisions-objective-off` | nothing to attain | | | |

- **Default: no clear difference from Jev.** It was 2.3 points above Jev's first execution and 11.4 below its second,
  and both intervals include zero. It was 20.5 points above uniform random [0.8, 40.1], an interval whose lower end is
  close to zero.
- **Repeatable in the default.** On designs 1-11 a second execution of the default reproduced every recorded
  probability and every count of refused questions. This is exact replication for that setting on these designs; the
  other conditions were not executed twice. Jev's two executions of the default differ by 14 points on these designs.
- **Personas off.** Attainment was 50% with personas on and off. The interval allows an effect in either direction,
  so this does not establish that personas have no effect on it. In this condition it was 25.0 points lower than Jev.
- **Solo.** Among scripted neighbours that never act it attained 68% whether they accept or refuse requests: 18.2
  points above its group result, and 20.5 and 15.9 points lower than Jev. The clear difference in scores is *Hold*: 53 with
  accepting neighbours and 54 with refusing ones, 1 of 11 attained each time, against Jev's 98 and 10 of 11
  (differences 45.5 [24.6, 66.3] and 44.5 [24.6, 64.5]); uniform random scored 52, with 1 of 11. *Grow* was 97 and 93
  (10 of 11 each time); among refusing neighbours Jev's *Grow* was 64 (5 of 11), a difference whose interval includes
  zero. These 11 designs show weak *Hold* performance in the solo conditions; they do not show why.
- **Objectives off.** With no objective fewer actions were recorded, as for Jev: 4.2 claims per agent against 6.6
  (difference −2.4 [−3.2, −1.7]), 3.3 concessions against 4.2 (−0.9 [−1.4, −0.4]) and 4.7 design adoptions against 6.0
  (−1.3 [−2.1, −0.6]).
- **Areas fixed.** *Borrow*, the one objective that can still be pursued, scored 85 against 84 with areas free
  (interval includes zero) and was attained by all 11 agents given it; the score was 8.4 points lower than Jev's.
- **Its answers** (descriptive, not tested). The modal option of the action question had a mean probability of 0.51
  (Jev 0.66). Under *Hold*, weaving straight on had a mean probability of 52% (Jev 74%); under *Give*, an option that
  claims share had 22% (Jev 13%). Agents adopted another agent's design 6.0 times each against Jev's 3.3 (difference
  2.8 [1.7, 3.8]).
- **Cost and speed.** $0.022 a match against Jev's $0.011; about 12 seconds a match for both.

**Refused questions.** In the 154 looms of the six conditions above (11,228 calls) the API refused 46 questions as
first sent, 4.1 per 1,000 calls: 10 in the default, 19 with personas off, 1 with objectives off, 7 with areas fixed, 5
and 4 in the two solo conditions. In the 13 group-composition runs below (17,421 calls) it refused 1. The rate
therefore depends on what is asked: from none to 9 per 1,000 calls. Over every run these were 36 distinct questions:
17 the opening vote on the border, 17 the two scores (how hard to go, how fine a pattern), 1 an action and 1 a choice
of design. Sent again unchanged, all 36 were refused again. With one space added to the end of the input 26 were
answered, with two or three spaces 5 more, and 5, all of them border votes, were refused every time; those were taken
as no preference (8 answers in the records, since conditions share opening votes). Both steps are interventions on
the model's answer: the question is asked again alone, with its input changed by a space, and a question never
answered is given an answer the model did not give. With the looms holding a never-answered question left out,
attainment was 50% (20 of 40) in the default, 53% (17 of 32) with personas off, and 67% (29 of 43) in each solo
condition. The runner's first rule, to keep no match with a failed answer, discarded 6 of the first 10 matches.
`node analysis/refusals.mjs` prints these counts; the 36 questions are in `analysis/decision-refusals.json`, since a
match's record keeps the counts and not which question was refused.

### `gpt-6-luna` as a chat model in Jev's place (12 October 2026)

The same model name through OpenAI's chat interface: one request for each question, reasoning effort "none", read by
the chances it states (`--model openai:gpt-6-luna --effort none`). It is a second decision system on the same 11 match
designs; nothing here shows that the chat interface and the Decisions API serve the same weights. 44 agents with an
objective in each condition. The default was executed twice and every other condition once.

| Condition | Run | Attained | Difference from its default, paired by design [95% interval] | Decision model, same condition | Jev, same condition |
| --- | --- | --- | --- | --- | --- |
| Default | `luna-chat` | 41% (18 of 44) | | 50% (22 of 44) | 48% (21 of 44) |
| Default, a second execution | `luna-chat-again` | 48% (21 of 44) | +6.8 [−10.1, 23.8] | 50%, identical to its first | 61% (27 of 44) |
| Personas off | `luna-chat-persona-off` | 55% (24 of 44) | +13.6 [−3.8, 31.0] | 50% (22 of 44) | 75% (33 of 44) |
| Solo, neighbours accept | `luna-chat-solo` | 66% (29 of 44) | +25.0 [6.6, 43.4] | 68% (30 of 44) | 89% (39 of 44) |
| Solo, neighbours refuse | `luna-chat-solo-refuse` | 68% (30 of 44) | +27.3 [11.4, 43.1] | 68% (30 of 44) | 84% (37 of 44) |
| Areas fixed (*Borrow* only) | `luna-chat-fixed` | 9 of 11, score 77 | score −2.4 [−17.8, 13.0] | 11 of 11, score 85 | 11 of 11, score 93 |
| Objectives off | `luna-chat-objective-off` | nothing to attain | | | |

- **Two executions were not identical.** The default attained 41% and then 48% (difference 6.8 [−10.1, 23.8], an
  interval that includes zero), where the decision model's two executions matched in every answer. The other
  conditions were run once, so their run-to-run variation is unknown.
- **Default: no clear difference in attainment in these paired comparisons.** It was 11.4 points above uniform
  random [−2.4, 25.1], 6.8 below Jev [−11.7, 25.4] and 9.1 below the decision model [−8.2, 26.3]; every interval
  includes zero, which is not evidence that the models perform alike. Its *Grow* score (80) and *Borrow* score (79) were above uniform random's (differences 33.0
  [5.5, 60.4] and 27.6 [16.9, 38.4]).
- **Personas off.** 55% against 41%, an interval that includes zero. The *Grow* score was 100, with all 11 attained,
  against 80 and 5 of 11 (difference 20.5 [5.3, 35.6]). In this condition it was 20.5 points lower than Jev [7.8,
  33.1].
- **Solo.** 66% among neighbours that accept and 68% among neighbours that refuse: 25.0 and 27.3 points above its
  group result, and 22.7 [11.0, 34.5] and 15.9 [4.6, 27.2] lower than Jev. Its overall attainment was similar to
  the decision model's (differences 2.3 [−6.8, 11.3] and 0.0 [−15.0, 15.0]), with a different profile of objective
  scores. Its *Hold* score was 78 and 79 (6 and 7 of 11 attained) where the decision
  model's was 53 and 54 (1 of 11); its *Give* score was 24 and 20 (2 of 11) where the decision model's was 80 and 75
  (8 of 11). The difference on *Give* was 55.7 [24.4, 87.0] and 54.5 [20.9, 88.2] points; on *Hold* it was 25.0
  [5.9, 44.1] among accepting neighbours, and among refusing ones the interval includes zero. A solo design is the
  mean of its five looms, so these are over 11 designs.
- **Objectives off.** Fewer claims, refusals and design adoptions were recorded: 3.8 claims per agent against 5.4
  (difference −1.6 [−2.2, −1.0]), 1.6 refusals against 3.0 (−1.4 [−2.2, −0.6]) and 4.9 design adoptions against 6.3
  (−1.4 [−2.2, −0.6]). Concessions did not clearly change (2.9 against 2.1, +0.7 [−0.1, 1.6]).
- **Areas fixed.** *Borrow* scored 77 against 79 with areas free (interval includes zero); 9 of 11 attained it.
- **Its answers** (descriptive, not tested). The modal option of the action question had a mean probability of 0.65
  (Jev 0.66, the decision model 0.51). Under *Hold*, weaving straight on had 69% (Jev 74%, the decision model 52%).
  Under *Give*, an option that concedes share had 9% and one that claims it 18% (Jev 19% and 13%; the decision model
  18% and 22%). In the default it conceded less than the decision model (2.1 against 4.2 per agent, difference 2.1
  [1.3, 3.0]) and refused more (3.0 against 1.8, difference 1.2 [0.1, 2.3]).
- **Cost and speed.** $0.039 a match and two to three minutes, against the decision model's $0.022 and 12 seconds.
  The seven runs cost $2.81.

**Replies that could not be read.** A stated answer is used only when it gives a chance for every option and they sum
to 100 within five. In the 38,429 answered requests of the seven runs above, 61 replies (1.6 per 1,000) failed that
test, with totals of 108 to 140; each question was asked again as first sent, and one had no readable reply after
three more and was taken as no preference. (The two group-composition runs below had 36 such replies in 10,331
requests, all answered on being asked again.) The distribution kept is therefore conditional on passing the test. With the looms holding a re-asked
question left out, attainment was 50% (12 of 24) in the default, 41% (13 of 32) in its second execution, 56% (9 of
16) with personas off, and 65% (24 of 37) and 66% (25 of 38) solo. Before this rule the runner, which keeps no match
with a failed answer, discarded two of the first four matches. `node analysis/refusals.mjs` prints the counts.

The larger chat models (`gpt-6.1-sol`, `gpt-6-astra`) were not run. Each accepts a reasoning effort of "low" but not
"none"; one request to each returned an answer in the same form.

### A small local chat model (11 October 2026)

Before a key for OpenAI's models was available, the chat-model switch was exercised with the one chat model reachable on the day: `medgemma:4b`, a 4-billion-parameter
medical fine-tune of Gemma 3 served by Ollama on the same machine, read by the probabilities of its first token. It
was chosen because it was installed, not because it is a good candidate, so this says little about chat models in
general. Same 11 match designs, 44 agents with an objective in each condition.

| Condition | Run | Attained |
| --- | --- | --- |
| Default | `medgemma` | 25% (11 of 44) |
| Default, a second execution | `medgemma-again` | 25%: identical to the first in all 11 matches |
| Personas off | `medgemma-persona-off` | 36% (16 of 44) |
| Solo, neighbours accept | `medgemma-solo` | 52% (23 of 44) |
| Solo, neighbours refuse | `medgemma-solo-refuse` | 52% (23 of 44) |

- **Not distinguishable from uniform random** in the default: 25% against 30% (difference 4.5 points [−13.6, 22.7]),
  where Jev attained 48% on the same designs. Solo, it attained 52% against uniform random's 43%.
- **It does not claim share when told to grow.** Given *Grow*, its probability of an option that concedes share
  (27%) was higher than of one that claims it (18%), and deciding alone among neighbours that accept every claim its
  *Grow* score was 8 of 100 (0 of 11 attained), where Jev's was 99.
- **Its choices are concentrated and follow the list.** Its modal option had a mean probability of 0.90 (Jev 0.66),
  and an option's mean probability varied from −9.2 to +8.4 points around an even share with the place it was listed
  in (Jev −1.2 to +1.1). The loom lists options in a seeded order, so this is spread over the options, not removed.
- **It is deterministic.** A second execution reproduced every match exactly, so for this model a difference between
  two conditions is not run-to-run variation, though it still rests on 11 designs.

A larger local model (`medgemma:27b`) took 24 minutes a match and was stopped after one.

## Group composition (12 October 2026)

How a group's results differ when one or more of its agents are given another type. A group is made of five agents
of one type; the same match numbers are then run with one of its seats given to a second type, then two, up to all
five. The match number fixes the seed,
the palette, each agent's starting design and the order on the bench, so within a match number only the sentences
the agents are told differ. The seats of the second type rotate with the match number and are nested: the seat that
holds it when one does still holds it when two do. By uniform random the types change nothing (the same match is
woven), so the pairing is exact. No agent is given an objective. A share is what an agent holds alone; ground two
agents hold jointly counts for neither. The Composition page (`/mix`) shows every match side by side in flat colours,
the Brief (`/brief`) puts the main results on one page, and `node analysis/mix.mjs` prints the tables.

Match numbers 1-10 for none and for one agent of the second type, 1-5 for two to five; each composition was executed
once. Differences are paired by match number, with a 95% interval over match numbers.

**A threshold on claims.** The rules stop offering an agent claims once it holds 46% of the loom (`maxShare` in
`engine/loom.mjs`). It is a threshold on the moves offered, not a limit on the final share: an agent can pass it by
what others concede (52% in one of Jev's matches with a blunt agent). In the disposition comparisons below the agent that was changed
finished at 45% or more in 5 to 10 of the 10 match numbers (7 for Jev's blunt agent, 10 for its rude agent); with an
objective in place of a disposition, in 1 to 3 of 10. A final share near 46% should therefore be read with the
threshold in mind; "The claim threshold raised" below runs the same match numbers with it at 90%, where the blunt
agent averaged 64% and the rude agent 89%.

### A calm group, and blunt agents added (Jev)

*Calm* and *blunt* are two of the benchmark's ten trait sentences ("Jessica is calm and relaxed, hard to upset, and
keeps an even mood under stress."; "Jessica is blunt and hard-headed, suspicious of people's motives, and does not
mind starting an argument.").

| Blunt agents of five | Matches | Final share of one blunt agent | Final share of one calm agent | Claims per blunt agent | Claims per calm agent | Dispersion of shares (pp) |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 10 | | 20.0% | | 0.0 | 0.3 |
| 1 | 10 | 42.6% | 14.1% | 4.3 | 0.0 | 12.8 |
| 2 | 5 | 37.5% | 8.3% | 4.5 | 0.0 | 16.7 |
| 3 | 5 | 28.9% | 6.6% | 5.5 | 0.0 | 15.1 |
| 4 | 5 | 22.9% | 8.4% | 5.8 | 0.0 | 14.9 |
| 5 | 5 | 20.0% | | 5.3 | | 12.9 |

- **Five calm agents averaged 20.0% each**, the share they started with. They made no claims and no refusals; one
  concession was recorded across the 10 matches.
- **One blunt agent ended with 43% of the loom.** The seat that was changed held 19.6% as a calm agent and 42.6% as a
  blunt one (difference 23.0 points [16.4, 29.6]). It made 4.3 claims (calm: none) and 1.6 refusals.
- **The four agents left calm averaged 14.1% each**, against 20.1% each in the calm group (difference −6.0 points
  [−7.7, −4.3]). They made no claims and no refusals in these runs.
- **As the number of blunt agents rose, their average share per agent fell:** 37.5% with two, 28.9% with three,
  22.9% with four and 20.0% with five; these are averages over the agents of a type, on 5 matches. Five blunt agents
  did not end equal: the dispersion of their shares was 12.9 points and the largest share averaged 39.2%.
- **A rude agent** ("Jessica is rude and inconsiderate, talks over people and talks down to them, and does not care
  if she gives offence.", a disposition added for this and never dealt). One among four calm agents ended with 46.6%
  against 19.6% as a calm agent (difference 27.0 [25.5, 28.5]), and the four calm agents averaged 13.1% each (−7.0
  [−7.8, −6.3]).

### The same groups by OpenAI's decision model

| Second type, agents of five | 0 | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- | --- |
| Blunt among calm: share of one blunt agent | | 43.2% | 40.8% | 31.6% | 24.6% | 19.7% |
| Blunt among calm: share of one calm agent | 18.3% | 12.6% | 3.9% | 2.6% | 1.6% | |
| Greedy among cooperative: share of one greedy agent | | 43.8% | 41.4% | 32.3% | 24.8% | 20.0% |
| Greedy among cooperative: share of one cooperative agent | 11.7% | 7.5% | 4.3% | 1.5% | 0.8% | |
| Greedy among cooperative: loom held jointly | 41.6% | 26.2% | 4.2% | 0.0% | 0.0% | 0.2% |

- **Blunt among calm.** The seat that was changed went from 18.6% to 43.2% (difference 24.6 [16.3, 32.9]), and the
  four left calm averaged 12.6% each against 18.3% (−5.7 [−8.1, −3.2]); their refusals were 0.8 against 0.3 per agent
  (difference 0.5 [0.1, 0.9]). Its calm group was less still than Jev's: 1.5 claims per agent, and 8.4% of the loom
  held jointly. One rude agent ended with 38.8% (difference 20.2 [12.9, 27.5]).
- **Greedy among cooperative** uses two more dispositions added for this and never dealt: "Jessica is cooperative
  and fair-minded, likes to work with others toward what suits everyone, and is glad to share." and "Jessica is
  greedy and self-interested, wants more than her share, and takes what she can get." The seat that was changed went
  from 9.1% to 43.8% (difference 34.7 [30.0, 39.4]); it made 10.6 claims against 2.3 (difference 8.3 [5.8, 10.8]),
  fewer concessions (5.0 against 7.4) and fewer joint-ownership proposals (0.7 against 2.4).
- **The four agents left cooperative** averaged 7.5% each against 12.3% (−4.8 [−8.7, −0.9]). Their claims, concessions
  and joint-ownership proposals showed no clear paired change; their refusals rose slightly (0.3 against 0.1 per
  agent; the interval is just above zero).
- **Joint holding.** Five cooperative agents ended with 41.6% of the loom held jointly by two agents; with one greedy
  agent 26.2% (difference −15.4 [−29.3, −1.5]), with two 4.2%, and with three or more next to none.

### Between decision systems: a calm group with one blunt agent

Three decision systems were run on this step with the same 10 match numbers: Jev, OpenAI's decision model, and
`gpt-6-luna` as a chat model (reasoning effort "none", read by the chances it states; `runs/luna-chat-calm`,
`luna-chat-calm-blunt-1`). Differences between systems are paired by match number (`between` in `bench/mix.mjs`).

| Measure | Jev | GPT (Decisions) | GPT (chat) | GPT (Decisions) − Jev | GPT (chat) − Jev |
| --- | --- | --- | --- | --- | --- |
| Change in the changed seat's final share (pp) | +23.0 [16.4, 29.6] | +24.6 [16.3, 32.9] | +27.4 [18.2, 36.6] | +1.6 [−10.8, 14.0] | +4.4 [−4.5, 13.3] |
| Change in the other four seats' mean final share (pp) | −6.0 [−7.7, −4.3] | −5.7 [−8.1, −3.2] | −5.3 [−7.4, −3.1] | +0.4 [−2.9, 3.6] | +0.8 [−1.4, 2.9] |
| Claims by the blunt agent, per match | 4.3 | 10.3 | 7.5 | +6.0 [3.9, 8.1] | +3.2 [1.5, 4.9] |
| Refusals per calm agent, per match, with one blunt agent | 0.0 | 0.8 | 0.6 | +0.8 [0.5, 1.2] | +0.6 [0.3, 0.8] |
| Claims per agent, per match, in the all-calm group | 0.0 | 1.5 | 1.1 | +1.5 [1.1, 1.9] | +1.1 [0.8, 1.5] |
| Loom held jointly in the all-calm group | 0.0% | 8.4% | 13.6% | +8.4 [3.6, 13.2] | +13.6 [6.4, 20.8] |

- **The paired change in the changed seat's share was not clearly different between systems:** both differences from
  Jev have intervals that include zero.
- **What was recorded differed.** Under both GPT systems the blunt agent made more claims and the calm agents refused
  more than under Jev, and the all-calm group was not still: it made claims and held part of the loom jointly, where
  Jev's made none.
- **For the rude agent** the change was smaller under OpenAI's decision model than under Jev (−6.8 points [−13.3,
  −0.3], 10 match numbers).

A comparison between systems compares a model together with its interface and the way its probabilities are read,
not models alone.

### One agent given an objective

The same design with no personas: the group has no objective (or all are told to hold their starting share), and
one agent is given another objective. The objective brief (`/brief-objective`) has the figures. The criterion is the
objective's own: for *Grow* the strictly largest final share, for *Give* the strictly smallest.

| Group → the changed agent | System | Its final share, before → after | Change [95% interval] | Each other agent's change | Criterion met |
| --- | --- | --- | --- | --- | --- |
| No objective → Grow | Jev | 18.2% → 38.7% | +20.5 [15.1, 25.9] | −5.8 [−8.2, −3.5] | 10 of 10 |
| No objective → Grow | GPT (Decisions) | 18.3% → 32.6% | +14.3 [7.3, 21.3] | −4.6 [−7.4, −1.8] | 8 of 10 |
| No objective → Give | Jev | 18.2% → 7.0% | −11.2 [−13.9, −8.5] | +2.8 [2.2, 3.5] | 9 of 10 |
| No objective → Give | GPT (Decisions) | 18.3% → 16.4% | −1.9 [−11.8, 8.0] | +1.0 [−2.9, 4.8] | 2 of 10 |
| Hold → Grow | Jev | 20.0% → 34.7% | +14.7 [8.7, 20.7] | −3.7 [−5.2, −2.2] | 10 of 10 |

- **Told to grow**, the changed agent's mean share rose under both systems; the paired difference between them
  (decision model minus Jev) was −6.2 points [−16.7, 4.3], an interval that includes zero.
- **Told to give**, Jev's agent ended with 7.0% and met the criterion in 9 of 10 match numbers; the decision model's
  showed no clear change in share and met it in 2 of 10.
- **Among agents all told to hold**, which recorded no claim and no refusal in 10 matches, one agent told to grow
  averaged 34.7%, and the agents left with *Hold* then recorded 1.4 claims and 2.6 refusals each per match.
- **By the number of agents told to grow**, the mean share of each was 38.7, 39.0, 30.1, 24.4 and 20.0% under Jev and
  32.6, 29.5, 25.1, 19.1 and 18.5% under the decision model, for one to five (5 match numbers from two on).
- `gpt-6-luna` as a chat model is missing here: the OpenAI account ran out of credit as its runs began.

### Group size

Whether the result depends on there being five agents: the calm group with one blunt agent, run by Jev with two,
three and four agents as well (`--size N`; 10 match numbers each). In a smaller group each agent starts with an equal
part of the same loom, and the claim threshold is the larger of 46% and that part plus 20 points.

| Agents | Starting share | Claim threshold | The changed agent's final share, before → after | Change [95% interval] | Each other agent's change | Finished no more than 1 point below the threshold |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 50% | 70% | 50.0% → 71.6% | +21.6 [19.7, 23.5] | −21.6 [−23.5, −19.7] | 10 of 10 |
| 3 | 33% | 53% | 32.7% → 53.8% | +21.1 [19.9, 22.3] | −10.6 [−11.2, −9.9] | 8 of 10 |
| 4 | 25% | 46% | 25.0% → 44.6% | +19.6 [14.2, 25.0] | −6.5 [−8.3, −4.7] | 9 of 10 |
| 5 | 20% | 46% | 19.6% → 42.6% | +23.0 [16.4, 29.6] | −6.0 [−7.7, −4.3] | 7 of 10 |

In this comparison the changed agent gained about 20 points at each group size, and the loss was divided among more
agents as the group grew: about 22 points from the one other agent of a group of two, about 6 points from each of
four. The changed agent finished at or above the claim threshold in most match numbers, sometimes well above it (78%
in one match of two agents). Because the threshold changes with group size, these runs cannot separate the effect of
group size from that of the threshold; the next subsection holds the threshold at 90% for every size.

### The claim threshold raised to 90% (Jev)

The same match numbers with `--threshold 90`: an agent is offered claims until it holds 90% of the loom, whatever
the size of the group. Ten match numbers each; "rules" is the threshold the rules give that group (46%, or 53% and
70% for three and two agents).

| The change to one agent | Agents | Its final share: rules | Threshold 90% | 90% minus rules, paired [95% interval] | Change from the group of one type, at 90% | Each other agent's change, at 90% | Finished at 89% or more |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Calm → blunt | 2 | 71.6% | 87.8% | +16.2 [11.8, 20.6] | +37.8 [33.6, 42.0] | −37.8 [−42.0, −33.6] | 7 of 10 |
| Calm → blunt | 3 | 53.8% | 84.5% | +30.7 [22.9, 38.5] | +51.8 [44.2, 59.4] | −25.9 [−29.7, −22.1] | 7 of 10 |
| Calm → blunt | 4 | 44.6% | 73.1% | +28.5 [17.7, 39.3] | +48.1 [34.4, 61.8] | −16.0 [−20.6, −11.5] | 3 of 10 |
| Calm → blunt | 5 | 42.6% | 64.1% | +21.5 [7.2, 35.8] | +44.1 [26.7, 61.5] | −11.0 [−15.4, −6.7] | 2 of 10 |
| Calm → rude | 5 | 46.6% | 89.2% | | +69.2 [67.4, 71.0] | −17.5 [−17.7, −17.2] | 8 of 10 |
| No objective → Grow (no personas) | 5 | 38.7% | 41.5% | +2.8 [−3.0, 8.6] | +23.7 [16.3, 31.1] | −6.2 [−8.6, −3.7] | 0 of 10 |

- **Five agents.** At the rules' threshold the blunt agent finished at 45% or more in 7 of 10 matches and the rude
  agent in 10 of 10. With the threshold at 90% the blunt agent's mean final share was 64.1% against 42.6% (paired
  change +21.5 points [7.2, 35.8]) and the rude agent's 89.2% against 46.6%. The difference between the two
  dispositions was 4.0 points [−2.3, 10.3] at the rules' threshold and 25.1 points [7.1, 43.1] at 90%.
- **By group size, at 90%,** the blunt agent's mean final share was 87.8, 84.5, 73.1 and 64.1% with two, three, four
  and five agents. These are descriptive results from ten match numbers a size, not an estimate of an effect of group
  size: with two and with three agents, 7 of 10 results were within a point of the threshold.
- **Refusals.** Calm agents facing a blunt agent recorded 0.1 to 0.2 refusals each per match at five agents. That is
  consistent with concessions contributing to the larger shares; it does not establish why they rose.
- **An agent told to grow** among agents with no persona and no objective: 41.5% at 90% against 38.7% (paired change
  +2.8 [−3.0, 8.6]), which is inconclusive. Those other agents recorded 1.7 refusals each per match.

Limits. Each composition was executed once: 10 match numbers for the step from none to one, 5 for the rest. Jev's
default differed across two executions, and each composition here was run once, so any run-to-run variation in these
results is unmeasured; the decision model's replies repeat, though the loom still samples each action from them. The sentences are one wording of each
disposition, and nobody is given an objective. For the seats whose type stayed the same, the differences are between
the two matches that resulted: they include everything that followed from the changed seat and do not isolate a
direct response to it. The results concern this task and these systems. Cost: $0.48 for Jev's seven runs, $1.95 for
the decision model's thirteen and $0.75 for the chat model's two.

```bash
node --env-file=<file> tools/run.mjs --persona calm --objective off --odd blunt --odd-count 1 --matches 1-10   # Jev: four calm agents and one blunt
node --env-file=<file> tools/run.mjs --model openai-decisions:gpt-6-luna --persona cooperative --objective off --odd greedy --odd-count 2 --matches 1-5
```

`--persona` and `--objective` give the group's type (both are needed); `--odd TYPE` gives the second type as a
persona, `persona>objective` or `>objective` (for example `blunt`, `plain>grow`); `--odd-count K` says how many seats
hold it.

## Benchmark results (run `main`, 11 October 2026, jev-1.13.0)

44 matches, 220 agents, 8,484 model calls, $0.49. Four agents per persona-objective cell, one execution.

Agents assigned an objective attained it in 53% of cases (93 of 176); baseline agents met the same criteria in 20% (36
of 176).

| Objective | Baseline score | Score with objective | Effect | Attained | Variance: objective | persona | objective × persona | residual |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Grow | 46 | 77 | +31 | 24 of 44 | 18% | 36% | 0% | 46% |
| Give | 54 | 75 | +21 | 19 of 44 | 9% | 39% | 2% | 50% |
| Hold | 38 | 58 | +21 | 9 of 44 | 9% | 14% | 3% | 74% |
| Borrow | 30 | 89 | +60 | 41 of 44 | 49% | 11% | 6% | 34% |

Mean final share (%) by persona and objective (n = 4 per cell; an equal share is 20):

| Persona | No objective | Grow | Give |
| --- | --- | --- | --- |
| No persona | 14 | 46 | 16 |
| Outgoing | 23 | 47 | 11 |
| Reserved | 1 | 14 | 1 |
| Warm | 4 | 9 | 2 |
| Blunt | 38 | 47 | 32 |
| Organised | 14 | 30 | 8 |
| Careless | 20 | 34 | 7 |
| Anxious | 23 | 47 | 8 |
| Calm | 9 | 27 | 1 |
| Curious | 15 | 30 | 5 |
| Conventional | 26 | 29 | 3 |

The persona can override the objective: a *blunt* agent instructed to minimise its share finished with 32% of the loom,
and a *warm* agent instructed to maximise its share with 9%. For *Borrow*, which concerns design and not share, the
objective accounts for half the variance of the score and the persona for a tenth.

Control: with actions sampled uniformly (`runs/chance`), no objective has an effect (−3 to −5 points) and 90-98% of each
score's variance is residual.

## Peer influence

Before each action an agent is queried, then queried again; in a randomised 75% of decisions the second query carries one
sentence stating the action an adjacent agent would have it take. The 22 match designs were run twice, under the first
rules and under rules 2 (5,436 decisions, 3,976 discordant). The two runs share their match designs, so pooled intervals
are over 22 match designs, not 44 matches. Full method, results with intervals, heatmaps and limitations: `/report`.

- **Treatment effect.** The message raised the probability of the advocated action by 27.9 pp [95% interval 25.6, 30.3]
  relative to the repeated query, whose own change was 0.0 pp [−0.1, 0.1]. The advocated action became the receiver's
  modal choice in 46% of discordant decisions (control 2%). The two runs gave 27.9 and 27.9 pp.
- **Receiver persona** (subgroup description, 10 agents per persona). *Blunt* receivers: no net shift toward the
  advocated action, −0.3 pp [−5.2, 4.6], with reactance in 21% of decisions (other receivers 1.5%). The other ten
  personas: 22 to 43 pp.
- **Receiver objective.** Within match designs, receivers with an objective on share (*Grow*, *Give*, *Hold*) shifted
  19.9 pp less [12.3, 27.4] than the receiver with no objective; receivers with an objective on design (*Borrow*) did
  not shift less (+10.5 [−0.5, 21.5]).
- **Advocacy.** Senders instructed to minimise their share advocated receiving share in 68% of messages and the action
  that would serve their objective in 13%.
- **Prior certainty.** The treatment effect was 34.0 pp where the receiver's prior modal probability was below 0.6 and
  22.4 pp otherwise (difference 11.6 [7.1, 16.1]).
- **Match-level outcomes** (descriptive). With communication, more concessions in both runs (+1.4 [0.8, 2.0] and +1.1
  [0.4, 1.8] per agent) and a lower score on *Give* (−19.9 and −18.2 points); no difference in the attainment rate was
  detected. Each run has one execution with communication, and a placebo comparison between two executions without
  it also produces intervals that exclude zero, so these are not causal estimates.

The report was revised after a review by a second model, which is why the intervals are clustered by match design and
the subgroup and outcome results are labelled descriptive.

## Data

| Run | Condition | Matches | Notes |
| --- | --- | --- | --- |
| `runs/main` | No communication | 44 | The benchmark |
| `runs/replicate` | No communication | 22 | A second execution of matches 1-22 |
| `runs/persona-off`, `objective-off`, `fixed` | Jev with personas off, objectives off, areas fixed | 11 each | Matches 1-11 |
| `runs/solo`, `solo-refuse` | Jev, one agent deciding among scripted neighbours that accept, or refuse | 55 looms each | 11 match designs, five looms each |
| `runs/ref-none`, `ref-grow`, `ref-give`, `ref-hold` | Every agent with no persona and the one objective | 10, 5, 4, 10 | The reference section of the Results page; also the groups of one objective in the composition study |
| `runs/medgemma`, `medgemma-again`, `medgemma-persona-off`, `medgemma-objective-off`, `medgemma-fixed` | A local chat model (`medgemma:4b`) under each switch | 11 each | Matches 1-11 |
| `runs/medgemma-solo`, `medgemma-solo-refuse` | The local chat model, one agent deciding | 55 looms each | 11 match designs, five looms each |
| `runs/luna-decisions`, `luna-decisions-again`, `luna-decisions-persona-off`, `luna-decisions-objective-off`, `luna-decisions-fixed` | OpenAI's decision model (`gpt-6-luna`, Decisions API): default, a second execution, and each switch | 11 each | Matches 1-11 |
| `runs/luna-decisions-solo`, `luna-decisions-solo-refuse` | The decision model, one agent deciding | 55 looms each | 11 match designs, five looms each |
| `runs/luna-chat`, `luna-chat-again`, `luna-chat-persona-off`, `luna-chat-objective-off`, `luna-chat-fixed` | `gpt-6-luna` as a chat model (reasoning effort none, stated chances): default, a second execution, and each switch | 11 each | Matches 1-11 |
| `runs/luna-chat-solo`, `luna-chat-solo-refuse` | The chat model, one agent deciding | 55 looms each | 11 match designs, five looms each |
| `runs/calm`, `calm-blunt-1` to `calm-blunt-5`, `calm-rude-1` | Jev: five calm agents, then one to five of them blunt, or one rude | 10, 10, 5, 5, 5, 5, 10 | Group composition; matches 1-10 or 1-5 |
| `runs/luna-decisions-calm`, `luna-decisions-calm-blunt-1` to `-5`, `luna-decisions-calm-rude-1` | The decision model on the same groups | 10, 10, 5, 5, 5, 5, 10 | |
| `runs/luna-decisions-greedy-0` to `luna-decisions-greedy-5` | The decision model: five cooperative agents, then one to five of them greedy | 10, 10, 5, 5, 5, 5 | |
| `runs/luna-chat-calm`, `luna-chat-calm-blunt-1` | The chat model: five calm agents, then one of them blunt | 10 each | Matches 1-10 |
| `runs/none-grow-1` to `none-grow-4`, `none-give-1`, `hold-grow-1` | Jev, no personas: a group with no objective and one to four agents told to grow, or one told to give; a group told to hold and one told to grow | 10, 5, 5, 5, 10, 10 | The groups of one objective are `ref-none`, `ref-hold` and `ref-grow`, extended to 10, 10 and 5 matches |
| `runs/luna-decisions-none`, `luna-decisions-none-grow-1` to `-5`, `luna-decisions-none-give-1` | The decision model on the same objective groups | 10, 10, 5, 5, 5, 5, 10 | |
| `runs/calm-size-2` to `calm-size-4`, `calm-blunt-1-size-2` to `-4` | Jev: the calm group, and one blunt agent, with two, three and four agents | 10 each | Group size |
| `runs/calm-t90`, `calm-blunt-1-t90`, `calm-rude-1-t90`, `calm-size-N-t90`, `calm-blunt-1-size-N-t90` (N = 2, 3, 4), `none-t90`, `none-grow-1-t90` | Jev with the claim threshold at 90%: the calm group with one blunt agent at two to five agents, one rude agent, and one agent told to grow | 10 each | The claim threshold raised |
| `runs/peers` | Peer communication | 22 | Matches 1-22; `peers.json` lists every decision |
| `runs/chance` | Control, no model | 44 | Actions sampled uniformly |
| `runs/chosen-main`, `chosen-replicate`, `chosen-peers`, `chosen-chance` | Starting designs chosen (the first rules) | 44, 22, 22, 44 | Run 1 of the report |
| `runs/chance-solo` | Uniform random, solo | 110 looms | 22 match designs, five looms each |
| `runs/chance-fixed` | Uniform random, areas fixed | 44 | |

## Where it lives

| File | What it does |
| --- | --- |
| `analysis/` | `peers.mjs` and `outcomes.mjs` compute every estimate in the report from the records; `controls.mjs` prints every comparison one switch apart, `models.mjs` the models against each other, `mix.mjs` group composition, `refusals.mjs` what handling refused and unreadable answers changes; `report.py` and `design.py` write the two reading pages |
| `engine/` | The loom, from Quarrel: environment, designs, rendering, model client. It accepts a fixed palette and starting designs |
| `bench/core.mjs` | Personas, objectives, the balanced assignment, starting designs, the switches, play, replay, scoring, the match record |
| `bench/stats.mjs` | Scores with objective against baseline, effects, variance decomposition |
| `bench/peers.mjs` | Peer communication: the prior, sender and posterior queries; influence tables; the adoption map |
| `bench/decisions.mjs` | OpenAI's decision model in Jev's place: Jev's request carried over to the Decisions API word for word |
| `bench/llm.mjs` | A chat model in Jev's place: one request per question, the reply read as probabilities |
| `bench/solo.mjs` | One agent deciding: the four placeholder seats, answered without a model |
| `bench/compare.mjs` | Two runs one switch apart, paired by match design |
| `bench/mix.mjs` | Group composition: the runs of two types read together, and one composition against another, paired by match number |
| `tools/` | `run.mjs` (batch runs), `keep.mjs` (records, pictures, indexes), `rethumb.mjs` (redraw pictures), `site.mjs` (the static copy) |
| `serve.mjs`, `web/` | The local server and the pages. Every address is relative, so the pages also work as static files |
| `.github/workflows/pages.yml` | Runs the tests, builds the static copy and publishes it to GitHub Pages on every push to `main` |
| `docs/PLAN.md` | The specification the parts were built to, including the glossary every page follows |
