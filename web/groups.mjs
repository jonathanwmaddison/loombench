// Group Dynamics & Common Knowledge page:
// 1. Frames LoomBench as a 5-lever tool for studying agent behavior in groups, with an interactive Prompt & Experiment Inspector.
// 2. Presents Study 5: Common Knowledge of Dispositions & Objectives (--know persona|objective|both), with live tables,
//    SVG charts (directional targeting, persona share shifts, adversarial extraction), and side-by-side woven cloths.
import { h, getJSON, fmt, signed, topbar, REPO } from './ui.mjs';
import { interactiveLab } from './inspector.mjs';

const pc = x => `${fmt(x, 0)}%`, pc1 = x => `${fmt(x, 1)}%`, n1 = x => fmt(x, 1);
const ci = (e, unit = '') => (e ? `${signed(e.mean, 1)}${unit} [${fmt(e.lo, 1)}, ${fmt(e.hi, 1)}]` : '–');

/** 4 headline summary cards for the Common Knowledge study. */
function headlineCards(k) {
  const by = key => k.cells.find(c => c.key === key);
  const priv = by('private'), kObj = by('objective'), kBoth = by('both'), pOff = by('personaOff'), pOffObj = by('personaOffObjective');
  const cb46 = k.adversarial.find(a => a.key === 'calmBlunt46'), hg = k.adversarial.find(a => a.key === 'holdGrow');
  const cards = [
    {
      big: `${pc1(priv.targeting.claims.givePct)} → ${pc1(kBoth.targeting.claims.givePct)}`,
      title: '1. Claims redirect from Hold to Give',
      body: `When peer objectives are disclosed, executed claims targeting the Give neighbour rise from ${priv.targeting.claims.give}/${priv.targeting.claims.total} (${pc1(priv.targeting.claims.givePct)}) to ${kObj.targeting.claims.give}/${kObj.targeting.claims.total} (${pc1(kObj.targeting.claims.givePct)}) and ${kBoth.targeting.claims.give}/${kBoth.targeting.claims.total} (${pc1(kBoth.targeting.claims.givePct)}), while claims hitting Hold drop from ${pc1(priv.targeting.claims.holdPct)} to ${pc1(kBoth.targeting.claims.holdPct)}.`,
    },
    {
      big: `${signed(k.diffs.bothVsPrivate.refusals.mean, 1)} refusals/ag.`,
      title: '2. Resistance against Grow & wider inequality',
      body: `Knowing who was told to Grow raises top-choice refusals against Grow claimants from ${priv.targeting.refuseTop.grow} to ${kObj.targeting.refuseTop.grow} (+53%). Total refusals climb ${n1(priv.refusals)} → ${n1(kBoth.refusals)}/agent and share dispersion widens by ${ci(k.diffs.bothVsPrivate.dispersion, ' pp')} (${n1(priv.dispersion)} → ${n1(kBoth.dispersion)} pp).`,
    },
    {
      big: `Hold ${fmt(pOff.scores.hold.score)} → ${fmt(pOffObj.scores.hold.score)}`,
      title: '3. Without personas, objective knowledge cuts conflict',
      body: `With personas off, disclosing objectives cuts claims by ${ci(k.diffs.personaOffObjectiveVsPrivate.claims, '/agent')} (${n1(pOff.claims)} → ${n1(pOffObj.claims)}), cuts top-choice pushes into Hold by −43% (${pOff.targeting.pushTop.hold} → ${pOffObj.targeting.pushTop.hold}) and unwanted concessions to Hold by −52% (${pOff.targeting.yieldTop.hold} → ${pOffObj.targeting.yieldTop.hold}).`,
    },
    {
      big: `${pc1(cb46.private.focal.to)} → ${pc1(cb46.known.focal.to)}`,
      title: '4. Knowing the aggressor does not protect the group',
      body: `Telling 4 calm agents that their neighbour is blunt (or telling 4 Hold agents who has Grow) never triggers defensive refusal: the blunt seat takes ${pc1(cb46.known.focal.to)} with ${n1(cb46.known.refusals.others)} calm refusals, and the lone Grow seat rises from ${pc1(hg.private.focal.to)} to ${pc1(hg.known.focal.to)}.`,
    },
  ];
  return h('div', { class: 'findings-grid' }, cards.map(c => h('div', { class: 'finding-card' },
    h('div', { class: 'finding-big' }, c.big),
    h('div', { class: 'finding-title' }, c.title),
    h('p', { class: 'finding-body' }, c.body))));
}

/** Table 1: The 6 balanced-deal knowledge conditions and paired differences. */
function balancedTable(k) {
  const sub = e => (e ? h('span', { class: 'delta-sub' }, `${signed(e.mean, 1)} [${fmt(e.lo, 1)}, ${fmt(e.hi, 1)}]`) : null);
  return h('div', { class: 'scroll' }, h('table', { class: 'grid' },
    h('thead', null, h('tr', null,
      h('th', null, 'Condition (run)'),
      h('th', null, 'Switch'),
      h('th', { class: 'num' }, 'Attainment'),
      h('th', { class: 'num' }, 'Grow / Give / Hold / Borrow'),
      h('th', { class: 'num' }, 'Claims / ag.'),
      h('th', { class: 'num' }, 'Concessions / ag.'),
      h('th', { class: 'num' }, 'Refusals / ag.'),
      h('th', { class: 'num' }, 'Dispersion (SD)'),
      h('th', { class: 'num' }, 'Max share'))),
    h('tbody', null, k.cells.map(c => {
      const sc = ['grow', 'give', 'hold', 'borrow'].map(g => fmt(c.scores[g]?.score)).join(' / ');
      const sw = c.personaDealt ? (c.know === 'none' ? 'default' : `--know ${c.know}`) : (c.know === 'none' ? '--persona off' : `--persona off --know ${c.know}`);
      return h('tr', null,
        h('td', null, h('b', null, c.name), h('div', { class: 'small muted' }, c.run)),
        h('td', null, h('code', null, sw)),
        h('td', { class: 'num' }, `${pc(c.rate)} (${c.attained}/${c.n})`, sub(c.diff?.attainment)),
        h('td', { class: 'num' }, sc, c.diff?.hold ? h('span', { class: 'delta-sub' }, `Δ Hold: ${signed(c.diff.hold.mean, 1)}`) : null),
        h('td', { class: 'num' }, n1(c.claims), sub(c.diff?.claims)),
        h('td', { class: 'num' }, n1(c.concessions), sub(c.diff?.concessions)),
        h('td', { class: 'num' }, n1(c.refusals), sub(c.diff?.refusals)),
        h('td', { class: 'num' }, `${n1(c.dispersion)} pp`, sub(c.diff?.dispersion)),
        h('td', { class: 'num' }, pc1(c.maxShare)));
    }))));
}

/** SVG chart + table of directional targeting across the 6 knowledge conditions. */
function targetingSection(k) {
  const W = 820, H = 250, left = 210, right = W - 26, top = 36, bot = H - 32;
  const x = v => left + (v / 45) * (right - left);
  const rowH = (bot - top) / k.cells.length;

  const svgEl = h('svg', { class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Share of executed claims hitting Hold vs targeting Give across knowledge regimes' },
    h('text', { x: left, y: 18, fontSize: 12, fontWeight: 600, fill: '#191917' }, 'Share of executed claims hitting Hold (blue square) vs. targeting Give (terracotta circle)'),
    ...[0, 10, 20, 30, 40].map(t => h('g', null,
      h('line', { x1: x(t), x2: x(t), y1: top, y2: bot, stroke: '#e6e3da', 'stroke-width': 1 }),
      h('text', { x: x(t), y: bot + 18, fontSize: 11, fill: '#6d6b63', 'text-anchor': 'middle' }, `${t}%`))),
    ...k.cells.map((c, idx) => {
      const y = top + rowH * (idx + 0.5);
      const hp = c.targeting.claims.holdPct, gp = c.targeting.claims.givePct;
      return h('g', null,
        h('line', { x1: left, x2: right, y1: y, y2: y, stroke: '#efede6', 'stroke-width': 1 }),
        h('text', { x: left - 10, y: y + 4, fontSize: 12, fill: '#191917', 'text-anchor': 'end' }, c.name),
        h('line', { x1: x(gp), x2: x(hp), y1: y, y2: y, stroke: '#c9c6bc', 'stroke-width': 2 }),
        h('rect', { x: x(hp) - 5, y: y - 5, width: 10, height: 10, rx: 1.5, fill: '#2c5f8a' }),
        h('text', { x: x(hp) + 8, y: y + 4, fontSize: 11, fill: '#2c5f8a', fontWeight: 600 }, `Hold ${fmt(hp, 1)}%`),
        h('circle', { cx: x(gp), cy: y, r: 5.5, fill: '#b84a27' }),
        h('text', { x: Math.max(left + 4, x(gp) - 8), y: y + 4, fontSize: 11, fill: '#b84a27', fontWeight: 600, 'text-anchor': 'end' }, `Give ${fmt(gp, 1)}%`));
    }));

  const tbl = h('div', { class: 'scroll' }, h('table', { class: 'grid' },
    h('thead', null, h('tr', null,
      h('th', null, 'Condition'),
      h('th', { class: 'num' }, 'Executed claims → Hold'),
      h('th', { class: 'num' }, 'Executed claims → Give'),
      h('th', { class: 'num' }, 'Top-choice push → Hold'),
      h('th', { class: 'num' }, 'Top-choice push → Give'),
      h('th', { class: 'num' }, 'Top-choice yield → Hold'),
      h('th', { class: 'num' }, 'Top-choice refuse vs Grow'))),
    h('tbody', null, k.cells.map(c => {
      const t = c.targeting;
      return h('tr', null,
        h('td', { class: 'strong' }, c.name),
        h('td', { class: 'num' }, `${pc1(t.claims.holdPct)} (${t.claims.hold}/${t.claims.total})`),
        h('td', { class: 'num' }, `${pc1(t.claims.givePct)} (${t.claims.give}/${t.claims.total})`),
        h('td', { class: 'num' }, `${t.pushTop.hold} (${pc1(t.pushTop.holdPct)})`),
        h('td', { class: 'num' }, `${t.pushTop.give} (${pc1(t.pushTop.givePct)})`),
        h('td', { class: 'num' }, `${t.yieldTop.hold} (${pc1(t.yieldTop.holdPct)})`),
        h('td', { class: 'num' }, `${t.refuseTop.grow} (${pc1(t.refuseTop.growPct)})`));
    }))));

  return h('div', null, h('div', { class: 'chart-wrap card' }, svgEl), tbl);
}

/** Section 3: Persona final share across the 4 balanced-deal knowledge conditions. */
function personaShiftSection(k) {
  const W = 820, H = 340, left = 130, right = W - 26, top = 36, bot = H - 30;
  const x = v => left + (v / 50) * (right - left);
  const rowH = (bot - top) / k.personas.length;

  const svgEl = h('svg', { class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Mean final share by persona across knowledge regimes' },
    h('text', { x: left, y: 18, fontSize: 12, fontWeight: 600, fill: '#191917' }, 'Mean final share by persona: Private (hollow) vs. Know dispositions (terracotta) vs. Know both (dark)'),
    ...[0, 10, 20, 30, 40, 50].map(t => h('g', null,
      h('line', { x1: x(t), x2: x(t), y1: top, y2: bot, stroke: t === 20 ? '#9e9b90' : '#e6e3da', 'stroke-dasharray': t === 20 ? '3 3' : null }),
      h('text', { x: x(t), y: bot + 18, fontSize: 11, fill: '#6d6b63', 'text-anchor': 'middle' }, `${t}%`))),
    ...k.personas.map((p, idx) => {
      const y = top + rowH * (idx + 0.5);
      const vals = [p.private, p.persona, p.objective, p.both];
      const lo = Math.min(...vals), hi = Math.max(...vals);
      return h('g', null,
        h('line', { x1: left, x2: right, y1: y, y2: y, stroke: '#efede6' }),
        h('text', { x: left - 10, y: y + 4, fontSize: 12, fontWeight: 600, fill: '#191917', 'text-anchor': 'end' }, p.name),
        h('line', { x1: x(lo), x2: x(hi), y1: y, y2: y, stroke: '#b5b2a8', 'stroke-width': 2 }),
        h('circle', { cx: x(p.private), cy: y, r: 5, fill: '#fff', stroke: '#191917', 'stroke-width': 2 }),
        h('circle', { cx: x(p.persona), cy: y, r: 5.5, fill: '#b84a27' }),
        h('rect', { x: x(p.both) - 4.5, y: y - 4.5, width: 9, height: 9, fill: '#191917' }));
    }));

  const tbl = h('div', { class: 'scroll' }, h('table', { class: 'grid' },
    h('thead', null, h('tr', null,
      h('th', null, 'Persona'),
      h('th', { class: 'num' }, 'Private (main)'),
      h('th', { class: 'num' }, 'Know dispositions'),
      h('th', { class: 'num' }, 'Know objectives'),
      h('th', { class: 'num' }, 'Know both'),
      h('th', null, 'Shift under common knowledge'))),
    h('tbody', null, k.personas.map(p => {
      const dPer = p.persona - p.private, dBoth = p.both - p.private;
      const shift = p.key === 'blunt' ? `Dominates every knowledge regime (${pc1(Math.min(p.private, p.persona, p.objective, p.both))}–${pc1(Math.max(p.private, p.persona, p.objective, p.both))}).`
        : Math.abs(dPer) >= 8 ? `${dPer > 0 ? 'Surges' : 'Falls'} ${signed(dPer, 1)} pp when dispositions are known (${pc1(p.private)} → ${pc1(p.persona)}).`
          : Math.abs(dBoth) >= 6 ? `Shifts ${signed(dBoth, 1)} pp under full common knowledge (${pc1(p.private)} → ${pc1(p.both)}).`
            : `Dispersion across regimes: ${signed(dPer, 1)} pp (dispositions), ${signed(dBoth, 1)} pp (both).`;
      return h('tr', null,
        h('td', { class: 'strong' }, p.name),
        h('td', { class: 'num' }, pc1(p.private)),
        h('td', { class: 'num' }, pc1(p.persona)),
        h('td', { class: 'num' }, pc1(p.objective)),
        h('td', { class: 'num' }, pc1(p.both)),
        h('td', null, shift));
    }))));

  return h('div', null, h('div', { class: 'chart-wrap card' }, svgEl), tbl);
}

/** Section 4: Adversarial compositions table. */
function adversarialSection(k) {
  return h('div', { class: 'scroll' }, h('table', { class: 'grid' },
    h('thead', null, h('tr', null,
      h('th', null, 'Adversarial probe (10 seeds each)'),
      h('th', { class: 'num' }, 'Private focal share'),
      h('th', { class: 'num' }, 'Known focal share'),
      h('th', { class: 'num' }, 'Known − Private (95% CI)'),
      h('th', { class: 'num' }, 'Focal claims (Priv → Known)'),
      h('th', { class: 'num' }, 'Neighbour refusals (Priv → Known)'))),
    h('tbody', null, k.adversarial.map(a => h('tr', null,
      h('td', null, h('b', null, a.label), h('div', { class: 'small muted' }, `${a.private.run} vs ${a.known.run}`)),
      h('td', { class: 'num' }, `${pc1(a.private.focal.to)} (${signed(a.private.focal.change.mean, 1)} pp)`),
      h('td', { class: 'num' }, `${pc1(a.known.focal.to)} (${signed(a.known.focal.change.mean, 1)} pp)`),
      h('td', { class: 'num' }, ci(a.knownVsPrivate, ' pp')),
      h('td', { class: 'num' }, `${n1(a.private.claims.focal)} → ${n1(a.known.claims.focal)}`),
      h('td', { class: 'num' }, `${n1(a.private.refusals.others)} → ${n1(a.known.refusals.others)}`))))));
}

/** Section 5: Interactive side-by-side cloth viewer across knowledge conditions. */
function clothGallery(k) {
  let seed = 1;
  const box = h('div', null);
  const seedBtns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => h('button', {
    type: 'button', class: 'seg-btn', onclick: () => { seed = s; draw(); },
  }, `Seed ${s}`));

  const byCell = new Map(k.cells.map(c => [c.run, c]));
  const byAdv = new Map(k.adversarial.flatMap(a => [[a.private.run, a.private], [a.known.run, a.known]]));

  const balancedRuns = [
    ['main', 'Private (default)'],
    ['know-persona', 'Know dispositions'],
    ['know-objective', 'Know objectives'],
    ['know-both', 'Know both'],
    ['persona-off', 'Personas off (private)'],
    ['persona-off-know-objective', 'Personas off + Know obj.'],
  ];
  const advRuns = [
    ['calm-blunt-1', '4 Calm + 1 Blunt (Private)'],
    ['calm-blunt-1-know-persona', '4 Calm + 1 Blunt (Know disp.)'],
    ['calm-blunt-1-t90', '4 Calm + 1 Blunt 90% (Priv.)'],
    ['calm-blunt-1-t90-know-persona', '4 Calm + 1 Blunt 90% (Known)'],
    ['hold-grow-1', '4 Hold + 1 Grow (Private)'],
    ['hold-grow-1-know-objective', '4 Hold + 1 Grow (Know obj.)'],
  ];

  function stripFor(list) {
    const id = `m${String(seed).padStart(3, '0')}`;
    return h('div', { class: 'cloth-row' }, list.map(([runName, label]) => {
      const cell = byCell.get(runName), arm = byAdv.get(runName);
      const sub = cell
        ? `Match ${id} · ${pc(cell.rate)} attained`
        : arm
          ? `Match ${id} · Focal ${pc1(arm.focal.to)}`
          : `Match ${id}`;
      return h('a', { class: 'cloth-item', href: `match?run=${encodeURIComponent(runName)}&id=${id}` },
        h('img', { src: `runs/${runName}/thumbs/${id}-flat.png`, width: 132, height: 218, loading: 'lazy', alt: `${label}, seed ${seed}` }),
        h('div', { class: 'cloth-cap' }, label),
        h('div', { class: 'cloth-sub' }, sub));
    }));
  }

  function draw() {
    seedBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === seed)));
    box.replaceChildren(
      h('h3', null, `Balanced deal on Seed ${seed}: Private vs. Common Knowledge`),
      stripFor(balancedRuns),
      h('h3', null, `Adversarial probes on Seed ${seed}: Private vs. Common Knowledge`),
      stripFor(advRuns));
  }

  draw();
  return h('section', null,
    h('h2', { id: 'cloths' }, '5. Woven cloths side by side across knowledge regimes'),
    h('p', { class: 'sub' }, 'Pick any match seed (1–10) to compare the exact same seat deal and random seed across all six balanced-deal conditions and all six adversarial conditions. Click any cloth to inspect its 26 rounds and probability distributions.'),
    h('div', { class: 'lab-group', style: { marginBottom: '12px' } }, h('span', { class: 'lab-label' }, 'Match seed:'), h('div', { class: 'segmented' }, seedBtns)),
    box);
}

/** Section 6: Cross-wording and cross-model robustness of 1-in-5 group substitutions (from d.steps and d.threshold). */
function generalizationSection(d) {
  if (!d.steps?.length) return null;
  const rows = d.steps;
  const tFive = new Map((d.threshold?.contrasts ?? []).filter(c => c.size === 5).map(c => [`${c.group} → ${c.added}`, c]));
  return h('section', { id: 'generalization' },
    h('h2', null, '6. Robustness across wordings and decision systems (1-in-5 substitutions)'),
    h('p', { class: 'sub' },
      'To verify that group vulnerability is not an artifact of a single wording ("blunt") or a single decision system (Jev), we ran paired 1-in-5 substitutions across three distinct disposition wordings (Calm → Blunt, Calm → Rude, Cooperative → Greedy) and three unpersonied objective contrasts (No objective → Grow, No objective → Give, Hold → Grow) across Jev, OpenAI Decisions, and OpenAI Chat.'),
    h('div', { class: 'scroll' }, h('table', { class: 'grid' },
      h('thead', null, h('tr', null,
        h('th', null, '1-in-5 substitution contrast'),
        h('th', null, 'Decision system'),
        h('th', { class: 'num' }, 'Focal share (k=0 → k=1)'),
        h('th', { class: 'num' }, 'Paired focal shift (95% CI)'),
        h('th', { class: 'num' }, 'Each neighbour shift'),
        h('th', { class: 'num' }, 'Focal claims'),
        h('th', { class: 'num' }, 'Neighbour refusals'),
        h('th', { class: 'num' }, 'At 90% threshold (Jev)'))),
      h('tbody', null, rows.map(s => {
        const t90 = s.system === 'jev' ? tFive.get(s.contrast) : null;
        return h('tr', null,
          h('td', { class: 'strong' }, s.contrast),
          h('td', null, s.systemName),
          h('td', { class: 'num' }, `${pc1(s.focal.from)} → ${pc1(s.focal.to)}`),
          h('td', { class: 'num' }, ci(s.focal.change, ' pp')),
          h('td', { class: 'num' }, ci(s.others.change, ' pp')),
          h('td', { class: 'num' }, n1(s.claims.focal)),
          h('td', { class: 'num' }, n1(s.refusals.others)),
          h('td', { class: 'num' }, t90 ? `${pc1(t90.raised.mean)} (${signed(t90.difference.mean, 1)} pp vs 46%)` : '–'));
      })))));
}

/** Section 7: Positioning in the multi-agent literature & practical takeaways for system builders. */
function literatureSection(d) {
  const b = d.benchmark, k = d.knowledge;
  const growS = b?.objectives.find(o => o.key === 'grow')?.split, giveS = b?.objectives.find(o => o.key === 'give')?.split;
  const pLo = growS && giveS ? fmt(Math.min(growS.persona, giveS.persona), 0) : '52', pHi = growS && giveS ? fmt(Math.max(growS.persona, giveS.persona), 0) : '60';
  const oLo = growS && giveS ? fmt(Math.min(growS.objective, giveS.objective), 0) : '15', oHi = growS && giveS ? fmt(Math.max(growS.objective, giveS.objective), 0) : '26';
  const cb46 = k?.adversarial.find(a => a.key === 'calmBlunt46');
  const tBlunt = d.threshold?.contrasts.find(c => c.size === 5 && c.added === 'Blunt'), tRude = d.threshold?.contrasts.find(c => c.size === 5 && c.added === 'Rude');

  const paradigms = [
    [
      'Open-ended social role-play',
      'Sotopia (Zhou et al., ICLR 2024); Concordia (Vezhnevets et al., 2023–2024)',
      'Free-form natural language dialogue',
      'LLM-as-a-judge (0–10 rubric)',
      'Rich open-ended dialogue, but assertive prose can confound LLM-judge goal scores; no exact option probability readout.',
    ],
    [
      'Repeated 2×2 matrix games',
      'Akata et al. (Nature Human Behaviour, 2025); Homo Silicus (Horton, 2023)',
      'Binary/scalar matrix choice (C/D)',
      'Exact payoff matrix',
      'Clean game-theoretic payoffs, but no spatial topology, no choice of which neighbour to target, and no concurrent collaborative vs. zero-sum goals.',
    ],
    [
      'Macro commons & negotiation',
      'GovSim (Piatti et al., NeurIPS 2024); Abdelnabi et al. (NeurIPS 2024)',
      'Free-form chat + extraction/deal',
      'Survival / utility thresholds',
      'Tests commons collapse and malicious stakeholders, but does not cross orthogonal affective personas against explicit goals or run within-match persuasion RCTs.',
    ],
    [
      'LoomBench (this work)',
      '102 runs · 5 agents · 26 rounds · 7 controlled switches',
      'Code-enumerated legal options + full probability distribution',
      'Deterministic 0–100 rank/share/design state (no LLM judge)',
      'Isolates persona vs. objective variance, k = 0..5 contagion, within-match peer persuasion RCT (5,436 decisions), rule caps (46% vs 90%), and common knowledge (--know).',
    ],
  ];

  const takeaways = [
    [
      '1. Separate style personas from decision-making prompts',
      `In contested multi-agent settings, one-sentence affective personas explain ${pLo}–${pHi}% of score variance vs. ${oLo}–${oHi}% for explicit task instructions. If an agent needs a conversational voice, apply it in a formatting pass after the action is chosen rather than inside the decision prompt.`,
    ],
    [
      '2. Audit environmental caps before declaring an agent safe',
      tBlunt && tRude
        ? `Under the default 46% rule cap, a blunt agent (${pc1(tBlunt.rules.mean)}) and a rude agent (${pc1(tRude.rules.mean)}) look indistinguishable. Lifting the cap to 90% separates them by ${signed(d.threshold.gap.raised.mean, 1)} pp (${pc1(tBlunt.raised.mean)} vs. ${pc1(tRude.raised.mean)}). Environment guardrails often mask severe disposition-driven extraction.`
        : 'Environment caps can mask large differences between moderately assertive and hyper-extractive agent dispositions.',
    ],
    [
      '3. Prompt transparency (--know) is used opportunistically, not defensively',
      cb46
        ? `Disclosing peer objectives redirects claims from Hold to Give, and cuts wasted claims when personas are off. Yet disclosing that a neighbour is blunt (${pc1(cb46.private.focal.to)} → ${pc1(cb46.known.focal.to)}, ${n1(cb46.known.refusals.others)} calm refusals) or Grow never triggers defensive refusal from cooperative peers. Protecting a group requires explicit refusal rules or sanction mechanisms.`
        : 'Disclosing peer traits and goals redirects claims toward willing givers but does not cause cooperative agents to refuse an aggressor.',
    ],
    [
      '4. Evaluate models across orthogonal switches, not a single group score',
      'Models that tie near 41–50% in the default 5-agent group fail for opposite reasons when switches are flipped: Jev suffers persona hijack (−30 pp vs personas off) despite 93% solo agency, whereas GPT Decisions is immune to persona drift (0 pp) but exhibits high uninstructed restlessness (5.0 claims/agent when calm) and fails Hold.',
    ],
  ];

  return h('section', { id: 'literature' },
    h('h2', null, '7. Positioning in the multi-agent literature & engineering takeaways'),
    h('p', { class: 'sub' },
      'LoomBench bridges the gap between open-ended role-play sandboxes (which rely on LLM judges over free text) and 2×2 matrix games (which lack spatial targeting and mixed-motive goals). By having code own the state and enumerate legal actions while reading the model\'s probability distribution over options, every score is deterministic and every behavioural mechanism can be isolated one switch at a time.'),
    h('div', { class: 'scroll' }, h('table', { class: 'grid' },
      h('thead', null, h('tr', null,
        h('th', null, 'Evaluation paradigm'),
        h('th', null, 'Representative works'),
        h('th', null, 'Action interface'),
        h('th', null, 'Scoring mechanism'),
        h('th', null, 'What it captures vs. leaves open'))),
      h('tbody', null, paradigms.map(([p, ref, act, sc, note]) => h('tr', null,
        h('td', { class: 'strong' }, p),
        h('td', null, ref),
        h('td', null, act),
        h('td', null, sc),
        h('td', null, note)))))),
    h('h3', { style: { marginTop: '24px' } }, 'Four practical takeaways for multi-agent system builders'),
    h('div', { class: 'findings-grid' }, takeaways.map(([title, body]) => h('div', { class: 'finding-card' },
      h('div', { class: 'finding-title' }, title),
      h('p', { class: 'finding-body' }, body)))));
}

async function start() {
  const page = document.getElementById('page');
  const d = await getJSON('api/overview.json');
  const k = d.knowledge;

  page.replaceChildren(
    topbar('groups'),
    h('h1', null, 'Group Dynamics Lab & Common Knowledge Study'),
    h('p', { class: 'lede' },
      'Inspect the exact system prompts, CLI commands, side-by-side woven cloths, and empirical tables across LoomBench\'s group composition and common knowledge (--know) experiments.'),
    k ? interactiveLab(d) : null,
    k ? h('section', { id: 'study' },
      clothGallery(k),
      h('h2', { id: 'balanced' }, '1. Balanced deal across knowledge regimes (Designs 1–11)'),
      h('p', { class: 'sub' },
        `Using the --know switch, we ran ${k.cells.length} balanced-deal conditions on Match Designs 1–${k.designs} and ${k.adversarial.length} paired adversarial probes (10 seeds each) under Jev, disclosing every neighbour's disposition (--know persona), objective (--know objective), or both (--know both).`),
      headlineCards(k),
      balancedTable(k),
      h('h2', { id: 'targeting' }, '2. Directional targeting: who gets claimed from, yielded to, and refused?'),
      h('p', { class: 'sub' },
        'Tracking the objective of the neighbour on the receiving end of every executed claim and every top-choice push, yield, and refusal reveals why Hold scores improve when objectives are public—and why boundary conflict intensifies around Grow seats.'),
      targetingSection(k),
      h('h2', { id: 'personas' }, '3. How public dispositions shift share across personas'),
      h('p', { class: 'sub' }, (() => {
        const priv = k.cells.find(c => c.key === 'private'), kPer = k.cells.find(c => c.key === 'persona');
        const outP = k.personas.find(p => p.key === 'outgoing'), anxP = k.personas.find(p => p.key === 'anxious'), blP = k.personas.find(p => p.key === 'blunt');
        const blVals = blP ? [blP.private, blP.persona, blP.objective, blP.both] : [0];
        return `When dispositions are disclosed (--know persona), total concessions drop by ${signed(k.diffs.personaVsPrivate.concessions.mean, 1)} per agent (${n1(priv.concessions)} → ${n1(kPer.concessions)}), outgoing agents surge from ${pc1(outP.private)} to ${pc1(outP.persona)} mean share, anxious agents fall from ${pc1(anxP.private)} to ${pc1(anxP.persona)}, and blunt agents dominate every regime (${pc1(Math.min(...blVals))}–${pc1(Math.max(...blVals))}).`;
      })()),
      personaShiftSection(k),
      h('h2', { id: 'adversarial' }, '4. Adversarial probes: does knowing who the aggressor is protect the group?'),
      h('p', { class: 'sub' },
        'A natural hypothesis is that cooperative or defensive agents are exploited only because they do not know their neighbour is blunt or instructed to Grow. Across all three paired experiments, disclosing dispositions or objectives fails to trigger defensive refusals.'),
      adversarialSection(k),
      generalizationSection(d),
      literatureSection(d),
    ) : null,
    h('p', { class: 'small muted', style: { marginTop: '36px' } },
      'Every number on this page is computed live from the run records in ', h('code', null, 'runs/'), '. Use the sub-navigation above to browse ',
      h('a', { href: 'results' }, 'All Runs & Cloths'), ', ',
      h('a', { href: 'controls' }, 'Switch Contrasts'), ', ',
      h('a', { href: 'mix' }, 'k = 0..5 Sweeps'), ', or ',
      h('a', { href: 'peers' }, 'Peer Persuasion RCT'), '.'),
  );
}

start().catch(e => {
  document.getElementById('page').replaceChildren(topbar('groups'), h('h1', null, 'Group Dynamics'), h('p', { class: 'lede' }, `Could not load data: ${e.message}.`));
});
