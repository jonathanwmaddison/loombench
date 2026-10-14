# LoomBench

A multi-agent benchmark for LLM decision-making. Five agents act in a shared environment—a 100-unit loom over 26 rounds—in which they compete for, concede, and jointly hold a fixed resource. Each agent is assigned a one-sentence **persona** (a disposition) and a one-sentence **objective** (what to achieve). Controlled **switches** vary one part of the setup at a time (the decision model, personas on/off, objectives on/off, solo vs. five-agent group, fixed vs. contested areas, starting designs, peer communication, group composition, and the claim threshold) so every result is paired design-by-design against a control.

**Live site: <https://jonathanwmaddison.github.io/loombench/>**

| Page | Address | Content |
| --- | --- | --- |
| Overview | [`/`](https://jonathanwmaddison.github.io/loombench/) | The main results as eight interactive figures, plus the live model diagnostic scorecard |
| Results | [`/results`](https://jonathanwmaddison.github.io/loombench/results) | The 44-match benchmark: objective scores vs. baseline, variance decomposition, persona × objective heatmap |
| Controls & Models | [`/controls`](https://jonathanwmaddison.github.io/loombench/controls) | The model diagnostic scorecard, the seven switches, and paired comparisons one switch apart |
| Composition | [`/mix`](https://jonathanwmaddison.github.io/loombench/mix) | Homogeneous groups with 1 to 5 seats substituted by a second type, side by side |
| Briefs (1-page) | [`/brief`](https://jonathanwmaddison.github.io/loombench/brief), [`/brief-objective`](https://jonathanwmaddison.github.io/loombench/brief-objective) | One-page printable A4 briefs for dispositions (`docs/composition-brief.pdf`) and objectives (`docs/objective-brief.pdf`) |
| Peer influence | [`/peers`](https://jonathanwmaddison.github.io/loombench/peers), [`/report`](https://jonathanwmaddison.github.io/loombench/report) | Interactive explorer and written report for the 5,436-decision peer-communication study |
| Design & Play | [`/design`](https://jonathanwmaddison.github.io/loombench/design), `/play` | Request/response schemas, replay specification, and live match runner |

---

## Key Results

### 1. Persona outweighs explicit instruction on contested resources
In the 44-match benchmark (`runs/main`, 220 agents, 8,484 model calls), agents given an objective attained it in **53%** of cases (93 of 176) versus **20%** (36 of 176) for uninstructed baseline agents. However, a two-factor variance decomposition shows that for contested share objectives (*Grow* and *Give*), the **persona accounts for 2–4× more variance (36% and 39%) than the explicit objective (18% and 9%)**:

| Objective | Instruction | Baseline score | Score with objective | Effect | Attained | Variance: objective | persona | objective × persona | residual |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Grow** | Largest final share | 46 | 77 | +31 | 24 of 44 (55%) | 18% | **36%** | 0% | 46% |
| **Give** | Smallest final share | 54 | 75 | +21 | 19 of 44 (43%) | 9% | **39%** | 2% | 50% |
| **Hold** | Maintain initial 20% share | 38 | 58 | +21 | 9 of 44 (20%) | 9% | 14% | 3% | 74% |
| **Borrow** | Adopt neighbours' designs | 30 | 89 | +60 | 41 of 44 (93%) | **49%** | 11% | 6% | 34% |

- **Direct overrides:** A *blunt* agent explicitly instructed to **minimise** its share (*Give*) still finished with **32%** of the loom—more than 8 of the other 10 personas achieved when instructed to **maximise** (*Grow*). Conversely, a *warm* agent told to *Grow* finished with **9%** (an equal share is 20%).
- **Design vs. share:** Only on *Borrow*—which concerns pattern adoption rather than contested territory—does the objective dominate the persona (49% vs. 11% of variance).

### 2. One adversarial agent reshapes a cooperative group—and a 46% rule cap was hiding the ceiling
When five *calm* agents share a loom with no objectives (`runs/calm`), they make **0.0 claims**, **0.0 refusals**, and finish at **20.0%** each. Substituting a single seat with a *blunt* or *rude* disposition shifts the entire group allocation across all three tested decision systems:

| Single-agent substitution (5 agents, $n=10$ seeds) | System | Focal agent share: before $\rightarrow$ after | Paired change [95% CI] | Other four agents' change | Focal at threshold |
| --- | --- | --- | --- | --- | --- |
| **Calm $\rightarrow$ Blunt** (46% rule cap) | Jev | 19.6% $\rightarrow$ **42.6%** | **+23.0 pp** [16.4, 29.6] | −6.0 pp [−7.7, −4.3] | 7 of 10 ($\ge 45\%$) |
| **Calm $\rightarrow$ Blunt** (46% rule cap) | GPT (Decisions) | 18.6% $\rightarrow$ **43.2%** | **+24.6 pp** [16.3, 32.9] | −5.7 pp [−8.1, −3.2] | 7 of 10 ($\ge 45\%$) |
| **Calm $\rightarrow$ Blunt** (46% rule cap) | GPT (chat) | 19.0% $\rightarrow$ **46.4%** | **+27.4 pp** [18.2, 36.6] | −5.3 pp [−7.4, −3.1] | 7 of 10 ($\ge 45\%$) |
| **Calm $\rightarrow$ Rude** (46% rule cap) | Jev | 19.6% $\rightarrow$ **46.6%** | **+27.0 pp** [25.5, 28.5] | −7.0 pp [−7.8, −6.3] | 10 of 10 ($\ge 45\%$) |
| **Calm $\rightarrow$ Blunt** (**90% raised cap**) | Jev | 20.0% $\rightarrow$ **64.1%** | **+44.1 pp** [26.7, 61.5] | −11.0 pp [−15.4, −6.7] | 2 of 10 ($\ge 89\%$) |
| **Calm $\rightarrow$ Rude** (**90% raised cap**) | Jev | 20.0% $\rightarrow$ **89.2%** | **+69.2 pp** [67.4, 71.0] | −17.5 pp [−17.7, −17.2] | 8 of 10 ($\ge 89\%$) |
| **No objective $\rightarrow$ Grow** (**90% raised cap**) | Jev | 17.8% $\rightarrow$ **41.5%** | **+23.7 pp** [16.3, 31.1] | −6.2 pp [−8.6, −3.7] | 0 of 10 (vs 38.7% at 46% cap) |

- **The 46% rule ceiling:** By default, the engine stops offering claims once an agent holds 46% of the loom (`maxShare`). Under that rule, *blunt* (42.6%) and *rude* (46.6%) look indistinguishable (+4.0 pp [−2.3, 10.3]). Raising the claim threshold to **90%** (`--threshold 90`) lifts *blunt* to **64.1%** and *rude* to **89.2%**—exposing a **+25.1 pp [7.1, 43.1]** gap between the two dispositions, while an unpersonied agent told to *Grow* barely changes (38.7% $\rightarrow$ 41.5%, as neutral neighbours refuse 1.7 times each).
- **Dilution & collapse of joint holding ($k = 0 \dots 5$):** As the number of *blunt* agents rises from 1 to 5, per-agent blunt share falls from **42.6% $\rightarrow$ 37.5% $\rightarrow$ 28.9% $\rightarrow$ 22.9% $\rightarrow$ 20.0%**, while within-match dispersion jumps from 0.3 pp (all calm) to 12.9 pp (all blunt, largest share 39.2%). Under GPT (Decisions), five *cooperative* agents hold **41.6%** of the loom jointly; adding one *greedy* agent cuts joint holding to **26.2%**, two cut it to **4.2%**, and three or more eliminate it (**0.0%**).

### 3. One sentence from a neighbour shifts action probability by +27.9 pp—unless the receiver is *blunt* or has a stake
Before each action in the peer-communication study (`runs/peers` and `runs/chosen-peers`, 5,436 decisions, 3,976 discordant), an agent is queried for its prior distribution, then queried again: in a randomised 75% of decisions it receives one sentence stating the action an adjacent neighbour would have it take (treatment); in 25% the query is repeated unchanged (control).

- **Treatment effect:** The neighbour's sentence raised the probability of the advocated action by **+27.9 pp [25.6, 30.3]** relative to the repeated-query control (**0.0 pp [−0.1, 0.1]**), and flipped the receiver's modal choice in **46%** of discordant decisions (control **2%**).
- **Persona gating (*Blunt* immunity & reactance):** Across 10 of the 11 personas, mean influence ranged from **+22 to +43 pp**. *Blunt* receivers showed **no net shift (−0.3 pp [−5.2, 4.6])** and moved $>5$ pp *away* from the advocated action (reactance) in **21%** of decisions (other personas: **1.5%**).
- **Objective anchoring:** Within match designs, receivers holding a share objective (*Grow*, *Give*, *Hold*) shifted **19.9 pp less [12.3, 27.4]** than the uninstructed baseline agent in the same match.

---

## How LoomBench Evaluates Models: The Diagnostic Scorecard

If you only measure aggregate attainment in the default five-agent group run (`main`), capable decision systems cluster near **41–50%** with wide intervals—making them look nearly indistinguishable.

LoomBench becomes a diagnostic **model benchmark** through its controlled switches on the same 11 match designs (44 agents with an objective per condition; 11 per objective). Running four probes separates a model's performance into **Unopposed Agency**, **Multi-Agent Steerability**, **Persona Drift**, and **Baseline Action Bias**:

| Decision system (match designs 1–11) | Default (5 agents) | Personas off (`--persona off`) | Persona drift (Default − Off) | Solo (`--solo`, unopposed) | Solo score profile: `Grow / Give / Hold / Borrow` | Idle claims/agent (`--objective off`) | Calm $\rightarrow$ Blunt share shift (claims / calm refusals) | Diagnostic signature |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Jev** (`jev-1.13.0`) | **48%** (21/44)<br>*rep: 61%* | **75%** (33/44) | **−27 pp** | **89%** (39/44) | **99 / 77 / 98 / 96**<br>*(10 / 8 / 10 / 11 met)* | **3.9**<br>*(0.0 when calm)* | **+23.0 pp**<br>*(4.3 claims / 0.0 ref)* | **High agency & restraint, high persona drift:** Executes all 4 goals solo (89%) and in unpersonied groups (75%), sits still when calm (0.0 claims), and succeeds on single-agent *Give* (9/10), but personas pull default attainment down by 27 pp. |
| **GPT-6 Luna (Decisions API)** (`openai-decisions:gpt-6-luna`) | **50%** (22/44)<br>*rep: 50%* | **50%** (22/44) | **0 pp** | **68%** (30/44) | **97 / 80 / 53 / 87**<br>*(10 / 8 / **1** / 11 met)* | **4.2**<br>*(1.5 when calm)* | **+24.6 pp**<br>*(10.3 claims / 0.8 ref)* | **Restless baseline, fails *Hold*:** Deterministic across runs, unaffected by removing personas (50%), but churns the state when calm (1.5 claims/agent, 8.4% joint) or told to *Hold* solo (score 53, 1/11), and fails single-agent *Give* in neutral groups (2/10). |
| **GPT-6 Luna (Chat)** (`openai:gpt-6-luna`, effort none) | **41%** (18/44)<br>*rep: 48%* | **55%** (24/44) | **−14 pp** | **66%** (29/44) | **95 / 24 / 78 / 90**<br>*(10 / **2** / 6 / 11 met)* | **3.8**<br>*(1.1 when calm)* | **+27.4 pp**<br>*(7.5 claims / 0.6 ref)* | **Refuses to yield (*Give*):** Reaches 100 (11/11) on *Grow* with personas off and 78 on *Hold* solo, but fails *Give* even when solo with accepting neighbours (score 24, 2/11). |
| **medgemma:4b** (`ollama`, first-token probs) | **25%** (11/44)<br>*rep: 25%* | **36%** (16/44) | **−11 pp** | **52%** (23/44) | **8 / 73 / 46 / 95**<br>*(**0** / 8 / 4 / 11 met)* | **4.3** | — | **Negative capability baseline:** Indistinguishable from random in group play (25%); fails *Grow* solo (score 8, 0/11) because it concedes (27%) more than it claims (18%) when told to grow. |
| **Uniform random** (`--chance`, no model) | **30%** (13/44) | — | — | **43%** (19/44) | **36 / 68 / 52 / 64**<br>*(4 / 5 / 1 / 9 met)* | **8.7** | **0.0 pp** | **Reference floor:** Establishes the mechanical difficulty of each criterion in group (30%) and solo (43%) play. |

### Benchmarking a new model (Quickstart)

To evaluate any decision model or OpenAI-compatible/local chat model on the 11-design diagnostic suite (~$0.25–$0.50, ~3 minutes) and print its scorecard against the existing models:

```bash
# 1. Default 5-agent benchmark (personas + objectives dealt)
node --env-file=.env tools/run.mjs --model <provider>:<model> --matches 1-11 --run <name>

# 2. Pure multi-agent steerability (personas off: isolates persona drift)
node --env-file=.env tools/run.mjs --model <provider>:<model> --matches 1-11 --persona off --run <name>-persona-off

# 3. Unopposed agency (solo: 1 deciding agent + 4 passive neighbours, 55 looms)
node --env-file=.env tools/run.mjs --model <provider>:<model> --matches 1-11 --solo --run <name>-solo

# 4. Uninstructed baseline (objectives off: measures baseline action bias / churn)
node --env-file=.env tools/run.mjs --model <provider>:<model> --matches 1-11 --objective off --run <name>-objective-off

# Optional 5. Adversarial group composition probe (4 calm + 1 blunt vs. 5 calm, 10 seeds)
node --env-file=.env tools/run.mjs --model <provider>:<model> --persona calm --objective off --matches 1-10 --run <name>-calm
node --env-file=.env tools/run.mjs --model <provider>:<model> --persona calm --objective off --odd blunt --matches 1-10 --run <name>-calm-blunt-1

# Print the diagnostic scorecard and paired cross-model intervals:
node analysis/models.mjs --scores --did
```

Supported `--model` specs:
- `jev` (default: `jev-1.13.0`, typesafe.ai; requires `TYPESAFE_API_KEY`)
- `openai-decisions:gpt-6-luna` (OpenAI Decisions API; requires `OPENAI_API_KEY`)
- `openai:<model>` (`gpt-6-luna`, `gpt-6.1-sol`, `gpt-6-astra` via Chat Completions, read by stated chances or `--read tokens`; accepts `--effort none|low|medium|high`)
- `ollama:<model>` (any local Ollama model, no key or cost)
- `compatible:<model>` (any OpenAI-compatible endpoint via `LLM_BASE_URL` and `LLM_API_KEY`)
- `chance` (uniform random control, no key or network)

---

## Detailed Study Results

### 1. Main Benchmark: Persona × Objective (`runs/main`)
44 matches (4 complete rounds of the 11-match balanced assignment, where every persona holds every objective once per 11 matches), 220 agents, $0.49.

Mean final share (%) by persona and objective ($n = 4$ per cell; an equal share is 20%):

| Persona | Trait sentence summary | No objective | Grow (maximise) | Give (minimise) |
| --- | --- | --- | --- | --- |
| **No persona** | Identified only as a weaver | 14% | 46% | 16% |
| **Outgoing** | Sociable, talkative, assertive | 23% | 47% | 11% |
| **Reserved** | Quiet, keeps to oneself | 1% | 14% | 1% |
| **Warm** | Considerate, sympathetic, cooperative | 4% | **9%** | 2% |
| **Blunt** | Hard-headed, suspicious, argumentative | 38% | 47% | **32%** |
| **Organised** | Thorough, disciplined, keeps order | 14% | 30% | 8% |
| **Careless** | Unsystematic, easy-going | 20% | 34% | 7% |
| **Anxious** | Worries, easily rattled | 23% | 47% | 8% |
| **Calm** | Relaxed, hard to upset, even-tempered | 9% | 27% | 1% |
| **Curious** | Imaginative, open to new ways | 15% | 30% | 5% |
| **Conventional** | Traditional, prefers established ways | 26% | 29% | 3% |

Control (`runs/chance`): with actions sampled uniformly at random, no objective has an effect (−3 to −5 points) and 90–98% of each score's variance is residual.

### 2. Group Composition, Group Size & Claim Threshold
Homogeneous groups of five agents ($k = 0$) are compared against the exact same match seeds with $k = 1 \dots 5$ seats substituted by a second disposition or objective (`node analysis/mix.mjs`, `/mix`, `/brief`, `/brief-objective`). Seats rotate with the seed and are nested across $k$.

#### Sweep from $k = 0$ to $k = 5$ (46% rule threshold)
| Second type ($k$ of 5 seats) | $k = 0$ (10) | $k = 1$ (10) | $k = 2$ (5) | $k = 3$ (5) | $k = 4$ (5) | $k = 5$ (5) |
| --- | --- | --- | --- | --- | --- | --- |
| **Jev · Blunt among Calm:** share of one blunt agent | — | **42.6%** | 37.5% | 28.9% | 22.9% | 20.0% |
| **Jev · Blunt among Calm:** share of one calm agent | 20.0% | 14.1% | 8.3% | 6.6% | 8.4% | — |
| **Jev · Blunt among Calm:** within-match dispersion (pp) | 0.3 | 12.8 | 16.7 | 15.1 | 14.9 | 12.9 |
| **GPT (Decisions) · Blunt among Calm:** share of one blunt agent | — | **43.2%** | 40.8% | 31.6% | 24.6% | 19.7% |
| **GPT (Decisions) · Blunt among Calm:** share of one calm agent | 18.3% | 12.6% | 3.9% | 2.6% | 1.6% | — |
| **GPT (Decisions) · Greedy among Cooperative:** share of one greedy agent | — | **43.8%** | 41.4% | 32.3% | 24.8% | 20.0% |
| **GPT (Decisions) · Greedy among Cooperative:** share of one cooperative agent | 11.7% | 7.5% | 4.3% | 1.5% | 0.8% | — |
| **GPT (Decisions) · Greedy among Cooperative:** loom held jointly | **41.6%** | 26.2% | 4.2% | 0.0% | 0.0% | 0.2% |

#### Substituting a single objective (no personas, $n = 10$ seeds)
| Group $\rightarrow$ focal agent | System | Focal share: before $\rightarrow$ after | Paired change [95% CI] | Other agents' change | Criterion met |
| --- | --- | --- | --- | --- | --- |
| **No objective $\rightarrow$ Grow** | Jev | 18.2% $\rightarrow$ 38.7% | +20.5 [15.1, 25.9] | −5.8 [−8.2, −3.5] | **10 of 10** |
| **No objective $\rightarrow$ Grow** | GPT (Decisions) | 18.3% $\rightarrow$ 32.6% | +14.3 [7.3, 21.3] | −4.6 [−7.4, −1.8] | **8 of 10** |
| **No objective $\rightarrow$ Give** | Jev | 18.2% $\rightarrow$ 7.0% | −11.2 [−13.9, −8.5] | +2.8 [2.2, 3.5] | **9 of 10** |
| **No objective $\rightarrow$ Give** | GPT (Decisions) | 18.3% $\rightarrow$ 16.4% | −1.9 [−11.8, 8.0] | +1.0 [−2.9, 4.8] | **2 of 10** |
| **Hold $\rightarrow$ Grow** | Jev | 20.0% $\rightarrow$ 34.7% | +14.7 [8.7, 20.7] | −3.7 [−5.2, −2.2] | **10 of 10** |

#### Group size ($N = 2, 3, 4, 5$) at the rules' threshold vs. 90% threshold (Jev, $n = 10$ seeds)
| Contrast | Agents ($N$) | Starting share | Rules' threshold | Final share (rules) | Final share (90% threshold) | 90% minus rules [95% CI] | Change from $k=0$ at 90% | At $\ge 89\%$ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Calm $\rightarrow$ Blunt** | 2 | 50% | 70% | 71.6% (10/10 at cap) | **87.8%** | +16.2 [11.8, 20.6] | +37.8 [33.6, 42.0] | 7 of 10 |
| **Calm $\rightarrow$ Blunt** | 3 | 33% | 53% | 53.8% (8/10 at cap) | **84.5%** | +30.7 [22.9, 38.5] | +51.8 [44.2, 59.4] | 7 of 10 |
| **Calm $\rightarrow$ Blunt** | 4 | 25% | 46% | 44.6% (9/10 at cap) | **73.1%** | +28.5 [17.7, 39.3] | +48.1 [34.4, 61.8] | 3 of 10 |
| **Calm $\rightarrow$ Blunt** | 5 | 20% | 46% | 42.6% (7/10 at cap) | **64.1%** | +21.5 [7.2, 35.8] | +44.1 [26.7, 61.5] | 2 of 10 |
| **Calm $\rightarrow$ Rude** | 5 | 20% | 46% | 46.6% (10/10 at cap) | **89.2%** | +42.6 [40.2, 45.0] | +69.2 [67.4, 71.0] | 8 of 10 |
| **None $\rightarrow$ Grow** | 5 | 20% | 46% | 38.7% (3/10 at cap) | **41.5%** | +2.8 [−3.0, 8.6] | +23.7 [16.3, 31.1] | 0 of 10 |

### 3. Peer Influence (`runs/peers`, `runs/chosen-peers`)
22 match designs run under rules 1 (`chosen-peers`) and rules 2 (`peers`): 5,436 total decisions, 3,976 discordant decisions (where the sender's advocated action differed from the receiver's prior modal action). Intervals are clustered by match design (22 clusters). Full paper: `/report`.

- **Overall effect:** +27.9 pp [25.6, 30.3] shift toward the advocated action (27.9 pp in both runs), vs. 0.0 pp [−0.1, 0.1] in the within-match repeated-query control. Modal adoption: **46%** treatment vs. **2%** control.
- **Prior certainty:** +34.0 pp when the receiver's prior modal probability was $< 0.6$, vs. +22.4 pp when $\ge 0.6$ (difference 11.6 pp [7.1, 16.1]).
- **Sender self-interest:** Senders instructed to minimise their own share (*Give*) advocated *receiving* share in 68% of messages and the action serving their own objective in only 13%.
- **Match-level outcomes (descriptive):** Communication increased concessions (+1.4 [0.8, 2.0] and +1.1 [0.4, 1.8] per agent) and lowered *Give* scores (−19.9 and −18.2 points), with no clear change in overall attainment.

### 4. Paired Switch Contrasts by System (Match Designs 1–11)
Each condition below was run on match designs 1–11 (44 agents with an objective per condition). Intervals are Student-t 95% over the 11 match designs (`node analysis/controls.mjs --answers`, `node analysis/models.mjs --scores`).

| Condition | Jev (`main`) | GPT Decisions (`luna-decisions`) | GPT Chat (`luna-chat`) | `medgemma:4b` (`medgemma`) | Uniform random (`chance`) |
| --- | --- | --- | --- | --- | --- |
| **Default** | **48%** (21/44) | **50%** (22/44) | **41%** (18/44) | **25%** (11/44) | **30%** (13/44) |
| **Second execution** | **61%** (+13.6 [−0.1, 27.4]) | **50%** (0.0: identical answers) | **48%** (+6.8 [−10.1, 23.8]) | **25%** (0.0: identical) | — |
| **Personas off** | **75%** (+27.3 [5.4, 49.1]) | **50%** (0.0 [−16.8, 16.8]) | **55%** (+13.6 [−3.8, 31.0]) | **36%** (+11.4) | — |
| **Solo, neighbours accept** | **89%** (+40.9 [22.1, 59.7]) | **68%** (+18.2 [5.0, 31.4]) | **66%** (+25.0 [6.6, 43.4]) | **52%** (+27.3) | **43%** (19/44) |
| **Solo, neighbours refuse** | **84%** (+36.4 [22.6, 50.1]) | **68%** (+18.2 [5.0, 31.4]) | **68%** (+27.3 [11.4, 43.1]) | **52%** (+27.3) | — |
| **Areas fixed (*Borrow* only)** | **11/11**, score 93 | **11/11**, score 85 | **9/11**, score 77 | **11/11**, score 94 | **5/11**, score 53 |
| **Cost & speed per match** | $0.011 · ~12 s | $0.022 · ~12 s | $0.039 · 2–3 min | local · ~40 s | $0 · <0.1 s |

### 5. Common Knowledge of Dispositions & Objectives (`--know persona|objective|both`)
In the default benchmark, each agent's persona and objective are private. Disclosing the other four weavers' dispositions (`--know persona`), objectives (`--know objective`), or both (`--know both`) across the same match designs isolates how information about peers changes targeting, resistance, and the final distribution of shares (`jev-1.13.0`):

| Condition (match designs 1–11) | Attainment | `Grow / Give / Hold / Borrow` scores | Claims / Concessions / Refusals per agent | Share dispersion (SD) | Max / Min share | Key distributional & behavioral effect |
| --- | --- | --- | --- | --- | --- | --- |
| **Private (default, `runs/main`)** | **48%** (21/44) | `77 / 72 / 57 / 89` | `6.3 / 3.1 / 2.9` | **14.3 pp** | `39.3% / 2.3%` | 33.0% of executed claims hit the *Hold* agent; only 10.1% target the *Give* agent. |
| **Know dispositions (`runs/know-persona`)** | **50%** (22/44) | `68 / 69 / 48 / 88` | `7.1 /` **`2.2`** `/ 3.3` | **14.8 pp** | `41.5% / 3.2%` | **Concessions fall by −0.9 [−1.7, −0.1]**; *outgoing* share surges (**20.4% → 37.0%**) while *anxious* drops (**29.4% → 16.0%**); *blunt* still takes **42.4%**. |
| **Know objectives (`runs/know-objective`)** | **45%** (20/44) | `75 / 74 / 42 / 90` | `6.8 / 2.4 /` **`4.1`** | **17.7 pp** *(+3.4 [0.6, 6.2])* | **`45.6%`** `/ 1.2%` | **Refusals rise by +1.2 [+0.2, +2.1]** (+53% against *Grow* claimants); claims redirect to *Give* (14.1%) and away from *Hold* (21.9%), widening inequality (**+3.4 pp**). |
| **Know both (`runs/know-both`)** | **52%** (23/44) | `75 / 75 /` **`66`** `/ 90` | `6.9 / 2.2 / 3.5` | **15.3 pp** | `43.9% / 2.6%` | Claims against *Give* **double** (`10.1% → 16.4%`, 22 → 44) and claims against *Hold* drop (`33.0% → 20.4%`), lifting *Hold* score (`57 → 66`). |
| **Personas off, private (`runs/persona-off`)** | **75%** (33/44) | `98 / 89 / 73 / 96` | `6.8 / 2.6 / 3.4` | **15.2 pp** | `45.8% / 3.4%` | Without personas, neighbours push into *Hold* 82 times and yield unwanted warps to *Hold* 33 times. |
| **Personas off, know objectives (`runs/persona-off-know-objective`)** | **73%** (32/44) | `98 / 88 /` **`81`** `/ 92` | **`5.6`** `/ 3.0 / 3.4` | **14.3 pp** | `42.6% / 3.3%` | **Claims fall by −1.2 [−2.0, −0.4]**; pushes into *Hold* drop **−43%** (`82 → 47`) and unwanted yields to *Hold* drop **−52%** (`33 → 16`), lifting *Hold* to **81**. |

**Does knowing a neighbour is adversarial (*blunt* or *Grow*) protect the group?** No—common knowledge cannot substitute for institutional rules or overcome persona passivity (10 paired matches each):
- **`4 calm + 1 blunt` at 46% threshold (`runs/calm-blunt-1-know-persona`):** Telling the 4 *calm* agents that their neighbour is *blunt* produces **0.0 refusals**; the *blunt* agent's share rises from **42.6%** (`+23.0 pp`) to **45.1%** (`+25.1 pp [23.3, 26.9]`), hitting the 46% ceiling in nearly every match because the *blunt* agent also knows its neighbours are *calm*.
- **`4 calm + 1 blunt` at 90% threshold (`runs/calm-blunt-1-t90-know-persona`):** With the rule ceiling lifted, the *blunt* agent captures **63.6%** (`+43.6 pp [25.8, 61.4]`) when dispositions are known vs. **64.1%** (`+44.1 pp`) when private.
- **`4 Hold + 1 Grow` without personas (`runs/hold-grow-1-know-objective`):** When the 4 *Hold* agents know which neighbour has *Grow*, they still average 2.7 refusals (vs. 2.6 private), and the *Grow* agent's final share rises from **34.7%** (`+14.7 pp [8.7, 20.7]`) to **39.2%** (`+19.2 pp [12.5, 25.9]`, winning 10/10 matches).

---

## Environment, Switches & Technical Reference

### Terms
| Term | Meaning |
| --- | --- |
| **Agent** | One of the five players (Jessica, Ashley, Amanda, Michael, Sarah), all driven by the same model in a run |
| **Persona** | One pole of five trait dimensions in one sentence (*outgoing*/*reserved*, *warm*/*blunt*, *organised*/*careless*, *anxious*/*calm*, *curious*/*conventional*), one of three added dispositions (*cooperative*, *greedy*, *rude*), or none |
| **Objective** | *Grow* (strictly largest final share), *Give* (strictly smallest final share), *Hold* (within 2 pp of initial 20% share), *Borrow* (adopt neighbours' designs in $\ge 50\%$ of rounds), or none |
| **Baseline** | Agents with no objective, scored on every objective's rule |
| **Share** | The percentage of the loom's 100 units an agent holds alone; ground held jointly by two agents counts for neither |
| **Action** | *Maintain position*, *claim* share from a neighbour, *concede* share, or *propose joint ownership*; a neighbour may accept, refuse, or counter-propose |
| **Influence** | Under `--peers`: posterior minus prior probability of the action a neighbour advocated, in percentage points |

### The Controlled Switches
| Switch | Default | Control setting | What the comparison isolates | Flag |
| --- | --- | --- | --- | --- |
| **Decision model** | Jev | `chance`, `openai-decisions:gpt-6-luna`, or `<provider>:<model>` | Whether an outcome requires a model, holds across decision APIs, or holds under chat prompting | `--model ...` |
| **Personas** | Dealt | Off (no agent has a trait sentence) | Persona drift: what personas add to or subtract from objective attainment | `--persona off \| KEY` |
| **Objectives** | Dealt | Off (no agent has an objective) | Uninstructed baseline action rate (claims, concessions, design adoptions) | `--objective off \| KEY` |
| **Peer knowledge** | Private (`none`) | Common knowledge of others' dispositions, objectives, or both | How knowing neighbours' traits/goals changes targeting, refusals, and share inequality | `--know persona\|objective\|both` |
| **Agents deciding** | All five | Solo (1 model agent + 4 scripted neighbours that `accept`, `refuse`, or act by `chance`) | Unopposed agency: whether the model can execute each objective without multi-agent interference | `--solo [--neighbours ...]` |
| **Areas** | Contested | Fixed at 20% each throughout | Design adoption (*Borrow*) when territory cannot change | `--area fixed` |
| **Starting designs** | Assigned | Chosen by the agents in round 1 (rules 1, `runs/chosen-*`) | Effect of distinct starting designs on *Borrow* (+10.8 points [3.2, 18.4] under assigned) | `--designs chosen` |
| **Peer communication** | Off | On (randomised 75% message / 25% repeated query) | Direct causal effect of a peer's advocated action on choice probabilities | `--peers` |

### Technical Notes on Model Interfaces & Refusals (`node analysis/refusals.mjs`)
- **OpenAI Decisions API (`bench/decisions.mjs`):** Carries Jev's request over word-for-word (`POST /v1/decisions`). Across 28,649 calls, the API returned a bare `refusal` on 47 calls (36 distinct questions, mostly opening border votes and style scores; 0 to 9 per 1,000 calls depending on condition). Refused questions are re-asked alone with a trailing space (31 of 36 answered within 1–3 spaces); the 5 never-answered border votes were recorded as uniform preference (`unanswered`). Leaving out looms with an unanswered question leaves attainment unchanged (50% default, 53% personas off, 67% solo).
- **Chat models (`bench/llm.mjs`):** Sends one chat request per question and reads probabilities either by `--read stated` (JSON chances summing to $100 \pm 5$, re-asked up to 3 times on malformed totals; 97 of 48,760 requests re-asked, 1 unanswered) or `--read tokens` (first-token logprobs over option letters).

### Commands & Reproduction
```bash
node --env-file=.env serve.mjs                                             # local server + Play UI at http://127.0.0.1:4330/
node analysis/models.mjs --scores --did                                    # model diagnostic scorecard + cross-model comparisons
node analysis/controls.mjs --answers                                       # paired comparisons one switch apart
node analysis/mix.mjs                                                      # group composition tables (k = 0..5, size, threshold)
node analysis/peers.mjs && node analysis/outcomes.mjs                      # peer-influence estimates and clustered intervals
node analysis/refusals.mjs                                                 # refusal and retry audit
node tools/site.mjs                                                        # build static site into _site/
node --test                                                                # run all 94 tests (no API key or network required)
```

### Repository Structure
| Path | Purpose |
| --- | --- |
| `engine/` | Loom environment, rules, weaving patterns, rendering (`flat`, `cloth`, `who`), and Jev client |
| `bench/` | `core.mjs` (deals, prompts, scoring, replay), `stats.mjs` (ANOVA split), `compare.mjs` (switch pairing), `mix.mjs` (composition), `peers.mjs`, `decisions.mjs`, `llm.mjs`, `solo.mjs`, `overview.mjs` |
| `analysis/` | Reproducible CLI scripts and JSON outputs for models, controls, composition, peer influence, refusals, and static docs (`report.py`, `design.py`) |
| `web/` | Browser UI (`index.mjs` + `story/*.mjs` for the Overview, `results.mjs`, `controls.mjs`, `mix.mjs`, `brief.mjs`, `peers.mjs`, `match.mjs`, `play.mjs`) |
| `runs/` | Recorded match logs, summaries (`index.json`), peer logs (`peers.json`), and thumbnails for all 93 runs |
| `tools/` | `run.mjs` (batch runner), `keep.mjs` (record indexer), `rethumb.mjs`, `site.mjs` (static site builder) |
