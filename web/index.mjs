// The Overview (the landing page): the benchmark's main results as a sequence of figures that move. A head with an
// abstract, then one scene for each result. In a scene the figure stays in view while the steps beside it are read;
// reaching a step moves the figure to that step's state. Every number, in the words and in the figures, comes from
// `api/overview.json` (bench/overview.mjs), which is computed from the run records.
//
// A scene's figure is a module, web/story/<id>.mjs, whose default export is `mount(stage, data, kit)`: it draws into
// `stage` and returns { step(i) }, where step(-1) is the empty figure and step(0) to step(n - 1) are its states. The
// words of every step are written here, so the figures hold no prose of their own.
//
// `?only=<id>&step=<n>` shows one scene's figure alone at one step, for checking it; `&still` turns motion off, and
// `&width=390` sets the page that many pixels wide, as on a phone (in a window narrow enough for the narrow layout).
import { h, getJSON, fmt, signed, qs, topbar, REPO } from './ui.mjs';
import * as kit from './story/kit.mjs';

// An address kept from when this was the Results page still opens the run it names.
if (qs('run')) window.location.replace(`results${window.location.search}`);

const main = document.querySelector('main.page');
// With motion off, nothing eases in CSS either.
if (kit.still) document.documentElement.classList.add('still');
const pc = x => `${fmt(x, 0)}%`, pc1 = x => `${fmt(x, 1)}%`, n1 = x => fmt(x, 1);
const ci = (e, unit = ' points') => `${signed(e.mean, 1)}${unit} [${fmt(e.lo, 1)}, ${fmt(e.hi, 1)}]`;
const brackets = e => `[${fmt(e.lo, 1)}, ${fmt(e.hi, 1)}]`;
const spansZero = e => e.lo <= 0 && e.hi >= 0;
const list = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : String(xs[0] ?? ''));
const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
const word = n => WORDS[n] ?? String(n);
const sweepOf = (d, system, added) => d.sweeps.find(s => s.system === system && s.added === added) ?? null;
const stepOf = (d, system, contrast) => d.steps.find(s => s.system === system && s.contrast === contrast) ?? null;
const cellOf = (d, system, key) => d.switches?.systems.find(s => s.system === system)?.cells.find(c => c.key === key) ?? null;
const level = (sweep, k) => sweep.levels.find(l => l.k === k);

/**
 * The scenes, in order. `needs` says whether the data for it is there; `steps` gives each step as [lead, words];
 * `caption` is what stands under the figure. The step states each figure must show are specified with these words:
 * step i of the figure is what step i of the words describes.
 */
const SCENES = [
  {
    id: 'loom', title: 'One loom, five agents, twenty-six rounds',
    needs: d => d.opening?.decision,
    steps: d => {
      const o = d.opening, f = o.seats.find(s => s.seat === o.focal), g = o.seats.find(s => s.objectiveKey === 'grow');
      const most = Math.max(...o.seats.map(s => s.share)) === f.share;
      return [
        ['The start', `Five agents sit side by side at one loom, each holding 20% of its width. Each receives a one-sentence persona (a disposition), and four of the five receive a one-sentence objective (what to achieve); the fifth has no objective and serves as the baseline. This is match ${o.seed} of the benchmark.`],
        ['A decision', `In every round, code lists an agent's legal actions: maintain position, claim share from a neighbour, concede share, or propose joint ownership. The model returns a probability for each option and one is sampled. This is ${o.decision.name}'s query in round ${o.decision.round}.`],
        ['Twenty-six rounds', 'Each round adds one row to the cloth, from the bottom up. The finished picture is a complete record of who held which part of the loom, and when.'],
        ['The result', `${f.name}, instructed to finish with less share than any other agent, finished with ${pc(f.share)}${most ? ', the largest share on the loom' : ''}.${g ? ` ${g.name}, instructed to finish with the most, held ${pc(g.share)}.` : ''} Each objective is scored from 0 to 100 on the final state, with a binary criterion for attainment.`],
      ];
    },
    caption: d => [`Match ${d.opening.seed} of the benchmark (run ${d.opening.run}, Jev), replayed from its record. Each colour is one agent's share of the loom; a band of two colours is a share two agents hold jointly. `,
      h('a', { href: d.opening.href }, 'Open this match'), ' to step through its rounds and queries.'],
  },
  {
    id: 'persona', title: 'Key Result 1 · Persona outweighs explicit instruction',
    needs: d => d.benchmark,
    steps: d => {
      const b = d.benchmark, ps = b.personas, by = key => ps.find(p => p.key === key);
      const lo = [...ps].sort((x, y) => x.none.mean - y.none.mean)[0], hi = [...ps].sort((x, y) => y.none.mean - x.none.mean)[0];
      const grew = ps.filter(p => p.grow.mean > p.none.mean).length, gave = ps.filter(p => p.give.mean < p.none.mean).length;
      const blunt = by('blunt'), warm = by('warm'), under = blunt ? ps.filter(p => p.key !== 'blunt' && p.grow.mean < blunt.give.mean).length : 0;
      const best = [...b.objectives].sort((x, y) => y.attained - x.attained)[0], worst = [...b.objectives].sort((x, y) => x.attained - y.attained)[0];
      const growObj = b.objectives.find(o => o.key === 'grow'), giveObj = b.objectives.find(o => o.key === 'give');
      const vNote = growObj?.split && giveObj?.split
        ? ` On Grow and Give, the persona accounts for ${pc(growObj.split.persona)} and ${pc(giveObj.split.persona)} of score variance, against ${pc(growObj.split.objective)} and ${pc(giveObj.split.objective)} for the objective itself.`
        : '';
      return [
        ['With no objective', `Across ${b.matches} matches, uninstructed agents did not end near their starting 20%. By persona alone, mean final share ran from ${pc(lo.none.mean)} (${lo.name.toLowerCase()}) to ${pc(hi.none.mean)} (${hi.name.toLowerCase()}).`],
        ['Told to grow', `Agents instructed to finish with the largest share ended with more for ${grew === ps.length ? 'every persona' : `${word(grew)} of the ${word(ps.length)} personas`}, but disposition set the ceiling${warm ? `: a warm agent told to maximise its share averaged only ${pc(warm.grow.mean)}` : ''}.`],
        ['Told to give', `Agents instructed to finish with the smallest share yielded ground for ${word(gave)} of the ${word(ps.length)} personas.${blunt ? ` Yet a blunt agent told to minimise its share still took ${pc(blunt.give.mean)} on average—more than ${word(under)} of the other ${word(ps.length - 1)} personas achieved when told to grow.` : ''}`],
        ['Persona explains 2–4× more share variance', `Agents given an objective attained it in ${pc(b.withObjective.rate)} of cases (${b.withObjective.attained} of ${b.withObjective.n}), against ${pc(b.baseline.rate)} for baseline agents.${vNote} ${best.name}${best.key === 'borrow' ? ', which concerns design rather than share,' : ''} was attained by ${best.attained} of ${best.n}; ${worst.name} by ${worst.attained} of ${worst.n}.`],
      ];
    },
    caption: d => [`Mean final share of the loom by persona under three assignments: no objective, Grow (maximise final share) and Give (minimise it). Run ${d.benchmark.run}, ${d.benchmark.matches} matches, four agents in each cell, one execution. The last step shows each objective's mean score against the baseline: agents with no objective, scored on the same rule. `,
      h('a', { href: 'results' }, 'Every match and the full table')],
  },
  {
    id: 'blunt', title: 'Key Result 2 · One adversarial agent reshapes a cooperative group',
    needs: d => d.blunt?.before && d.blunt?.after,
    steps: d => {
      const s = d.blunt, rose = s.pairs.filter(p => p.focal[1] > p.focal[0]).length;
      return [
        ['Five calm agents', `Every agent receives the same disposition: calm and relaxed, hard to upset, and even-tempered under stress. Nobody has an objective. Over ${s.seeds} matches they made ${s.claims.before ? `${n1(s.claims.before)} claims each` : 'no claims at all'}, and each finished at the 20% it started with.`],
        ['One sentence changed', `The seed, seats and starting designs are held fixed. One agent is told instead that it is blunt and hard-headed, suspicious of people's motives, and does not mind starting an argument. It made ${n1(s.claims.focal)} claims per match on average; the four calm neighbours made ${s.claims.others ? n1(s.claims.others) : 'none'}.`],
        ['Every match number', `The changed seat rose from ${pc1(s.focal.from)} as a calm agent to ${pc1(s.focal.to)} as a blunt one: a paired gain of ${ci(s.focal.change)}, increasing in ${rose === s.seeds ? `all ${s.seeds}` : `${rose} of ${s.seeds}`} match numbers.`],
        ['The other four absorb the loss', `The four unchanged calm agents fell from ${pc1(s.others.from)} each to ${pc1(s.others.to)}: ${ci(s.others.change)} per agent. That difference compares the two resulting matches as a whole, capturing everything set in motion by the single substitution.`],
      ];
    },
    caption: d => [`A group of five calm agents, and the same match numbers with one agent blunt (${d.blunt.systemName}; ${d.blunt.seeds} match numbers, each run executed once). The cloths are match number ${d.blunt.seed}. Intervals are Student-t 95% over match numbers. `,
      h('a', { href: 'brief' }, 'The brief on dispositions')],
  },
  {
    id: 'threshold', title: 'A 46% rule cap was hiding the ceiling: 64% for blunt, 89% for rude',
    needs: d => d.threshold?.gap && d.threshold.pictured?.rules && d.threshold.pictured.raised,
    steps: d => {
      const t = d.threshold, five = t.contrasts.filter(c => c.size === 5), of = name => five.find(c => c.added === name);
      const blunt = of('Blunt'), rude = of('Rude'), grow = of('Grow'), n = blunt.seeds.length;
      const out = [
        ['Capped at 46% by the rules', `The engine stops offering an agent further claims once it holds ${pc(t.rules)} of the loom. With one blunt agent in a calm group, that agent hit ${pc(t.rules - 1)} or more in ${blunt.rules.atThreshold} of ${n} match numbers; a rude agent hit it in ${rude.rules.atThreshold} of ${rude.seeds.length}.`],
        ['Under the cap, blunt and rude look alike', `At the ${pc(t.rules)} threshold, the blunt agent averaged ${pc1(blunt.rules.mean)} and the rude agent ${pc1(rude.rules.mean)}: a difference of only ${ci(t.gap.rules)}${spansZero(t.gap.rules) ? ', whose interval includes zero' : ''}.`],
        [`Uncapped at ${pc(t.raised)}, dispositions separate sharply`, `Re-running the same match numbers with claims offered up to ${pc(t.raised)} of the loom lifted the blunt agent to ${pc1(blunt.raised.mean)} and the rude agent to ${pc1(rude.raised.mean)}—separating the two dispositions by ${ci(t.gap.raised)}.`],
      ];
      if (grow) out.push(['An objective alone did not exploit the raised cap', `An unpersonied agent told to grow, placed among four agents with no persona and no objective, finished with ${pc1(grow.raised.mean)} at the ${pc(t.raised)} threshold against ${pc1(grow.rules.mean)} at ${pc(t.rules)}: ${ci(grow.difference)}${spansZero(grow.difference) ? ', an inconclusive change' : ''}, as neutral neighbours refused ${n1(grow.refusalsOthers)} times each.`]);
      const both = blunt.seeds.find(p => p.seed === t.pictured.seed);
      out.push(['One match, both ways', `Match number ${t.pictured.seed}, with the same blunt agent in the same seat: ${pc(both.rules)} under the ${pc(t.rules)} threshold, and ${pc(both.raised)} with the threshold raised to ${pc(t.raised)}.`]);
      return out;
    },
    caption: d => [`The focal agent's final share in each of ${d.threshold.contrasts[0].seeds.length} match numbers, at the rules' claim threshold (${pc(d.threshold.rules)}) and with it raised to ${pc(d.threshold.raised)} (Jev, five agents; each run executed once). Differences are paired by match number. `,
      h('a', { href: 'brief' }, 'The threshold by group size')],
  },
  {
    id: 'sweep', title: 'As aggressive agents multiply, per-agent share falls and joint ownership collapses',
    needs: d => sweepOf(d, 'jev', 'Blunt')?.levels.length > 3,
    steps: d => {
      const a = sweepOf(d, 'jev', 'Blunt'), b = sweepOf(d, 'gptd', 'Greedy'), ks = a.levels.filter(l => l.second !== null), mixed = a.levels.filter(l => l.k >= 2 && l.first !== null);
      const k0 = level(a, 0), k1 = level(a, 1), kn = a.levels.at(-1);
      const out = [
        ['From none to five', `The same match numbers were run with ${list(ks.map(l => word(l.k)))} of the five seats given to blunt agents. The pictures show one seed across all six compositions (k = 0 to 5).`],
        ['Competition dilutes each blunt agent\'s gain', `A single blunt agent averaged ${pc1(k1.second)}. With ${list(ks.slice(1).map(l => word(l.k)))} blunt agents competing on the same loom, each averaged ${list(ks.slice(1).map(l => pc1(l.second)))}.`],
        ['Remaining calm agents are squeezed out', `Each calm agent averaged ${pc1(k1.first)} beside one blunt agent, and only ${pc1(Math.min(...mixed.map(l => l.first)))} to ${pc1(Math.max(...mixed.map(l => l.first)))} once ${word(mixed[0].k)} to ${word(mixed.at(-1).k)} seats were blunt.`],
        ['Five alike do not end equal', `Five blunt agents averaged ${pc(kn.second)} each, just as five calm agents did—but with a within-match share dispersion of ${n1(kn.dispersion)} points against ${n1(k0.dispersion)}, and a largest share averaging ${pc1(kn.largest)}.`],
      ];
      if (b) {
        const rest = b.levels.filter(l => l.k >= 3);
        out.push(['Two greedy agents collapse joint ownership', `Under OpenAI's decision model, five cooperative agents ended with ${pc1(level(b, 0).joint)} of the loom held jointly. Adding one greedy agent cut joint holding to ${pc1(level(b, 1).joint)}, adding two cut it to ${pc1(level(b, 2).joint)}, and with three or more ${Math.max(...rest.map(l => l.joint)) < 1 ? 'next to none remained' : `at most ${pc1(Math.max(...rest.map(l => l.joint)))} remained`}.`]);
      }
      return out;
    },
    caption: d => [`Mean final share of one agent of each type, by the number of agents of the second type (k). Match numbers: ${level(sweepOf(d, 'jev', 'Blunt'), 0).matches} at k = 0 and 1, ${level(sweepOf(d, 'jev', 'Blunt'), 2).matches} from k = 2; each composition executed once. A share is what an agent holds alone; a part held jointly counts for neither holder. `,
      h('a', { href: 'mix' }, 'Every composition side by side')],
  },
  {
    id: 'peers', title: 'Key Result 3 · One neighbour sentence shifts choices by +28 pp—unless the receiver is blunt',
    needs: d => d.peers?.example,
    steps: d => {
      const p = d.peers, x = p.example, said = x.options.find(o => o.advocated), blunt = p.receivers.find(r => r.key === 'blunt'), others = p.receivers.filter(r => r.key !== 'blunt');
      const out = [
        ['Randomised within-match control', 'Before each action an agent is queried for its prior distribution, then queried a second time. In a randomised 75% of decisions the second query carries one sentence stating the action an adjacent agent would have it take (treatment); in the remaining 25% the query is repeated unchanged (control).'],
        ['A single decision', `${x.receiver}'s prior probability of the action ${x.sender} advocated was ${pc(said.prior)}. After hearing the one-sentence request, it rose to ${pc(said.posterior)}: an influence of ${signed(x.influence, 0)} percentage points.`],
        ['+27.9 points across discordant decisions', `In ${p.discordant.toLocaleString('en')} decisions where the sender advocated an action other than the receiver's prior favourite, the message raised the advocated action's probability by ${n1(p.effect.mean)} points ${brackets(p.effect)} relative to the repeated query (${n1(p.control.influence.mean)} ${brackets(p.control.influence)}).`],
        ['Flips the modal choice 46% of the time', `The advocated action became the receiver's top choice in ${pc(p.treatment.adoption.mean)} of discordant treatment decisions, against ${pc(p.control.adoption.mean)} when the query was merely repeated.`],
      ];
      if (blunt) {
        out.push(['Blunt receivers resist and push back', `Across ${word(others.length)} of the ${word(p.receivers.length)} personas, mean influence ran from ${fmt(Math.min(...others.map(r => r.influence.mean)), 0)} to ${fmt(Math.max(...others.map(r => r.influence.mean)), 0)} points. Blunt receivers showed ${spansZero(blunt.influence) ? 'no net shift' : 'a shift of'} (${ci(blunt.influence)}) and exhibited reactance—moving more than 5 points away from the request—in ${pc(blunt.reactance)} of decisions.`]);
      }
      return out;
    },
    caption: d => [`Peer communication: ${d.peers.decisions.toLocaleString('en')} decisions from two runs of the same ${d.peers.designs} match designs. Influence is the posterior minus the prior probability of the advocated action, in percentage points. Intervals are clustered by match design (by receiving agent for personas), which are descriptive subgroups. `,
      h('a', { href: 'report' }, 'The report'), ' has the method and its limits.'],
  },
  {
    id: 'switches', title: 'Benchmarking models I · A ~50% default score hides opposite failure modes across switches',
    needs: d => cellOf(d, 'jev', 'default') && cellOf(d, 'chance', 'default'),
    steps: d => {
      const c = (system, key) => cellOf(d, system, key), jev = c('jev', 'default'), again = c('jev', 'again'), has = system => c(system, 'default');
      const out = [['Default group run: model vs. chance', `On the 11 match designs run across every condition (${jev.n} agents with an objective), Jev attained ${pc(jev.rate)} (${jev.attained} of ${jev.n}), against ${pc(c('chance', 'default').rate)} when actions are sampled uniformly at random.`]];
      if (again) out.push(['Run-to-run variation at n = 11', `A second execution of Jev's default, with nothing changed, attained ${pc(again.rate)} (${fmt(Math.abs(again.difference.mean), 0)} points ${again.difference.mean >= 0 ? 'higher' : 'lower'} on these 11 designs; 4.5 points across 22 designs): the yardstick for single-run contrasts at this sample size.`]);
      if (c('jev', 'personaOff') && c('jev', 'solo')) {
        const pOff = c('jev', 'personaOff'), solo = c('jev', 'solo');
        out.push(['Isolating persona drift and opposition', `Switching personas off lifts Jev by ${signed(pOff.rate - jev.rate, 0)} points to ${pc(pOff.rate)}. Running solo among passive neighbours lifts it to ${pc(solo.rate)}${c('jev', 'soloRefuse') ? ` (${pc(c('jev', 'soloRefuse').rate)} when neighbours refuse)` : ''}.${c('chance', 'solo') ? ` Uniform random reaches ${pc(c('chance', 'solo').rate)} in solo.` : ''} Jev's default score is held down by persona hijack and peer competition, not inability to execute the goals.`]);
      }
      if (has('gptd') && has('gptc')) {
        const gd = c('gptd', 'default'), gc = c('gptc', 'default'), gdOff = c('gptd', 'personaOff'), gcOff = c('gptc', 'personaOff');
        const gdSolo = c('gptd', 'solo'), gcSolo = c('gptc', 'solo'), locSolo = c('local', 'solo');
        const gdHold = gdSolo?.scores?.hold, gcGive = gcSolo?.scores?.give, locGrow = locSolo?.scores?.grow;
        out.push(['How the switches separate models that tie in the default',
          `In the default run, Jev (${pc(jev.rate)}), GPT Decisions (${pc(gd.rate)}) and GPT Chat (${pc(gc.rate)}) look almost tied. The switches expose opposite failure modes: removing personas lifts Jev to ${pc(c('jev', 'personaOff').rate)} and GPT Chat to ${pc(gcOff.rate)}, while GPT Decisions stays at ${pc(gdOff.rate)}. `
          + `Solo, Jev reaches ${pc(c('jev', 'solo').rate)} across all four objectives; GPT Decisions (${pc(gdSolo.rate)}) fails Hold${gdHold ? ` (${gdHold.attained} of ${gdHold.n}, score ${fmt(gdHold.score)})` : ''}, `
          + `GPT Chat (${pc(gcSolo.rate)}) fails Give${gcGive ? ` (${gcGive.attained} of ${gcGive.n}, score ${fmt(gcGive.score)})` : ''}`
          + `${locSolo ? `, and medgemma:4b (${pc(locSolo.rate)}) fails Grow${locGrow ? ` (${locGrow.attained} of ${locGrow.n}, score ${fmt(locGrow.score)})` : ''}` : ''}.`]);
      }
      return out;
    },
    caption: d => [`Attainment rate: the share of agents given an objective that met its criterion, on match designs 1 to ${d.switches.designs}, under each switch and each decision system. Hover a mark for its per-objective breakdown (Grow, Give, Hold, Borrow). `,
      h('a', { href: 'controls' }, 'Every pair of runs one switch apart')],
  },
  {
    id: 'systems', title: 'Benchmarking models II · Identical share shifts hide different action biases and failure on Give',
    needs: d => d.systems?.rows.length > 1,
    steps: d => {
      const y = d.systems, [jev, ...rest] = y.rows, give = [stepOf(d, 'jev', 'No objective → Give'), stepOf(d, 'gptd', 'No objective → Give')];
      const zero = y.versus.every(v => spansZero(v.focal));
      const out = [
        ['Same composition shift across three systems', `The step from five calm agents to one blunt agent was run under ${word(y.rows.length)} decision systems on the same ${y.seeds} match numbers: Jev, OpenAI's Decisions API, and the same OpenAI model via chat. The blunt seat's share rose by ${list(y.rows.map(r => n1(r.focal.mean)))} points.`],
        ['No clear difference in final share', `Paired by match number, the differences from Jev in the blunt agent's gain were ${list(y.versus.map(v => ci(v.focal)))}.${zero ? ' Both intervals span zero.' : ''}`],
        ['Different underlying action rates', `To reach the same share, the blunt agent made ${n1(jev.claims.mean)} claims per match under Jev versus ${list(rest.map(r => n1(r.claims.mean)))} under the GPT systems, while calm neighbours recorded ${jev.refusals.mean ? n1(jev.refusals.mean) : 'no'} refusals under Jev versus ${list(rest.map(r => n1(r.refusals.mean)))} each under GPT.`],
        ['Baseline restlessness in the all-calm group', `Under Jev, five calm agents were completely still (${jev.baseClaims.mean ? `${n1(jev.baseClaims.mean)} claims` : '0 claims'}, ${jev.baseJoint.mean ? pc1(jev.baseJoint.mean) : '0%'} joint ownership). Under the GPT systems they churned the loom with ${list(rest.map(r => n1(r.baseClaims.mean)))} claims per agent and ${list(rest.map(r => pc1(r.baseJoint.mean)))} ending in joint ownership.`],
      ];
      if (give[0] && give[1]) {
        const met = s => `${s.pairs.filter(p => p.met).length} of ${s.seeds}`;
        out.push(['Why baseline churn matters: single-agent Give', `With no personas, a single agent told to minimise its share among four uninstructed neighbours dropped to ${pc1(give[0].focal.to)} under Jev, meeting the Give criterion in ${met(give[0])} seeds. Under OpenAI's decision model—where uninstructed neighbours also concede and claim—it ended at ${pc1(give[1].focal.to)} and met the criterion in only ${met(give[1])}.`]);
      }
      return out;
    },
    caption: d => [`One contrast (${d.systems.contrast.toLowerCase()}) under each decision system on the same ${d.systems.seeds} match numbers. Means with Student-t 95% intervals over match numbers; differences between systems are paired. `,
      h('a', { href: 'brief' }, 'The systems set against each other')],
  },
];

const LIMITS = d => [
  ['One execution of most conditions.', `${cellOf(d, 'jev', 'again') ? `Two executions of Jev's default differed by ${fmt(Math.abs(cellOf(d, 'jev', 'again').difference.mean), 0)} points of attainment on ${d.switches.designs} match designs (and 4.5 points across 22 designs). ` : ''}Most conditions were run once, so their run-to-run variation is unmeasured; the intervals describe variation over match numbers.`],
  ['Small samples.', 'Ten or eleven match numbers for most comparisons, five for a composition with two or more agents changed, and four agents in each cell of persona by objective.'],
  ['One wording.', 'Each persona and each objective is a single sentence. Nothing here isolates what in a sentence matters.'],
  ['Scores are ranks among five seats.', 'They are interdependent within a match, and a difference for the agents left unchanged includes everything that followed from the change.'],
  ['Systems, not models alone.', 'A comparison between decision systems compares a model together with its interface and the way its probabilities are read.'],
  ['This task.', 'The results concern this task and its rules, including the claim threshold, and these systems.'],
];

const ONWARD = [
  ['results', 'Results', 'The 44-match benchmark: objective scores, variance split, persona × objective heatmap.'],
  ['controls', 'Controls & Models', 'The seven switches, the model diagnostic table, and paired switch comparisons.'],
  ['mix', 'Composition', 'Groups of one type with one to five seats given to another, side by side.'],
  ['brief', 'Briefs (1-page)', 'Printable A4 summaries for dispositions (/brief) and objectives (/brief-objective).'],
  ['peers', 'Peer influence', 'Interactive explorer of the 5,436 peer-communication decisions.'],
  ['report', 'Peer Report', 'The peer-influence study written up as a short paper with clustered intervals.'],
  ['design', 'Design', 'System specification: every model call in a round, schemas, records and replay.'],
  ['play', 'Play', 'Set the switches, assign personas and objectives, and run a live match.'],
];

/** The tallest a figure's drawing may be, so that the whole figure fits in view while it is pinned. */
const tallest = () => (window.matchMedia('(max-width: 899px)').matches
  ? Math.round(Math.min(420, Math.max(250, window.innerHeight * 0.56 - 78)))
  : Math.round(Math.min(560, Math.max(300, window.innerHeight - 250))));

/** One scene: its head, its figure (mounted from its module) and its steps. Returns { el, go(i), steps, resize() }. */
async function sceneOf(def, number, d) {
  const steps = def.steps(d), body = h('div', { class: 'fig-body' });
  let scene = null, current = 0, width = 0;
  const stepEls = steps.map(([lead, words], i) => h('div', { class: i === 0 ? 'step on' : 'step', dataset: { step: String(i) } },
    h('p', null, h('span', { class: 'n' }, `${number}.${i + 1}`), h('span', { class: 'lead' }, lead), words)));
  const dots = steps.map((_, i) => h('button', { type: 'button', 'aria-label': `Step ${i + 1} of ${steps.length}: ${steps[i][0]}`, 'aria-current': i === 0 ? 'step' : false,
    onclick: () => { if (main.classList.contains('alone')) go(i); else stepEls[i].scrollIntoView({ behavior: kit.still ? 'auto' : 'smooth', block: 'center' }); } }));
  const failed = e => { scene = null; body.replaceChildren(h('p', { class: 'fig-failed' }, `This figure could not be drawn: ${e.message}.`)); };
  const show = (i, motion = true) => { if (!scene) return; try { if (motion) scene.step(i); else kit.instant(() => scene.step(i)); } catch (e) { failed(e); } };
  function go(i, { replay = false } = {}) {
    if (replay || i !== current) {
      // A step played again starts from the one before it.
      if (replay) show(i - 1, false);
      show(i);
    }
    current = i;
    stepEls.forEach((el, k) => el.classList.toggle('on', k === i));
    dots.forEach((b, k) => { if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  }
  const caption = () => [h('b', null, `Figure ${number}. `), ...def.caption(d)];
  const el = h('section', { class: 'scene', id: def.id },
    h('header', { class: 'scene-head' }, h('p', { class: 'kicker' }, `Part ${number}`), h('h2', null, def.title)),
    h('div', { class: 'scrolly' },
      h('div', { class: 'stage' }, h('figure', { class: 'fig' },
        h('div', { class: 'fig-bar' }, h('span', { class: 'fig-num' }, `Figure ${number}`), h('ol', { class: 'fig-dots' }, dots.map(b => h('li', null, b))),
          h('button', { type: 'button', class: 'replay', onclick: () => go(current, { replay: true }) }, 'Replay')),
        body, h('figcaption', null, caption()))),
      h('div', { class: 'steps' }, stepEls)),
    h('p', { class: 'scene-cap' }, caption()));
  let mount = null;
  try { mount = (await import(`./story/${def.id}.mjs`)).default; } catch (e) { failed(e); }
  /** Draws the figure afresh at the width it now has, in the state it was in. */
  function draw() {
    if (!mount) return;
    body.replaceChildren();
    body.dataset.tallest = String(tallest());
    width = body.clientWidth;
    try { scene = mount(body, d, kit); } catch (e) { failed(e); return; }
    show(current, false);
  }
  return { el, go, steps: stepEls, stage: body, draw, resize() { if (Math.abs(body.clientWidth - width) > 8) draw(); }, current: () => current };
}

/** The head: the title, the abstract, and four headline figures of the benchmark, each linking to its scene. */
function head(d, scenes) {
  const b = d.benchmark, jevDef = cellOf(d, 'jev', 'default'), jevOff = cellOf(d, 'jev', 'personaOff'), jevSolo = cellOf(d, 'jev', 'solo');
  const growS = b?.objectives.find(o => o.key === 'grow')?.split, giveS = b?.objectives.find(o => o.key === 'give')?.split;
  const pLo = growS && giveS ? fmt(Math.min(growS.persona, giveS.persona), 0) : null, pHi = growS && giveS ? fmt(Math.max(growS.persona, giveS.persona), 0) : null;
  const oLo = growS && giveS ? fmt(Math.min(growS.objective, giveS.objective), 0) : null, oHi = growS && giveS ? fmt(Math.max(growS.objective, giveS.objective), 0) : null;
  const rude90 = d.threshold?.contrasts.find(c => c.size === 5 && c.added === 'Rude')?.raised.mean;
  const facts = [
    b ? ['persona', pLo && pHi ? `${pLo}–${pHi}%` : pc(b.withObjective.rate), '',
      pLo && pHi ? `of Grow and Give score variance comes from the persona (vs ${oLo}–${oHi}% from the objective); overall attainment is ${pc(b.withObjective.rate)} vs ${pc(b.baseline.rate)} baseline.`
        : `of agents given an objective attained it (${b.withObjective.attained} of ${b.withObjective.n}), against ${pc(b.baseline.rate)} baseline.`] : null,
    d.blunt ? ['blunt', signed(d.blunt.focal.change.mean, 1), 'pp',
      `gain in final share when 1 of 5 calm agents is made blunt ${brackets(d.blunt.focal.change)}${rude90 ? `—reaching ${pc1(rude90)} for a rude agent when the 46% rule cap is lifted` : ''}.`] : null,
    d.peers ? ['peers', signed(d.peers.effect.mean, 1), 'pp',
      `shift in action probability after one sentence from a neighbour ${brackets(d.peers.effect)}, flipping the modal choice in ${pc(d.peers.treatment.adoption.mean)} of discordant decisions.`] : null,
    jevSolo && jevOff && jevDef ? ['switches', `${pc(jevSolo.rate)} → ${pc(jevDef.rate)}`, '',
      `how switches diagnose models: Jev attains ${pc(jevSolo.rate)} solo and ${pc(jevOff.rate)} without personas, dropping to ${pc(jevDef.rate)} when personas are dealt.`] : null,
  ].filter(f => f && scenes.some(s => s.def.id === f[0]));
  return h('header', { class: 'story-head' },
    h('div', { class: 'story-title' }, h('div', null,
    h('p', { class: 'kicker' }, 'LoomBench · a multi-agent benchmark'),
    h('h1', null, 'Five agents, one loom'),
    h('p', { class: 'abstract' }, 'Five LLM agents share a 100-unit loom over 26 rounds. Each receives a one-sentence ',
      h('b', null, 'persona'), ' (a disposition) and a one-sentence ', h('b', null, 'objective'), ' (what to achieve). Three empirical findings stand out: ',
      h('b', null, 'personas outweigh explicit instructions'), ' on contested share; ',
      h('b', null, 'one adversarial agent reshapes a cooperative group'), ' up to the environment\'s claim cap; and ',
      h('b', null, 'one sentence from a neighbour shifts action probabilities by +28 percentage points'), ' unless the receiver is blunt or has a stake. ',
      'As a ', h('b', null, 'model benchmark'), ', LoomBench uses controlled switches (solo, personas off, objectives off, composition) to decompose an aggregate score into unopposed agency, persona drift, baseline restraint and social robustness.'),
    h('p', { class: 'byline' }, `Every number and figure is computed live from the records of ${d.runs} runs. `, h('a', { href: '#scorecard' }, 'Model scorecard'), ' · ', h('a', { href: REPO }, 'Code and data'))),
    d.opening ? cloth(d.opening) : null),
    facts.length ? h('div', { class: 'facts' }, facts.map(([id, value, unit, label]) => h('a', { class: 'fact', href: `#${id}` },
      h('span', { class: 'value' }, value, unit ? h('small', null, unit) : null), h('span', { class: 'label' }, label)))) : null,
    h('ol', { class: 'toc' }, scenes.map((s, i) => h('li', null, h('a', { href: `#${s.def.id}` }, h('span', { class: 'n' }, String(i + 1)), s.def.title)))));
}

/** Beside the title, one match weaving itself: the cloth of the match the first figure goes through, with no words on it. */
function cloth(timeline) {
  const W = 300, H = 380, g = kit.svg('g'), woven = kit.loom(g, timeline, { x: 0, y: 0, w: W, h: H, labels: 'none' });
  const el = h('a', { class: 'story-cloth', href: '#loom', 'aria-label': `Match ${timeline.seed} of the benchmark, woven round by round: the first figure goes through it` },
    kit.svg('svg', { class: 'story-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, g),
    h('span', { class: 'story-cloth-cap' }, `Match ${timeline.seed}, as it was woven: one row a round, each colour an agent's share.`));
  woven.show(woven.rounds, { duration: 7000, delay: 500, ease: kit.EASE.linear });
  return el;
}

/**
 * The Model Benchmark Scorecard: how the controlled switches on designs 1–11 (and composition on seeds 1–10) separate
 * models that look nearly tied on default attainment alone. Every cell is computed from `d.switches` and `d.systems`.
 */
function scorecard(d) {
  if (!d.switches?.systems?.length) return null;
  const sysRows = new Map((d.systems?.rows ?? []).map(r => [r.system, r]));
  const noteFor = (s, def, pOff, solo) => {
    if (s.system === 'chance') return 'Reference floor: no model queried; 30% group attainment, 43% solo.';
    const sc = solo?.scores, weak = sc ? [['Grow', sc.grow], ['Give', sc.give], ['Hold', sc.hold], ['Borrow', sc.borrow]].filter(([, v]) => v).sort((a, b) => a[1].score - b[1].score)[0] : null;
    const drift = def && pOff ? def.rate - pOff.rate : null;
    const parts = [];
    if (solo && weak && weak[1].score < 60) parts.push(`Fails ${weak[0]} even when solo (${fmt(weak[1].score)}, ${weak[1].attained}/${weak[1].n})`);
    else if (solo && solo.rate >= 85) parts.push(`High unopposed agency across all four goals (${pc(solo.rate)} solo)`);
    if (drift !== null && drift <= -20) parts.push(`strong persona drift (${signed(drift, 0)} pp vs personas off)`);
    else if (drift !== null && Math.abs(drift) < 5) parts.push('unaffected by removing personas (0 pp drift)');
    const sr = sysRows.get(s.system);
    if (sr) parts.push(sr.baseClaims.mean === 0 ? 'still when calm (0.0 claims)' : `restless when calm (${n1(sr.baseClaims.mean)} claims/agent, ${pc1(sr.baseJoint.mean)} joint)`);
    return parts.length ? `${parts.join('; ')}.` : s.about;
  };
  return h('section', { class: 'story-bench', id: 'scorecard' },
    h('p', { class: 'kicker' }, 'How to evaluate a model on LoomBench'),
    h('h2', null, 'Model diagnostic scorecard'),
    h('p', { class: 'sub' },
      `In the default five-agent run on match designs 1–${d.switches.designs}, capable systems cluster near 41–50% attainment. `
      + 'Running the same designs across three diagnostic switches—personas off (pure multi-agent steerability), solo (unopposed agency by objective), '
      + 'and objectives off / calm composition (baseline action bias)—exposes distinct capability profiles.'),
    h('div', { class: 'scroll' }, h('table', { class: 'grid' },
      h('thead', null, h('tr', null,
        h('th', null, 'Decision system'),
        h('th', { class: 'num' }, 'Default (5 agents)'),
        h('th', { class: 'num' }, 'Personas off'),
        h('th', { class: 'num' }, 'Persona drift'),
        h('th', { class: 'num' }, 'Solo (unopposed)'),
        h('th', { class: 'num' }, 'Solo profile: Grow / Give / Hold / Borrow'),
        h('th', { class: 'num' }, 'Uninstructed claims/agent'),
        h('th', null, 'Diagnostic signature'))),
      h('tbody', null, d.switches.systems.map(s => {
        const cell = k => s.cells.find(c => c.key === k) ?? null;
        const def = cell('default'), pOff = cell('personaOff'), solo = cell('solo');
        const drift = def && pOff ? signed(def.rate - pOff.rate, 0) + ' pp' : '–';
        const prof = solo?.scores ? ['grow', 'give', 'hold', 'borrow'].map(k => (solo.scores[k] ? fmt(solo.scores[k].score, 0) : '–')).join(' / ') : '–';
        return h('tr', null,
          h('td', null, h('b', null, s.name), h('div', { class: 'small muted' }, s.about)),
          h('td', { class: 'num' }, def ? `${pc(def.rate)} (${def.attained}/${def.n})` : '–'),
          h('td', { class: 'num' }, pOff ? `${pc(pOff.rate)} (${pOff.attained}/${pOff.n})` : '–'),
          h('td', { class: 'num' }, drift),
          h('td', { class: 'num' }, solo ? `${pc(solo.rate)} (${solo.attained}/${solo.n})` : '–'),
          h('td', { class: 'num' }, prof),
          h('td', { class: 'num' }, s.objectiveOff ? n1(s.objectiveOff.claims) : '–'),
          h('td', null, noteFor(s, def, pOff, solo)));
      })))),
    h('pre', { class: 'cmd' },
      '# Run the 4-part diagnostic suite on any model (11 match designs, ~$0.25–$0.50) and print the scorecard:\n'
      + 'node --env-file=.env tools/run.mjs --model <provider>:<model> --matches 1-11 --run mymodel\n'
      + 'node --env-file=.env tools/run.mjs --model <provider>:<model> --matches 1-11 --persona off --run mymodel-persona-off\n'
      + 'node --env-file=.env tools/run.mjs --model <provider>:<model> --matches 1-11 --solo --run mymodel-solo\n'
      + 'node --env-file=.env tools/run.mjs --model <provider>:<model> --matches 1-11 --objective off --run mymodel-objective-off\n'
      + 'node analysis/models.mjs --scores --did'));
}

/** The end: what limits the results, and where each part is in full. */
function end(d) {
  return h('section', { class: 'story-end' },
    h('h2', null, 'Limitations'),
    h('ul', { class: 'limits' }, LIMITS(d).map(([lead, words]) => h('li', null, h('b', null, `${lead} `), words))),
    h('div', { class: 'onward' }, ONWARD.map(([href, name, words]) => h('a', { href }, h('b', null, name), h('span', null, words)))));
}

/** Follows the reader: the step crossing a line across the view becomes its scene's current step, and a figure plays when it first comes into view. */
function follow(scenes) {
  const narrow = window.matchMedia('(max-width: 899px)').matches, line = narrow ? 82 : 50;
  const stepOwner = new Map(scenes.flatMap(s => s.steps.map((el, i) => [el, [s, i]])));
  const steps = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { const [s, i] = stepOwner.get(e.target); s.go(i); }
  }, { rootMargin: `-${line}% 0px -${100 - line}% 0px` });
  for (const el of stepOwner.keys()) steps.observe(el);
  const seen = new Set(), stages = new IntersectionObserver(entries => {
    for (const e of entries) {
      const s = scenes.find(x => x.stage === e.target);
      if (e.isIntersecting && s && !seen.has(s)) { seen.add(s); s.go(s.current(), { replay: true }); }
    }
  }, { threshold: 0.4 });
  for (const s of scenes) stages.observe(s.stage);
  let timer = 0;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => scenes.forEach(s => s.resize()), 180); });
}

async function start() {
  const d = await getJSON('api/overview.json'), only = qs('only');
  if (Number(qs('width'))) Object.assign(main.style, { maxWidth: `${Number(qs('width'))}px`, margin: '0' });
  const defs = SCENES.filter(s => (only ? s.id === only : true) && s.needs(d));
  const scenes = [];
  for (const def of defs) scenes.push({ def, ...await sceneOf(def, SCENES.indexOf(def) + 1, d) });
  if (only) {
    // One figure alone, at the step the address names.
    main.classList.add('alone');
    main.replaceChildren(...scenes.map(s => s.el));
    for (const s of scenes) { s.draw(); const i = Math.min(s.steps.length - 1, Math.max(0, Number(qs('step')) || 0)); s.go(i, { replay: true }); }
    document.body.dataset.ready = 'true';
    return;
  }
  main.replaceChildren(topbar('overview'), head(d, scenes), ...scenes.map(s => s.el), scorecard(d), end(d));
  for (const s of scenes) s.draw();
  follow(scenes);
  document.body.dataset.ready = 'true';
}

start().catch(e => main.replaceChildren(topbar('overview'), h('h1', null, 'LoomBench'), h('p', { class: 'lede' }, `The page could not be drawn: ${e.message}.`)));
