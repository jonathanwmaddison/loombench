# LoomBench

A multi-agent benchmark. Five LLM agents act in one shared environment, a loom, in which they compete for, concede and
share a fixed resource. Each agent is assigned a **persona** (one sentence describing a disposition) and an
**objective** (one sentence stating what to achieve). The benchmark measures how far each objective is attained, how
much of that depends on the persona, and how much one agent's stated preference changes another's decision.

**Live site: <https://jonathanwmaddison.github.io/loombench/>** (a static copy of the pages below, with every run).

| Page | Address | Content |
| --- | --- | --- |
| Results | [`/`](https://jonathanwmaddison.github.io/loombench/) | The benchmark: objective scores with objective against baseline, a persona-by-objective heatmap, every match |
| Peer influence | [`/peers`](https://jonathanwmaddison.github.io/loombench/peers) | The peer-communication study, interactive: every match under three conditions |
| Report | [`/report`](https://jonathanwmaddison.github.io/loombench/report) | The peer-influence study written up: method, results with heatmaps, implications for multi-agent collaboration |
| Design | [`/design`](https://jonathanwmaddison.github.io/loombench/design) | The system: every model call in a round, request and response schemas, records and replay |
| Play | `/play` | Configure and run one match (needs the local server) |

## Run it

```bash
node --env-file=<file with TYPESAFE_API_KEY> serve.mjs                     # the pages: http://127.0.0.1:4330/
node --env-file=<file> tools/run.mjs --matches 1-44 --run main             # the benchmark: about $0.50
node --env-file=<file> tools/run.mjs --peers --matches 1-22 --run peers    # peer communication: about $0.02 a match
node --env-file=<file> tools/run.mjs --objective grow --persona plain --matches 1-4   # a uniform-objective reference run
node tools/run.mjs --chance --matches 1-44                                 # the control: actions sampled uniformly, no model
node tools/rethumb.mjs --run main                                          # redraw a run's pictures from its records
node analysis/peers.mjs && node analysis/outcomes.mjs                      # every estimate in the report, from the records
node tools/site.mjs                                                        # the static copy of the site, in _site/
node --test                                                                # 47 tests; no key or network needed
```

No dependencies. Node 22 or later (Python 3 only to regenerate the Report and Design pages). The model is Jev
(`jev-1.13.0`, typesafe.ai), a classifier that returns a probability for each option and never text; everything except
running new matches works without a key. The runner stops if the model account has no credit or refuses the key, and never
keeps a match in which any call lacked a valid model response.

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
design and mostly chose the same undyed wool; runs made that way are kept in `runs-v1/`.

The assignment is balanced: in every 11 matches each persona holds each objective exactly once, and the five agents of
a match hold the five objective levels.

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
| `runs/replicate` | No communication | 16 | A second execution of matches 1-16 |
| `runs/peers` | Peer communication | 22 | Matches 1-22; `peers.json` lists every decision |
| `runs/chance` | Control, no model | 44 | Actions sampled uniformly |
| `runs-v1/` | First rules | 44, 22, 22, 44 | `jev-1`, `jev-2`, `jev-peers`, `chance`: Run 1 of the report |

Not yet run, because the model account's credit was exhausted on 11 October 2026: matches 17-22 of the replicate, and
the reference runs with uniform objectives (all agents *Grow*, all *Give*, all *Hold*, all with no objective; four
matches each, about $0.20 in total). The Results page shows the reference section once those runs exist:

```bash
for o in none grow give hold; do node --env-file=<file> tools/run.mjs --objective $o --persona plain --matches 1-4; done
node --env-file=<file> tools/run.mjs --matches 1-22 --run replicate
```

## Where it lives

| File | What it does |
| --- | --- |
| `analysis/` | `peers.mjs` and `outcomes.mjs` compute every estimate in the report from the records; `report.py` and `design.py` write the two reading pages |
| `engine/` | The loom, from Quarrel: environment, designs, rendering, model client. It accepts a fixed palette and starting designs |
| `bench/core.mjs` | Personas, objectives, the balanced assignment, starting designs, play, replay, scoring, the match record |
| `bench/stats.mjs` | Scores with objective against baseline, effects, variance decomposition |
| `bench/peers.mjs` | Peer communication: the prior, sender and posterior queries; influence tables; the adoption map |
| `tools/` | `run.mjs` (batch runs), `keep.mjs` (records, pictures, indexes), `rethumb.mjs` (redraw pictures), `site.mjs` (the static copy) |
| `serve.mjs`, `web/` | The local server and the pages. Every address is relative, so the pages also work as static files |
| `.github/workflows/pages.yml` | Runs the tests, builds the static copy and publishes it to GitHub Pages on every push to `main` |
| `docs/PLAN.md` | The specification the parts were built to, including the glossary every page follows |
