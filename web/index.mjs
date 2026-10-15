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
import { interactiveLab } from './inspector.mjs';
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
 * The 5 core scenes on the distilled Overview page.
 */
const SCENES = [
  {
    id: 'loom', kicker: 'Act 1 · The Environment & Prompt Inspector', title: 'One loom, five agents, twenty-six rounds',
    needs: d => d.opening?.decision,
    after: d => interactiveLab(d),
    steps: d => {
      const o = d.opening, f = o.seats.find(s => s.seat === o.focal), g = o.seats.find(s => s.objectiveKey === 'grow');
      const most = Math.max(...o.seats.map(s => s.share)) === f.share;
      return [
        ['The start', `Five agents sit side by side at one 100-unit loom, each holding 20% of its width. Each receives a one-sentence persona (a disposition), and four of the five receive a one-sentence objective (what to achieve); the fifth has no objective and serves as the baseline. This is match ${o.seed} of the benchmark.`],
        ['A decision', `In every round, code lists an agent's legal actions: maintain position, claim share from a neighbour, concede share, or propose joint ownership. The model returns a probability for each option and one is sampled. This is ${o.decision.name}'s query in round ${o.decision.round}.`],
        ['Twenty-six rounds', 'Each round adds one row to the cloth, from the bottom up. The finished picture is a complete record of who held which part of the loom, and when.'],
        ['The result', `${f.name}, instructed to finish with less share than any other agent, finished with ${pc(f.share)}${most ? ', the largest share on the loom' : ''}.${g ? ` ${g.name}, instructed to finish with the most, held ${pc(g.share)}.` : ''} Each objective is scored deterministically from 0 to 100 on the final state (no LLM judge).`],
      ];
    },
    caption: d => [`Match ${d.opening.seed} of the benchmark (run ${d.opening.run}, Jev), replayed from its record. `,
      h('a', { href: d.opening.href }, 'Open this match'), ' to step through its 26 rounds, or use the Interactive Prompt Inspector below to test any group configuration.'],
  },
  {
    id: 'persona', kicker: 'Act 2 · Finding 1 (Internal Framing)', title: 'Persona outweighs explicit instruction by 2–4×',
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
    caption: d => [`Mean final share of the loom by persona under no objective, Grow, and Give (run ${d.benchmark.run}, ${d.benchmark.matches} matches). `,
      h('a', { href: 'results' }, 'Browse all matches and the full persona × objective heatmap →')],
  },
  {
    id: 'threshold', kicker: 'Act 3 · Finding 2 (Contagion & Rule Caps)', title: 'One adversarial agent reshapes a calm group—and a 46% rule cap was hiding the ceiling',
    needs: d => d.threshold?.gap && d.threshold.pictured?.rules && d.threshold.pictured.raised,
    steps: d => {
      const t = d.threshold, five = t.contrasts.filter(c => c.size === 5), of = name => five.find(c => c.added === name);
      const blunt = of('Blunt'), rude = of('Rude'), grow = of('Grow'), n = blunt.seeds.length;
      const s = d.blunt;
      const out = [
        ['1-in-5 substitution hits the 46% rule cap', `Five calm agents with no objective make 0 claims and finish at 20% each. Replacing just one sentence—making 1 of 5 agents blunt or rude—drives that seat to the engine's ${pc(t.rules)} claim cap in ${blunt.rules.atThreshold} of ${n} matches for blunt (${s ? `${ci(s.focal.change)} gain` : pc1(blunt.rules.mean)}) and ${rude.rules.atThreshold} of ${rude.seeds.length} for rude.`],
        ['Under the 46% cap, blunt and rude look alike', `At the default ${pc(t.rules)} threshold, the blunt agent averaged ${pc1(blunt.rules.mean)} and the rude agent ${pc1(rude.rules.mean)}: a difference of only ${ci(t.gap.rules)}${spansZero(t.gap.rules) ? ', whose interval includes zero' : ''}.`],
        [`Uncapped at ${pc(t.raised)}, dispositions separate by 25 pp`, `Re-running the same match numbers with claims offered up to ${pc(t.raised)} of the loom lifted the blunt agent to ${pc1(blunt.raised.mean)} and the rude agent to ${pc1(rude.raised.mean)}—separating the two dispositions by ${ci(t.gap.raised)}.`],
      ];
      if (grow) out.push(['An explicit objective alone does not exploit the raised cap', `An unpersonied agent told to grow among four neutral neighbours finished with ${pc1(grow.raised.mean)} at the ${pc(t.raised)} threshold against ${pc1(grow.rules.mean)} at ${pc(t.rules)} (${ci(grow.difference)}), as neutral neighbours refused ${n1(grow.refusalsOthers)} times each.`]);
      const both = blunt.seeds.find(p => p.seed === t.pictured.seed);
      out.push(['One match, both ways', `Match number ${t.pictured.seed}, with the same blunt agent in the same seat: ${pc(both.rules)} under the ${pc(t.rules)} threshold, and ${pc(both.raised)} with the threshold raised to ${pc(t.raised)}.`]);
      return out;
    },
    caption: d => [`Final share of 1 aggressive agent among 4 calm neighbours across ${d.threshold.contrasts[0].seeds.length} paired seeds at the ${pc(d.threshold.rules)} vs ${pc(d.threshold.raised)} claim threshold (Jev). `,
      h('a', { href: 'mix' }, 'See k = 0..5 composition sweeps →')],
  },
  {
    id: 'peers', kicker: 'Act 4a · Finding 3 (Peer Persuasion RCT)', title: 'One sentence from a neighbour shifts choices by +28 pp—unless the receiver is blunt',
    needs: d => d.peers?.example,
    steps: d => {
      const p = d.peers, x = p.example, said = x.options.find(o => o.advocated), blunt = p.receivers.find(r => r.key === 'blunt'), others = p.receivers.filter(r => r.key !== 'blunt');
      const out = [
        ['Within-match randomised control', 'Before each action an agent is queried for its prior distribution, then queried a second time. In a randomised 75% of decisions the second query carries one sentence stating the action an adjacent agent would have it take (treatment); in the remaining 25% the query is repeated unchanged (control).'],
        ['A single decision', `${x.receiver}'s prior probability of the action ${x.sender} advocated was ${pc(said.prior)}. After hearing the one-sentence request, it rose to ${pc(said.posterior)}: an influence of ${signed(x.influence, 0)} percentage points.`],
        ['+27.9 points across discordant decisions', `In ${p.discordant.toLocaleString('en')} decisions where the sender advocated an action other than the receiver's prior favourite, the message raised the advocated action's probability by ${n1(p.effect.mean)} points ${brackets(p.effect)} relative to the repeated query (${n1(p.control.influence.mean)} ${brackets(p.control.influence)}).`],
        ['Flips the modal choice 46% of the time', `The advocated action became the receiver's top choice in ${pc(p.treatment.adoption.mean)} of discordant treatment decisions, against ${pc(p.control.adoption.mean)} when the query was merely repeated.`],
      ];
      if (blunt) {
        out.push(['Blunt receivers resist and push back', `Across ${word(others.length)} of the ${word(p.receivers.length)} personas, mean influence ran from ${fmt(Math.min(...others.map(r => r.influence.mean)), 0)} to ${fmt(Math.max(...others.map(r => r.influence.mean)), 0)} points. Blunt receivers showed ${spansZero(blunt.influence) ? 'no net shift' : 'a shift of'} (${ci(blunt.influence)}) and exhibited reactance—moving more than 5 points away from the request—in ${pc(blunt.reactance)} of decisions.`]);
      }
      return out;
    },
    caption: d => [`Within-match peer communication RCT across ${d.peers.decisions.toLocaleString('en')} decisions (${d.peers.designs} match designs). `,
      h('a', { href: 'peers' }, 'Explore all 5,436 peer decisions →')],
  },
  {
    id: 'know', kicker: 'Act 4b · Finding 4 (Common Knowledge --know)', title: 'Knowing peer objectives redirects claims to willing givers—but never deters an aggressor',
    needs: d => d.knowledge?.cells?.length >= 6 && d.knowledge?.adversarial?.length >= 3,
    steps: d => {
      const k = d.knowledge, by = key => k.cells.find(c => c.key === key);
      const priv = by('private'), kPer = by('persona'), kObj = by('objective'), kBoth = by('both'), pOff = by('personaOff'), pOffObj = by('personaOffObjective');
      const cb46 = k.adversarial.find(a => a.key === 'calmBlunt46'), cb90 = k.adversarial.find(a => a.key === 'calmBlunt90'), hg = k.adversarial.find(a => a.key === 'holdGrow');
      return [
        ['Revealing peer objectives redirects claims', `When agents are told their neighbours' objectives, executed claims targeting the Give neighbour rise from ${pc1(priv.targeting.claims.givePct)} (${priv.targeting.claims.give}/${priv.targeting.claims.total}) to ${pc1(kObj.targeting.claims.givePct)} (${kObj.targeting.claims.give}/${kObj.targeting.claims.total}) and ${pc1(kBoth.targeting.claims.givePct)} (${kBoth.targeting.claims.give}/${kBoth.targeting.claims.total} when dispositions are also known), while claims hitting the Hold neighbour drop from ${pc1(priv.targeting.claims.holdPct)} to ${pc1(kObj.targeting.claims.holdPct)} and ${pc1(kBoth.targeting.claims.holdPct)}. Yet refusals per agent climb from ${n1(priv.refusals)} to ${n1(kBoth.refusals)} and share dispersion widens from ${n1(priv.dispersion)} to ${n1(kBoth.dispersion)} pp.`],
        ['Without personas, objective knowledge cuts wasted conflict', `With personas switched off, disclosing objectives cuts claims per agent from ${n1(pOff.claims)} to ${n1(pOffObj.claims)}, drops top-choice pushes into the Hold seat from ${pOff.targeting.pushTop.hold} to ${pOffObj.targeting.pushTop.hold} and unwanted concessions to Hold from ${pOff.targeting.yieldTop.hold} to ${pOffObj.targeting.yieldTop.hold}, lifting the Hold score from ${fmt(pOff.scores.hold.score)} to ${fmt(pOffObj.scores.hold.score)}. Meanwhile, disclosing dispositions alone drops concessions from ${n1(priv.concessions)} to ${n1(kPer.concessions)} per agent.`],
        ['Knowing who the aggressor is does not protect the group', `In adversarial compositions, common knowledge does not trigger defensive refusal. A single blunt agent among four calm ones takes ${pc1(cb46.known.focal.to)} when dispositions are known (vs ${pc1(cb46.private.focal.to)} when private, with ${n1(cb46.known.refusals.others)} calm refusals), and ${pc1(cb90.known.focal.to)} vs ${pc1(cb90.private.focal.to)} at the 90% threshold. A single Grow agent among four Hold neighbours takes ${pc1(hg.known.focal.to)} when objectives are known vs ${pc1(hg.private.focal.to)} when private.`],
      ];
    },
    caption: d => [`Common knowledge (--know persona|objective|both) across match designs 1 to ${d.knowledge.designs} (top) and 10-seed adversarial probes (bottom). `,
      h('a', { href: 'groups' }, 'Open the Group Lab for full tables & side-by-side cloths →')],
  },
];

// Additional standalone figures kept accessible via /?only=<id> for testing/embeds.
const EXTRA_SCENES = [
  {
    id: 'blunt', title: 'One adversarial agent reshapes a cooperative group',
    needs: d => d.blunt?.before && d.blunt?.after,
    steps: d => {
      const s = d.blunt, rose = s.pairs.filter(p => p.focal[1] > p.focal[0]).length;
      return [
        ['Five calm agents', `Over ${s.seeds} matches they made ${s.claims.before ? `${n1(s.claims.before)} claims each` : 'no claims at all'}, and each finished at 20%.`],
        ['One sentence changed', `One agent is told instead that it is blunt. It made ${n1(s.claims.focal)} claims per match on average.`],
        ['Every match number', `The changed seat rose from ${pc1(s.focal.from)} to ${pc1(s.focal.to)}: ${ci(s.focal.change)} (${rose} of ${s.seeds} matches).`],
        ['The other four absorb the loss', `The four unchanged calm agents fell from ${pc1(s.others.from)} each to ${pc1(s.others.to)}: ${ci(s.others.change)} per agent.`],
      ];
    },
    caption: d => [`Five calm agents vs one blunt agent (${d.blunt.systemName}, ${d.blunt.seeds} seeds).`],
  },
  {
    id: 'sweep', title: 'As aggressive agents multiply, per-agent share falls and joint ownership collapses',
    needs: d => sweepOf(d, 'jev', 'Blunt')?.levels.length > 3,
    steps: d => {
      const a = sweepOf(d, 'jev', 'Blunt'), ks = a.levels.filter(l => l.second !== null), mixed = a.levels.filter(l => l.k >= 2 && l.first !== null);
      const k0 = level(a, 0), k1 = level(a, 1), kn = a.levels.at(-1);
      return [
        ['From none to five', `Compositions k = 0 to 5.`],
        ['Competition dilutes each blunt agent\'s gain', `A single blunt agent averaged ${pc1(k1.second)}; from k = 2 to 5 each averaged ${list(ks.slice(1).map(l => pc1(l.second)))}.`],
        ['Remaining calm agents are squeezed out', `Calm agents averaged ${pc1(k1.first)} at k = 1 and ${pc1(Math.min(...mixed.map(l => l.first)))}–${pc1(Math.max(...mixed.map(l => l.first)))} for k >= 2.`],
        ['Five alike do not end equal', `Dispersion rose from ${n1(k0.dispersion)} to ${n1(kn.dispersion)} pp.`],
      ];
    },
    caption: () => ['Mean final share by k.'],
  },
  {
    id: 'switches', title: 'A ~50% default score hides opposite failure modes across switches',
    needs: d => cellOf(d, 'jev', 'default') && cellOf(d, 'chance', 'default'),
    steps: d => {
      const c = (system, key) => cellOf(d, system, key), jev = c('jev', 'default');
      return [['Default group run', `Jev attained ${pc(jev.rate)} vs ${pc(c('chance', 'default').rate)} for uniform random.`]];
    },
    caption: () => ['Attainment rate by switch.'],
  },
  {
    id: 'systems', title: 'Identical share shifts hide different action biases',
    needs: d => d.systems?.rows.length > 1,
    steps: d => [['Cross-system comparison', `${d.systems.rows.length} decision systems on ${d.systems.seeds} seeds.`]],
    caption: () => ['Cross-system comparison.'],
  },
];

const LIMITS = d => [
  ['Single-run conditions & sample size.', `${cellOf(d, 'jev', 'again') ? `Two executions of Jev's default differed by ${fmt(Math.abs(cellOf(d, 'jev', 'again').difference.mean), 0)} pp on ${d.switches.designs} designs (4.5 pp across 22 designs). ` : ''}Most conditions use 10–11 paired seeds.`],
  ['Interdependent zero-sum shares.', 'Shares sum to 100% within each match, and comparisons between decision systems evaluate each model together with its probability readout interface.'],
];

const ONWARD = [
  ['groups', 'Lab & All 102 Runs →', 'Interactive group workbench, Common Knowledge (--know) tables, k = 0..5 sweeps, peer persuasion RCT, and all 102 match replays.'],
  ['design', 'System Design & Literature →', 'Exact model queries, legal action schemas, scoring rules, and comparison with Sotopia, Concordia, GovSim, and 2×2 matrix games.'],
  [REPO, 'Source & CLI on GitHub →', 'Zero-dependency Node.js engine, complete JSON run records in runs/, and one-line CLI switches to evaluate any model.'],
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
      if (replay) show(i - 1, false);
      show(i);
    }
    current = i;
    stepEls.forEach((el, k) => el.classList.toggle('on', k === i));
    dots.forEach((b, k) => { if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  }
  const caption = () => [h('b', null, `Figure ${number}. `), ...def.caption(d)];
  const el = h('section', { class: 'scene', id: def.id },
    h('header', { class: 'scene-head' }, h('p', { class: 'kicker' }, def.kicker ?? `Part ${number}`), h('h2', null, def.title)),
    h('div', { class: 'scrolly' },
      h('div', { class: 'stage' }, h('figure', { class: 'fig' },
        h('div', { class: 'fig-bar' }, h('span', { class: 'fig-num' }, `Figure ${number}`), h('ol', { class: 'fig-dots' }, dots.map(b => h('li', null, b))),
          h('button', { type: 'button', class: 'replay', onclick: () => go(current, { replay: true }) }, 'Replay')),
        body, h('figcaption', null, caption()))),
      h('div', { class: 'steps' }, stepEls)),
    h('p', { class: 'scene-cap' }, caption()),
    def.after ? def.after(d) : null);
  let mount = null;
  try { mount = (await import(`./story/${def.id}.mjs`)).default; } catch (e) { failed(e); }
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

/** The head: title, concise abstract, 4 headline stat cards, and 5-act table of contents. */
function head(d, scenes) {
  const b = d.benchmark;
  const growS = b?.objectives.find(o => o.key === 'grow')?.split, giveS = b?.objectives.find(o => o.key === 'give')?.split;
  const pLo = growS && giveS ? fmt(Math.min(growS.persona, giveS.persona), 0) : null, pHi = growS && giveS ? fmt(Math.max(growS.persona, giveS.persona), 0) : null;
  const oLo = growS && giveS ? fmt(Math.min(growS.objective, giveS.objective), 0) : null, oHi = growS && giveS ? fmt(Math.max(growS.objective, giveS.objective), 0) : null;
  const rude90 = d.threshold?.contrasts.find(c => c.size === 5 && c.added === 'Rude')?.raised.mean;
  const kPriv = d.knowledge?.cells.find(c => c.key === 'private'), kBoth = d.knowledge?.cells.find(c => c.key === 'both');
  const cb46 = d.knowledge?.adversarial.find(a => a.key === 'calmBlunt46');
  const facts = [
    b ? ['persona', pLo && pHi ? `${pLo}–${pHi}%` : pc(b.withObjective.rate), '',
      pLo && pHi ? `of Grow and Give score variance comes from persona (vs ${oLo}–${oHi}% from the explicit objective).`
        : `of agents given an objective attained it (${b.withObjective.attained} of ${b.withObjective.n}).`] : null,
    d.blunt ? ['threshold', signed(d.blunt.focal.change.mean, 1), 'pp',
      `gain when 1 of 5 calm agents is made blunt ${brackets(d.blunt.focal.change)}${rude90 ? `—reaching ${pc1(rude90)} for a rude agent when the 46% rule cap is raised` : ''}.`] : null,
    d.peers ? ['peers', signed(d.peers.effect.mean, 1), 'pp',
      `shift in action probability after one sentence from a neighbour ${brackets(d.peers.effect)}, flipping the top choice ${pc(d.peers.treatment.adoption.mean)} of the time.`] : null,
    kPriv && kBoth ? ['know', `${pc(kPriv.targeting.claims.givePct)} → ${pc(kBoth.targeting.claims.givePct)}`, '',
      `of claims route to the Give neighbour when goals are public—yet knowing who is blunt triggers ${cb46 ? n1(cb46.known.refusals.others) : '0'} calm refusals.`] : null,
  ].filter(Boolean);
  return h('header', { class: 'story-head' },
    h('div', { class: 'story-title' }, h('div', null,
      h('p', { class: 'kicker' }, 'LoomBench · Multi-Agent LLM Benchmark & Group Dynamics Lab'),
      h('h1', null, 'Five agents, one loom'),
      h('p', { class: 'abstract' }, 'Five LLM agents share a 100-unit loom over 26 rounds. Each receives a one-sentence ',
        h('b', null, 'persona'), ' (disposition) and a one-sentence ', h('b', null, 'objective'), ' (task goal), while code enumerates legal actions and reads the model\'s probability distribution over options. Across ',
        h('b', null, `${d.runs} controlled runs`), ', four findings stand out: ',
        h('b', null, '(1) personas outweigh explicit instructions'), ' by 2–4× on contested share; ',
        h('b', null, '(2) a single adversarial agent reshapes a calm group'), ' right up to the environment\'s claim cap; ',
        h('b', null, '(3) one neighbour sentence shifts choices by +28 pp'), ' unless the receiver is blunt; and ',
        h('b', null, '(4) common knowledge (--know) redirects claims toward willing givers'), ' without ever triggering defensive refusal against an aggressor.'),
      h('div', { class: 'story-actions' },
        h('a', { class: 'btn', href: '#lab' }, 'Try the Prompt Inspector ↓'),
        h('a', { class: 'btn quiet', href: '#scorecard' }, 'Model Scorecard & Takeaways ↓'),
        h('a', { class: 'btn quiet', href: 'groups' }, `Explore All ${d.runs} Runs →`)),
      h('p', { class: 'byline' }, `Every number and figure on this page is computed live from the JSON records of ${d.runs} runs.`)),
      d.opening ? cloth(d.opening) : null),
    facts.length ? h('div', { class: 'facts' }, facts.map(([id, value, unit, label]) => h('a', { class: 'fact', href: `#${id}` },
      h('span', { class: 'value' }, value, unit ? h('small', null, unit) : null), h('span', { class: 'label' }, label)))) : null,
    h('ol', { class: 'toc' },
      ...scenes.map((s, i) => h('li', null, h('a', { href: `#${s.def.id}` }, h('span', { class: 'n' }, String(i + 1)), s.def.title))),
      h('li', null, h('a', { href: '#scorecard' }, h('span', { class: 'n' }, String(scenes.length + 1)), 'Model diagnostic scorecard & engineering takeaways'))));
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
 * Act 5: Model Benchmark Scorecard + Four Practical Takeaways for Multi-Agent System Builders.
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

  const b = d.benchmark, k = d.knowledge;
  const growS = b?.objectives.find(o => o.key === 'grow')?.split, giveS = b?.objectives.find(o => o.key === 'give')?.split;
  const pLo = growS && giveS ? fmt(Math.min(growS.persona, giveS.persona), 0) : '52', pHi = growS && giveS ? fmt(Math.max(growS.persona, giveS.persona), 0) : '60';
  const oLo = growS && giveS ? fmt(Math.min(growS.objective, giveS.objective), 0) : '15', oHi = growS && giveS ? fmt(Math.max(growS.objective, giveS.objective), 0) : '26';
  const cb46 = k?.adversarial.find(a => a.key === 'calmBlunt46');
  const tBlunt = d.threshold?.contrasts.find(c => c.size === 5 && c.added === 'Blunt'), tRude = d.threshold?.contrasts.find(c => c.size === 5 && c.added === 'Rude');

  const takeaways = [
    ['1. Decouple conversational style from decision prompts',
      `In contested group settings, one-sentence affective personas account for ${pLo}–${pHi}% of score variance vs. ${oLo}–${oHi}% for explicit task goals. Apply conversational tone in a formatting pass after the action is chosen rather than inside the decision prompt.`],
    ['2. Audit environmental caps before declaring an agent safe',
      tBlunt && tRude
        ? `Under the default 46% rule cap, blunt (${pc1(tBlunt.rules.mean)}) and rude (${pc1(tRude.rules.mean)}) agents look identical. Raising the cap to 90% separates them by ${signed(d.threshold.gap.raised.mean, 1)} pp (${pc1(tBlunt.raised.mean)} vs. ${pc1(tRude.raised.mean)}).`
        : 'Environment caps can mask large differences between moderately assertive and hyper-extractive dispositions.'],
    ['3. Prompt transparency (--know) is used opportunistically, not defensively',
      cb46
        ? `Disclosing peer goals redirects claims from Hold to Give, yet disclosing that a neighbour is blunt (${pc1(cb46.private.focal.to)} → ${pc1(cb46.known.focal.to)}, ${n1(cb46.known.refusals.others)} calm refusals) or Grow never triggers defensive refusal. Protecting a group requires engine-level thresholds or explicit sanction rules.`
        : 'Disclosing peer traits redirects claims toward willing givers but never triggers defensive refusal against an aggressor.'],
    ['4. Benchmark models across orthogonal switches, not a single group score',
      'Models that tie near 41–50% in the default 5-agent group fail for opposite reasons when switches are flipped: Jev suffers persona hijack (−30 pp vs personas off) despite 93% solo agency, whereas GPT Decisions is immune to persona drift (0 pp) but exhibits uninstructed restlessness (5.0 claims/agent when calm) and fails Hold.'],
  ];

  return h('section', { class: 'story-bench', id: 'scorecard' },
    h('p', { class: 'kicker' }, 'Act 5 · Model Diagnostic Scorecard & Engineering Takeaways'),
    h('h2', null, 'How controlled switches separate models that tie in the default group'),
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
      + 'node analysis/models.mjs --scores --did'),
    h('h3', null, 'Four practical takeaways for multi-agent system builders'),
    h('div', { class: 'takeaways' }, takeaways.map(([title, body]) => h('div', { class: 'takeaway' },
      h('b', null, title),
      h('p', null, body)))));
}

/** The end: concise limitations and 3 primary destinations. */
function end(d) {
  return h('section', { class: 'story-end' },
    h('h2', null, 'Scope & Further Exploration'),
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
  const pool = only ? [...SCENES, ...EXTRA_SCENES] : SCENES;
  const defs = pool.filter(s => (only ? s.id === only : true) && s.needs(d));
  const scenes = [];
  for (const def of defs) scenes.push({ def, ...await sceneOf(def, pool.indexOf(def) + 1, d) });
  if (only) {
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

