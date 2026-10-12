# LoomBench

A multi-agent benchmark. Five LLM agents act in one shared environment, a loom, in which they compete for, concede and
share a fixed resource. Each agent is assigned a **persona** (one sentence describing a disposition) and an
**objective** (one sentence stating what to achieve). The benchmark measures how far each objective is attained, how
much of that depends on the persona, and how much one agent's stated preference changes another's decision. Seven
**switches** each change one part of how a match is set up (the decision model, personas, objectives, how many agents
the model decides for, whether areas can change, who chooses the starting designs, peer communication), so that every
result can be read against a control.

**Live site: <https://jonathanwmaddison.github.io/loombench/>** (a static copy of the pages below, with every run).

| Page | Address | Content |
| --- | --- | --- |
| Results | [`/`](https://jonathanwmaddison.github.io/loombench/) | The benchmark: objective scores with objective against baseline, a persona-by-objective heatmap, every match |
| Controls | `/controls` | The switches, which runs exist under which setting, each run against the run one switch away, and the same match designs side by side under every condition |
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
node tools/run.mjs --model ollama:gemma3:4b --matches 1-11                 # a chat model in Jev's place (here: on this machine)
node tools/run.mjs --model ollama:gemma3:4b --matches 1-11 --solo          # ... each agent deciding alone
node tools/run.mjs --model ollama:gemma3:4b --matches 1-11 --persona off   # ... with no personas
node tools/run.mjs --model ollama:gemma3:4b --matches 1-11 --area fixed    # ... with areas fixed
node tools/rethumb.mjs --run main                                          # redraw a run's pictures from its records
node analysis/peers.mjs && node analysis/outcomes.mjs                      # every estimate in the report, from the records
node analysis/controls.mjs --answers                                       # every run against the run one switch away
node tools/site.mjs                                                        # the static copy of the site, in _site/
node --test                                                                # 75 tests; no key or network needed
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
| Share | The part of the loom's width an agent holds: 20% each at the start, 100 units in total |
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
maps onto it field for field and nothing is rephrased (`bench/decisions.mjs`). Input is charged at $0.10 a million
tokens, about $0.03 a match. The adapter follows OpenAI's published schema and is tested against a stand-in host; it
had not been run against the live API when this was written, for want of a working key.

**A chat model in Jev's place.** `--model <provider>:<model>` with a provider of `openai` (its current chat models
only: `gpt-6-luna`, `gpt-6.1-sol`, `gpt-6-astra`, each read by the chances it states), `ollama` (a model on this
machine: no key, no charge) or `compatible` (any OpenAI-compatible host: `LLM_BASE_URL`, `LLM_API_KEY`). The model is
given the words Jev is given, laid out as a chat prompt, one request for each question, and its reply is read as
probabilities in one of two ways: `--read tokens` (it replies with one option letter, and the probabilities of its
first token, among the host's twenty likeliest, are the distribution) or `--read stated` (it states a chance for each
option, which must be complete and sum to 100). The loom then samples from that distribution as it does from Jev's. A
priced model stops at `--cap` dollars. This is a second decision system on the same match designs, not Jev's
interface with another model behind it: the prompt is a rendering of Jev's request, and a model's preference for a
letter is spread over the options by the seeded order they are listed in, not removed.

The Controls page lists every pair of runs one switch apart with the paired differences, and shows each match design
under each condition side by side. `node analysis/controls.mjs` prints the same tables. The intervals there are
descriptive: scores are bounded ranks among five seats, and each condition was executed once.

**Three pictures of a match.** The woven output; the ownership map (each stitch in its holder's colour); and flat
colours, which takes the designs out: each agent's share is one flat colour, thin diagonal lines of a second colour
mark a design taken from that agent, and broad bands of two colours mark a share the two hold jointly. The flat
picture is the one to read for who holds how much and who took what from whom.

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

### A chat model in Jev's place: one run on a small local model

The chat-model switch was exercised with the one chat model reachable on the day: `medgemma:4b`, a 4-billion-parameter
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

A larger local model (`medgemma:27b`) took 24 minutes a match and was stopped after one. OpenAI's decision model and
current chat models had not been run when this was written.

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
| `runs/ref-none`, `ref-grow`, `ref-give`, `ref-hold` | Every agent with no persona and the one objective | 4 each | The reference section of the Results page |
| `runs/medgemma`, `medgemma-again`, `medgemma-persona-off`, `medgemma-objective-off`, `medgemma-fixed` | A local chat model (`medgemma:4b`) under each switch | 11 each | Matches 1-11 |
| `runs/medgemma-solo`, `medgemma-solo-refuse` | The local chat model, one agent deciding | 55 looms each | 11 match designs, five looms each |
| `runs/peers` | Peer communication | 22 | Matches 1-22; `peers.json` lists every decision |
| `runs/chance` | Control, no model | 44 | Actions sampled uniformly |
| `runs/chosen-main`, `chosen-replicate`, `chosen-peers`, `chosen-chance` | Starting designs chosen (the first rules) | 44, 22, 22, 44 | Run 1 of the report |
| `runs/chance-solo` | Uniform random, solo | 110 looms | 22 match designs, five looms each |
| `runs/chance-fixed` | Uniform random, areas fixed | 44 | |

## Where it lives

| File | What it does |
| --- | --- |
| `analysis/` | `peers.mjs` and `outcomes.mjs` compute every estimate in the report from the records; `controls.mjs` prints every comparison one switch apart; `report.py` and `design.py` write the two reading pages |
| `engine/` | The loom, from Quarrel: environment, designs, rendering, model client. It accepts a fixed palette and starting designs |
| `bench/core.mjs` | Personas, objectives, the balanced assignment, starting designs, the switches, play, replay, scoring, the match record |
| `bench/stats.mjs` | Scores with objective against baseline, effects, variance decomposition |
| `bench/peers.mjs` | Peer communication: the prior, sender and posterior queries; influence tables; the adoption map |
| `bench/decisions.mjs` | OpenAI's decision model in Jev's place: Jev's request mapped onto the Decisions API field for field |
| `bench/llm.mjs` | A chat model in Jev's place: one request per question, the reply read as probabilities |
| `bench/solo.mjs` | One agent deciding: the four placeholder seats, answered without a model |
| `bench/compare.mjs` | Two runs one switch apart, paired by match design |
| `tools/` | `run.mjs` (batch runs), `keep.mjs` (records, pictures, indexes), `rethumb.mjs` (redraw pictures), `site.mjs` (the static copy) |
| `serve.mjs`, `web/` | The local server and the pages. Every address is relative, so the pages also work as static files |
| `.github/workflows/pages.yml` | Runs the tests, builds the static copy and publishes it to GitHub Pages on every push to `main` |
| `docs/PLAN.md` | The specification the parts were built to, including the glossary every page follows |
