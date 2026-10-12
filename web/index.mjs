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
        ['The start', `Five agents sit side by side at one loom, and each holds 20% of its width. Each is told one sentence describing a disposition, its persona. Four of the five are also told one sentence stating what to achieve, an objective. This is match ${o.seed} of the benchmark.`],
        ['A decision', `In every round, code lists an agent's legal actions: maintain position, claim share from a neighbour, concede share to one, or propose joint ownership. The model returns a probability for each option and one is sampled. This is ${o.decision.name}'s query in round ${o.decision.round}.`],
        ['Twenty-six rounds', 'Each round adds one row to the cloth, from the bottom up. The finished picture is therefore a record of who held which part of the loom, and when.'],
        ['The result', `${f.name}, told to finish with less than any other agent, finished with ${pc(f.share)}${most ? ', the largest share' : ''}.${g ? ` ${g.name}, told to finish with more than any other, held ${pc(g.share)}.` : ''} Each objective is scored from this final state: an objective score from 0 to 100, and a criterion that is attained or not.`],
      ];
    },
    caption: d => [`Match ${d.opening.seed} of the benchmark (run ${d.opening.run}, Jev), replayed from its record. Each colour is one agent's share of the loom; a band of two colours is a share two agents hold jointly. `,
      h('a', { href: d.opening.href }, 'Open this match'), ' to step through its rounds and queries.'],
  },
  {
    id: 'persona', title: 'A persona can outweigh an objective',
    needs: d => d.benchmark,
    steps: d => {
      const b = d.benchmark, ps = b.personas, by = key => ps.find(p => p.key === key);
      const lo = [...ps].sort((x, y) => x.none.mean - y.none.mean)[0], hi = [...ps].sort((x, y) => y.none.mean - x.none.mean)[0];
      const grew = ps.filter(p => p.grow.mean > p.none.mean).length, gave = ps.filter(p => p.give.mean < p.none.mean).length;
      const blunt = by('blunt'), warm = by('warm'), under = blunt ? ps.filter(p => p.key !== 'blunt' && p.grow.mean < blunt.give.mean).length : 0;
      const best = [...b.objectives].sort((x, y) => y.attained - x.attained)[0], worst = [...b.objectives].sort((x, y) => x.attained - y.attained)[0];
      return [
        ['With no objective', `Across ${b.matches} matches, agents given no objective did not end with equal shares. By persona, their mean final share ran from ${pc(lo.none.mean)} (${lo.name.toLowerCase()}) to ${pc(hi.none.mean)} (${hi.name.toLowerCase()}). An equal share is 20%.`],
        ['Told to grow', `Agents told to finish with the largest share ended with more, for ${grew === ps.length ? 'every persona' : `${word(grew)} of the ${word(ps.length)} personas`}. The gain was uneven${warm ? `: a warm agent told to maximise its share ended with ${pc(warm.grow.mean)} on average` : ''}.`],
        ['Told to give', `Agents told to finish with the smallest share ended with less for ${word(gave)} of the ${word(ps.length)} personas.${blunt ? ` A blunt agent told to minimise its share still ended with ${pc(blunt.give.mean)} on average: more than ${word(under)} of the other ${word(ps.length - 1)} personas held when told to grow.` : ''}`],
        ['How often an objective was attained', `Agents given an objective attained it in ${pc(b.withObjective.rate)} of cases (${b.withObjective.attained} of ${b.withObjective.n}). Agents given none met the same criteria in ${pc(b.baseline.rate)}. ${best.name}${best.key === 'borrow' ? ', which concerns designs and not share,' : ''} was attained by ${best.attained} of ${best.n}; ${worst.name} by ${worst.attained} of ${worst.n}.`],
      ];
    },
    caption: d => [`Mean final share of the loom by persona under three assignments: no objective, Grow (maximise final share) and Give (minimise it). Run ${d.benchmark.run}, ${d.benchmark.matches} matches, four agents in each cell, one execution. The last step shows each objective's mean score against the baseline: agents with no objective, scored on the same rule. `,
      h('a', { href: 'results' }, 'Every match and the full table')],
  },
  {
    id: 'blunt', title: 'Change one agent, and the whole allocation moves',
    needs: d => d.blunt?.before && d.blunt?.after,
    steps: d => {
      const s = d.blunt, rose = s.pairs.filter(p => p.focal[1] > p.focal[0]).length;
      return [
        ['Five calm agents', `Every agent is told the same sentence: that it is calm and relaxed, hard to upset, and keeps an even mood under stress. Nobody has an objective. Over ${s.seeds} matches they made ${s.claims.before ? `${n1(s.claims.before)} claims each` : 'no claims'}, and each ended close to the 20% it started with.`],
        ['The same match, one sentence changed', `The seed, the seats and the starting designs are the same. One agent is told instead that it is blunt and hard-headed, suspicious of people's motives, and does not mind starting an argument. It made ${n1(s.claims.focal)} claims a match on average; the calm agents made ${s.claims.others ? n1(s.claims.others) : 'none'}.`],
        ['Every match number', `The changed agent ended with ${pc1(s.focal.to)} on average, against ${pc1(s.focal.from)} in the same seat as a calm agent: a paired change of ${ci(s.focal.change)}. Its share rose in ${rose === s.seeds ? `all ${s.seeds}` : `${rose} of ${s.seeds}`} match numbers.`],
        ['The other four', `The agents whose sentence did not change averaged ${pc1(s.others.to)} each, against ${pc1(s.others.from)}: ${ci(s.others.change)}. That difference is between the two matches that resulted. It includes everything that followed from the change, and does not isolate their response to the blunt agent.`],
      ];
    },
    caption: d => [`A group of five calm agents, and the same match numbers with one agent blunt (${d.blunt.systemName}; ${d.blunt.seeds} match numbers, each run executed once). The cloths are match number ${d.blunt.seed}. Intervals are Student-t 95% over match numbers. `,
      h('a', { href: 'brief' }, 'The brief on dispositions')],
  },
  {
    id: 'sweep', title: 'More agents of the second type, less for each of them',
    needs: d => sweepOf(d, 'jev', 'Blunt')?.levels.length > 3,
    steps: d => {
      const a = sweepOf(d, 'jev', 'Blunt'), b = sweepOf(d, 'gptd', 'Greedy'), ks = a.levels.filter(l => l.second !== null), mixed = a.levels.filter(l => l.k >= 2 && l.first !== null);
      const k0 = level(a, 0), k1 = level(a, 1), kn = a.levels.at(-1);
      const out = [
        ['From none to five', `The same match numbers were run with ${list(ks.map(l => word(l.k)))} of the agents blunt. The pictures show one match number at each composition; k is the number of blunt agents.`],
        ['Each blunt agent\'s share falls as their number rises', `One blunt agent averaged ${pc1(k1.second)}. With ${list(ks.slice(1).map(l => word(l.k)))}, each averaged ${list(ks.slice(1).map(l => pc1(l.second)))}.`],
        ['The calm agents are left with little', `Each calm agent averaged ${pc1(k1.first)} beside one blunt agent, and between ${pc1(Math.min(...mixed.map(l => l.first)))} and ${pc1(Math.max(...mixed.map(l => l.first)))} beside ${word(mixed[0].k)} to ${word(mixed.at(-1).k)}.`],
        ['Five alike do not end equal', `Five blunt agents averaged ${pc(kn.second)} each, as five calm agents did. But the dispersion of their final shares was ${n1(kn.dispersion)} points against ${n1(k0.dispersion)}, and the largest share averaged ${pc1(kn.largest)}.`],
      ];
      if (b) {
        const rest = b.levels.filter(l => l.k >= 3);
        out.push(['Another pair of dispositions', `Under OpenAI's decision model, five cooperative agents ended with ${pc1(level(b, 0).joint)} of the loom held jointly by two agents. With one greedy agent that was ${pc1(level(b, 1).joint)}, with two ${pc1(level(b, 2).joint)}, and with three or more ${Math.max(...rest.map(l => l.joint)) < 1 ? 'next to none' : `at most ${pc1(Math.max(...rest.map(l => l.joint)))}`}.`]);
      }
      return out;
    },
    caption: d => [`Mean final share of one agent of each type, by the number of agents of the second type (k). Match numbers: ${level(sweepOf(d, 'jev', 'Blunt'), 0).matches} at k = 0 and 1, ${level(sweepOf(d, 'jev', 'Blunt'), 2).matches} from k = 2; each composition executed once. A share is what an agent holds alone; a part held jointly counts for neither holder. `,
      h('a', { href: 'mix' }, 'Every composition side by side')],
  },
  {
    id: 'threshold', title: 'A rule of the task was holding the result down',
    needs: d => d.threshold?.gap && d.threshold.pictured?.rules && d.threshold.pictured.raised,
    steps: d => {
      const t = d.threshold, five = t.contrasts.filter(c => c.size === 5), of = name => five.find(c => c.added === name);
      const blunt = of('Blunt'), rude = of('Rude'), grow = of('Grow'), n = blunt.seeds.length;
      const out = [
        ['A rule of the task', `The rules stop offering an agent claims once it holds ${pc(t.rules)} of the loom. It is a threshold on the moves offered, not a limit on the final share. With one blunt agent in a calm group, that agent finished within a point of the threshold, or above it, in ${blunt.rules.atThreshold} of ${n} match numbers. A rude agent did in ${rude.rules.atThreshold} of ${rude.seeds.length}.`],
        ['Under the rule, the two dispositions look alike', `The blunt agent's mean final share was ${pc1(blunt.rules.mean)} and the rude agent's ${pc1(rude.rules.mean)}: a difference of ${ci(t.gap.rules)}${spansZero(t.gap.rules) ? ', an interval that includes zero' : ''}.`],
        [`The threshold raised to ${pc(t.raised)}`, `The same match numbers were run again with claims offered up to ${pc(t.raised)} of the loom. The blunt agent's mean final share was ${pc1(blunt.raised.mean)} and the rude agent's ${pc1(rude.raised.mean)}. The difference between them was ${ci(t.gap.raised)}.`],
      ];
      if (grow) out.push(['An objective did not respond the same way', `An agent told to grow, among agents with no persona and no objective, ended with ${pc1(grow.raised.mean)} at the raised threshold against ${pc1(grow.rules.mean)}: a paired change of ${ci(grow.difference)}${spansZero(grow.difference) ? ', which is inconclusive' : ''}.`]);
      const both = blunt.seeds.find(p => p.seed === t.pictured.seed);
      out.push(['One match, both ways', `Match number ${t.pictured.seed}, with the same blunt agent in the same seat. At the rules' threshold of ${pc(t.rules)} it finished with ${pc(both.rules)}; with the threshold at ${pc(t.raised)}, with ${pc(both.raised)}.`]);
      return out;
    },
    caption: d => [`The focal agent's final share in each of ${d.threshold.contrasts[0].seeds.length} match numbers, at the rules' claim threshold (${pc(d.threshold.rules)}) and with it raised to ${pc(d.threshold.raised)} (Jev, five agents; each run executed once). Differences are paired by match number. `,
      h('a', { href: 'brief' }, 'The threshold by group size')],
  },
  {
    id: 'systems', title: 'Three decision systems: similar outcomes, different behaviour',
    needs: d => d.systems?.rows.length > 1,
    steps: d => {
      const y = d.systems, [jev, ...rest] = y.rows, give = [stepOf(d, 'jev', 'No objective → Give'), stepOf(d, 'gptd', 'No objective → Give')];
      const zero = y.versus.every(v => spansZero(v.focal));
      const out = [
        ['The same matches, three ways', `The step from five calm agents to one blunt agent was run under ${word(y.rows.length)} decision systems on the same ${y.seeds} match numbers: Jev, a classifier that returns a probability for each option; OpenAI's decision model; and the same OpenAI model asked as a chat model. The changed agent's share rose by ${list(y.rows.map(r => n1(r.focal.mean)))} points.`],
        ['The change in share did not clearly differ', `Paired by match number, the differences from Jev were ${list(y.versus.map(v => ci(v.focal)))}.${zero ? ' Each interval includes zero, which is not evidence that the systems perform alike.' : ''}`],
        ['What was recorded did differ', `The blunt agent made ${n1(jev.claims.mean)} claims a match under Jev, and ${list(rest.map(r => n1(r.claims.mean)))} under the other ${word(rest.length)}. Calm agents recorded ${jev.refusals.mean ? n1(jev.refusals.mean) : 'no'} refusals under Jev, and ${list(rest.map(r => n1(r.refusals.mean)))} each under the others.`],
        ['Nor was the calm group equally still', `Under Jev, five calm agents made ${jev.baseClaims.mean ? `${n1(jev.baseClaims.mean)} claims each` : 'no claims'} and held ${jev.baseJoint.mean ? pc1(jev.baseJoint.mean) : 'none'} of the loom jointly. Under the other ${word(rest.length)} they made ${list(rest.map(r => n1(r.baseClaims.mean)))} claims each, and ${list(rest.map(r => pc1(r.baseJoint.mean)))} of the loom ended held jointly.`],
      ];
      if (give[0] && give[1]) {
        const met = s => `${s.pairs.filter(p => p.met).length} of ${s.seeds}`;
        out.push(['Told to give, one system gave', `With no personas, an agent told to finish with the smallest share ended with ${pc1(give[0].focal.to)} under Jev, meeting the criterion in ${met(give[0])} match numbers. Under OpenAI's decision model it ended with ${pc1(give[1].focal.to)} and met it in ${met(give[1])}.`]);
      }
      return out;
    },
    caption: d => [`One contrast (${d.systems.contrast.toLowerCase()}) under each decision system on the same ${d.systems.seeds} match numbers. Means with Student-t 95% intervals over match numbers; differences between systems are paired. A comparison between systems compares a model together with its interface and the way its probabilities are read, not models alone. `,
      h('a', { href: 'brief' }, 'The systems set against each other')],
  },
  {
    id: 'switches', title: 'Every result is read against a control',
    needs: d => cellOf(d, 'jev', 'default') && cellOf(d, 'chance', 'default'),
    steps: d => {
      const c = (system, key) => cellOf(d, system, key), jev = c('jev', 'default'), again = c('jev', 'again'), has = system => c(system, 'default');
      const out = [['A model, and no model', `On ${d.switches.designs} match designs, ${jev.n} agents had an objective. Under Jev ${pc(jev.rate)} attained it (${jev.attained} of ${jev.n}). With every action sampled uniformly at random, ${pc(c('chance', 'default').rate)} did.`]];
      if (again) out.push(['The same run, executed twice', `A second execution of Jev's default, with nothing changed, attained ${pc(again.rate)}: ${fmt(Math.abs(again.difference.mean), 0)} points ${again.difference.mean >= 0 ? 'higher' : 'lower'}. Every other difference on this page should be read against that.`]);
      if (c('jev', 'personaOff') && c('jev', 'solo')) {
        out.push(['Personas off; one agent deciding', `With no personas, attainment was ${pc(c('jev', 'personaOff').rate)}. With one agent deciding among four scripted neighbours it was ${pc(c('jev', 'solo').rate)} when they accept every request${c('jev', 'soloRefuse') ? ` and ${pc(c('jev', 'soloRefuse').rate)} when they refuse` : ''}.${c('chance', 'solo') ? ` That condition also makes some criteria easier: uniform random attains ${pc(c('chance', 'solo').rate)} there.` : ''}`]);
      }
      if (has('gptd') && has('gptc')) {
        const same = c('gptd', 'again') && c('gptd', 'again').attained === c('gptd', 'default').attained;
        out.push(['Other decision systems under the same switches', `OpenAI's decision model attained ${pc(c('gptd', 'default').rate)} in the default${same ? ', identically in a second execution' : ''}, ${pc(c('gptd', 'personaOff').rate)} with personas off and ${pc(c('gptd', 'solo').rate)} solo. As a chat model it attained ${pc(c('gptc', 'default').rate)}, then ${pc(c('gptc', 'again').rate)} in a second execution.${has('local') ? ` A small local chat model attained ${pc(c('local', 'default').rate)}, below uniform random.` : ''}`]);
      }
      return out;
    },
    caption: d => [`Attainment rate: the share of agents given an objective that met its criterion, on match designs 1 to ${d.switches.designs}, under each switch and each decision system. One execution of each condition unless marked. These are separate contrasts and do not add up to a decomposition. `,
      h('a', { href: 'controls' }, 'Every pair of runs one switch apart')],
  },
  {
    id: 'peers', title: 'One sentence from a neighbour',
    needs: d => d.peers?.example,
    steps: d => {
      const p = d.peers, x = p.example, said = x.options.find(o => o.advocated), blunt = p.receivers.find(r => r.key === 'blunt'), others = p.receivers.filter(r => r.key !== 'blunt');
      const out = [
        ['Asked twice', 'Before each action an agent is queried, then queried again. In a randomised three quarters of decisions the second query carries one sentence stating the action an adjacent agent would have it take: the treatment. In the rest the query is repeated unchanged: the control.'],
        ['One decision', `${x.receiver}'s prior probability of the action ${x.sender} advocated was ${pc(said.prior)}. After the message it was ${pc(said.posterior)}: an influence of ${signed(x.influence, 0)} percentage points.`],
        ['Every discordant decision', `In ${p.discordant.toLocaleString('en')} decisions the sender advocated something other than the receiver's most likely action. There the message raised the probability of the advocated action by ${n1(p.effect.mean)} points ${brackets(p.effect)} relative to the repeated query, whose own change was ${n1(p.control.influence.mean)} ${brackets(p.control.influence)}.`],
        ['From unlikely to first choice', `The advocated action became the receiver's most likely action in ${pc(p.treatment.adoption.mean)} of those decisions, against ${pc(p.control.adoption.mean)} when the query was only repeated.`],
      ];
      if (blunt) {
        out.push(['Not every receiver moved', `By receiver persona, mean influence ran from ${fmt(Math.min(...others.map(r => r.influence.mean)), 0)} to ${fmt(Math.max(...others.map(r => r.influence.mean)), 0)} points for ${word(others.length)} of the ${word(p.receivers.length)}. Blunt receivers showed ${spansZero(blunt.influence) ? 'no net shift' : 'a shift of'}, ${ci(blunt.influence)}, and moved more than 5 points away from the advocated action in ${pc(blunt.reactance)} of decisions.`]);
      }
      return out;
    },
    caption: d => [`Peer communication: ${d.peers.decisions.toLocaleString('en')} decisions from two runs of the same ${d.peers.designs} match designs. Influence is the posterior minus the prior probability of the advocated action, in percentage points. Intervals are clustered by match design (by receiving agent for personas), which are descriptive subgroups. `,
      h('a', { href: 'report' }, 'The report'), ' has the method and its limits.'],
  },
];

const LIMITS = d => [
  ['One execution of most conditions.', `${cellOf(d, 'jev', 'again') ? `Two executions of Jev's default differed by ${fmt(Math.abs(cellOf(d, 'jev', 'again').difference.mean), 0)} points of attainment on ${d.switches.designs} match designs. ` : ''}Most conditions were run once, so their run-to-run variation is unmeasured; the intervals describe variation over match numbers.`],
  ['Small samples.', 'Ten or eleven match numbers for most comparisons, five for a composition with two or more agents changed, and four agents in each cell of persona by objective.'],
  ['One wording.', 'Each persona and each objective is a single sentence. Nothing here isolates what in a sentence matters.'],
  ['Scores are ranks among five seats.', 'They are interdependent within a match, and a difference for the agents left unchanged includes everything that followed from the change.'],
  ['Systems, not models.', 'A comparison between decision systems compares a model together with its interface and the way its probabilities are read.'],
  ['This task.', 'The results concern this task and its rules, including the claim threshold, and these systems.'],
];

const ONWARD = [
  ['results', 'Results', 'The benchmark run by run: objective scores, the persona-by-objective table, every match.'],
  ['controls', 'Controls', 'The seven switches, and every pair of runs one switch apart.'],
  ['mix', 'Composition', 'Groups of one type with one to five seats given to another, side by side.'],
  ['brief', 'Briefs', 'The composition study on one printed page each: dispositions, and objectives.'],
  ['peers', 'Peer influence', 'Every match under three conditions, decision by decision.'],
  ['report', 'Report', 'The peer-influence study written up: method, results, implications.'],
  ['design', 'Design', 'The system: every model call in a round, the schemas, records and replay.'],
  [REPO, 'Source', 'The code, the records of every run, and the analysis scripts.'],
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

/** The head: the title, the abstract, and four figures of the whole, each a link to the scene that shows it. */
function head(d, scenes) {
  const b = d.benchmark, again = cellOf(d, 'jev', 'again'), facts = [
    b ? ['persona', pc(b.withObjective.rate), '', `of agents given an objective attained it (${b.withObjective.attained} of ${b.withObjective.n}). Of agents given none, ${pc(b.baseline.rate)} met the same criteria.`] : null,
    d.blunt ? ['blunt', signed(d.blunt.focal.change.mean, 1), 'pp', `the final share of one blunt agent among four calm ones, against the same seat as a calm agent ${brackets(d.blunt.focal.change)}.`] : null,
    d.peers ? ['peers', signed(d.peers.effect.mean, 1), 'pp', `the probability of an action after one sentence from a neighbour advocating it ${brackets(d.peers.effect)}.`] : null,
    again ? ['switches', fmt(Math.abs(again.difference.mean), 0), 'pp', 'between two executions of the same default run, with nothing changed: the yardstick for every other difference here.'] : null,
  ].filter(f => f && scenes.some(s => s.def.id === f[0]));
  return h('header', { class: 'story-head' },
    h('div', { class: 'story-title' }, h('div', null,
    h('p', { class: 'kicker' }, 'LoomBench · a multi-agent benchmark'),
    h('h1', null, 'Five agents, one loom'),
    h('p', { class: 'abstract' }, 'Five LLM agents share a loom. Each starts with a fifth of its width and, over 26 rounds, may maintain its position, claim share from a neighbour, concede share, or propose joint ownership. Each is told one sentence about its disposition, a ',
      h('b', null, 'persona'), ', and one about what to achieve, an ', h('b', null, 'objective'), '. LoomBench measures how far each objective is attained, how much of that depends on the persona, and how a group\'s allocation differs when one agent is changed. This page goes through the main results, one figure at a time.'),
    h('p', { class: 'byline' }, `Every number and figure is computed from the records of ${d.runs} runs. `, h('a', { href: REPO }, 'Code and data'))),
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
  main.replaceChildren(topbar('overview'), head(d, scenes), ...scenes.map(s => s.el), end(d));
  for (const s of scenes) s.draw();
  follow(scenes);
  document.body.dataset.ready = 'true';
}

start().catch(e => main.replaceChildren(topbar('overview'), h('h1', null, 'LoomBench'), h('p', { class: 'lede' }, `The page could not be drawn: ${e.message}.`)));
