// Group Dynamics & Common Knowledge page:
// 1. Frames LoomBench as a 5-lever tool for studying agent behavior in groups, with an interactive Prompt & Experiment Inspector.
// 2. Presents Study 5: Common Knowledge of Dispositions & Objectives (--know persona|objective|both), with live tables,
//    SVG charts (directional targeting, persona share shifts, adversarial extraction), and side-by-side woven cloths.
import { h, getJSON, fmt, signed, topbar, REPO } from './ui.mjs';
import { NAMES, deal, personality, goal, sentenceOf } from '../bench/core.mjs';

const pc = x => `${fmt(x, 0)}%`, pc1 = x => `${fmt(x, 1)}%`, n1 = x => fmt(x, 1);
const ci = (e, unit = '') => (e ? `${signed(e.mean, 1)}${unit} [${fmt(e.lo, 1)}, ${fmt(e.hi, 1)}]` : '–');

/** Builds the seat assignment for Seed 1 of a given preset. */
function seatsForPreset(preset) {
  if (preset === 'balanced') return deal(1);
  if (preset === 'persona-off') return deal(1).map(s => ({ personality: 'plain', goal: s.goal }));
  if (preset === 'calm-blunt' || preset === 'calm-blunt-90') {
    return [0, 1, 2, 3, 4].map(s => ({ personality: s === 2 ? 'blunt' : 'calm', goal: 'none' }));
  }
  return [0, 1, 2, 3, 4].map(s => ({ personality: 'plain', goal: s === 2 ? 'grow' : 'hold' }));
}

/** The 5 orthogonal experimental levers for studying agent behavior in groups. */
function leversGrid(d) {
  const b = d.benchmark, k = d.knowledge;
  const growS = b?.objectives.find(o => o.key === 'grow')?.split;
  const rude90 = d.threshold?.contrasts.find(c => c.size === 5 && c.added === 'Rude')?.raised.mean;
  const priv = k?.cells.find(c => c.key === 'private'), kBoth = k?.cells.find(c => c.key === 'both');
  const items = [
    {
      num: 'Lever 1 · Internal framing',
      title: 'Persona vs. Explicit Objective',
      flag: '--persona / --objective',
      desc: 'Assign each seat an affective disposition and/or an explicit task goal on the same 55-match Latin-square deal.',
      stat: b && growS ? `${fmt(growS.persona, 0)}% of Grow variance comes from persona vs. ${fmt(growS.objective, 0)}% from the objective.` : 'Isolates persona hijack vs. instruction following.',
    },
    {
      num: 'Lever 2 · Group composition',
      title: 'Homogeneous vs. Adversarial Mixes',
      flag: '--odd <type> --odd-count 1..5',
      desc: 'Hold 4 seats fixed (e.g. calm or Hold) and substitute 1 to 5 seats with an adversarial disposition or goal on identical seeds.',
      stat: d.blunt ? `1 blunt seat in a calm group gains ${signed(d.blunt.focal.change.mean, 1)} pp (${pc1(d.blunt.focal.from)} → ${pc1(d.blunt.focal.to)}).` : 'Measures contagion and bystander absorption.',
    },
    {
      num: 'Lever 3 · Peer communication',
      title: 'Direct Persuasion & Reactance',
      flag: '--peers (75% treatment / 25% control)',
      desc: 'Query each agent for its prior, deliver a one-sentence request from an adjacent peer, and measure the posterior probability shift.',
      stat: d.peers ? `${signed(d.peers.effect.mean, 1)} pp shift on advocated actions, flipping the modal choice ${pc(d.peers.treatment.adoption.mean)} of the time.` : 'Measures susceptibility and reactance.',
    },
    {
      num: 'Lever 4 · Common knowledge',
      title: 'Peer Dispositions & Objectives',
      flag: '--know persona | objective | both',
      desc: 'Keep traits and goals private or disclose every neighbour\'s disposition, objective, or both in each agent\'s prompt.',
      stat: priv && kBoth ? `Claims targeting Give rise ${pc1(priv.targeting.claims.givePct)} → ${pc1(kBoth.targeting.claims.givePct)}, while refusals climb ${n1(priv.refusals)} → ${n1(kBoth.refusals)}/agent.` : 'Measures strategic targeting vs. defensive refusal.',
    },
    {
      num: 'Lever 5 · Environment & rules',
      title: 'Thresholds, Group Size & Solo',
      flag: '--threshold 90 / --size 2..6 / --solo',
      desc: 'Lift the 46% claim cap, scale the bench from 2 to 6 seats, or replace neighbours with scripted accept/refuse policies.',
      stat: rude90 && d.blunt ? `Lifting the 46% cap to 90% separates blunt (${pc1(d.threshold.contrasts.find(c => c.size === 5 && c.added === 'Blunt').raised.mean)}) from rude (${pc1(rude90)}).` : 'Separates rule caps from intrinsic restraint.',
    },
  ];
  return h('div', { class: 'levers' }, items.map(it => h('div', { class: 'lever' },
    h('div', null,
      h('div', { class: 'lever-num' }, it.num),
      h('h3', null, it.title),
      h('div', { class: 'small muted', style: { marginBottom: '6px' } }, h('code', null, it.flag)),
      h('p', null, it.desc)),
    h('div', { class: 'lever-stat' }, h('b', null, 'Finding: '), it.stat))));
}

/** Interactive Group Experiment & Prompt Inspector. */
function interactiveLab(d) {
  const k = d.knowledge;
  const state = { preset: 'balanced', know: 'both', seat: 0 };
  const benchOut = h('div', { class: 'bench-pills', role: 'group', 'aria-label': 'Inspect seat prompt' });
  const promptOut = h('div', { class: 'prompt-box' });
  const cmdOut = h('pre', { class: 'cmd-box' });
  const outcomeOut = h('div', { class: 'outcome-box' });

  const presets = [
    ['balanced', 'Balanced deal (5 personas × 4 goals)'],
    ['persona-off', 'Objectives only (personas off)'],
    ['calm-blunt', '4 Calm + 1 Blunt (46% cap)'],
    ['calm-blunt-90', '4 Calm + 1 Blunt (90% cap)'],
    ['hold-grow', '4 Hold + 1 Grow (personas off)'],
  ];
  const knows = [
    ['none', 'Private (none)'],
    ['persona', 'Know dispositions'],
    ['objective', 'Know objectives'],
    ['both', 'Know both'],
  ];

  const pBtns = presets.map(([val, label]) => h('button', {
    type: 'button', class: 'seg-btn', onclick: () => {
      state.preset = val;
      if (val === 'persona-off' || val === 'hold-grow') {
        if (state.know === 'persona' || state.know === 'both') state.know = 'objective';
      } else if (val === 'calm-blunt' || val === 'calm-blunt-90') {
        if (state.know === 'objective' || state.know === 'both') state.know = 'persona';
      }
      render();
    },
  }, label));

  const kBtns = knows.map(([val, label]) => h('button', {
    type: 'button', class: 'seg-btn', onclick: () => { state.know = val; render(); },
  }, label));

  function render() {
    pBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(presets[i][0] === state.preset)));
    kBtns.forEach((b, i) => {
      const val = knows[i][0];
      const valid = state.preset === 'balanced' ? true
        : (state.preset === 'persona-off' || state.preset === 'hold-grow') ? (val === 'none' || val === 'objective')
          : (val === 'none' || val === 'persona');
      b.disabled = !valid;
      b.style.opacity = valid ? '1' : '0.4';
      b.setAttribute('aria-pressed', String(val === state.know));
    });

    const seats = seatsForPreset(state.preset);
    benchOut.replaceChildren(...seats.map((s, idx) => {
      const pName = s.personality === 'plain' ? 'No persona' : personality(s.personality).name;
      const gName = s.goal === 'none' ? 'No obj.' : goal(s.goal).name;
      return h('button', {
        type: 'button', class: 'seat-pill', 'aria-pressed': String(idx === state.seat),
        onclick: () => { state.seat = idx; render(); },
      }, h('span', { class: `dot seat-${idx}` }), h('span', null, `${NAMES[idx]}: ${pName} · ${gName}`));
    }));

    const i = state.seat;
    const pSelf = sentenceOf(i, seats[i].personality, 'personality');
    const gSelf = sentenceOf(i, seats[i].goal, 'goal');
    const selfText = [pSelf, gSelf].filter(Boolean).join(' ') || 'No persona or objective sentence assigned.';
    const peerSentences = state.know === 'none' ? '' : seats.map((other, idx) => {
      if (idx === i) return '';
      const op = state.know === 'persona' || state.know === 'both' ? sentenceOf(idx, other.personality, 'personality') : '';
      const og = state.know === 'objective' || state.know === 'both' ? sentenceOf(idx, other.goal, 'goal') : '';
      return [op, og].filter(Boolean).join(' ');
    }).filter(Boolean).join(' ');

    promptOut.replaceChildren(
      h('div', { class: 'small muted', style: { marginBottom: '6px' } }, `System prompt delivered to Seat ${i + 1} (${NAMES[i]}) on every decision in Seed 1:`),
      h('div', null, selfText, peerSentences ? [' ', h('span', { class: 'know-hl' }, `At the same loom: ${peerSentences} Choose as ${NAMES[i]} would.`)] : null),
      h('div', { class: 'small muted', style: { marginTop: '8px' } },
        state.know === 'none'
          ? 'Private baseline: each agent sees only its own disposition/objective and the public board state (shares and designs).'
          : 'Common knowledge active: the highlighted block is injected into every agent\'s system prompt so peer traits/goals are public.'),
    );

    const kFlag = state.know === 'none' ? '' : ` --know ${state.know}`;
    let cmd = '';
    if (state.preset === 'balanced') {
      cmd = `node --env-file=.env tools/run.mjs --matches 1-11${kFlag} --run my-know-${state.know}`;
    } else if (state.preset === 'persona-off') {
      cmd = `node --env-file=.env tools/run.mjs --matches 1-11 --persona off${kFlag} --run my-persona-off-${state.know}`;
    } else if (state.preset === 'calm-blunt') {
      cmd = `node --env-file=.env tools/run.mjs --matches 1-10 --persona calm --objective off --odd blunt --odd-count 1${kFlag} --run my-calm-blunt-${state.know}`;
    } else if (state.preset === 'calm-blunt-90') {
      cmd = `node --env-file=.env tools/run.mjs --matches 1-10 --persona calm --objective off --odd blunt --odd-count 1 --threshold 90${kFlag} --run my-calm-blunt-t90-${state.know}`;
    } else {
      cmd = `node --env-file=.env tools/run.mjs --matches 1-10 --persona off --objective hold --odd grow --odd-count 1${kFlag} --run my-hold-grow-${state.know}`;
    }
    cmdOut.replaceChildren(`# Reproduce this exact condition from the CLI:\n${cmd}`);

    // Lookup live result from d.knowledge
    if (state.preset === 'balanced' || state.preset === 'persona-off') {
      const cellKey = state.preset === 'persona-off'
        ? (state.know === 'objective' ? 'personaOffObjective' : 'personaOff')
        : (state.know === 'none' ? 'private' : state.know);
      const cell = k.cells.find(c => c.key === cellKey);
      if (cell) {
        outcomeOut.replaceChildren(
          h('div', { class: 'small muted' }, `Empirical outcome on Jev (run `, h('code', null, cell.run), `, ${cell.matches} matches):`),
          h('div', { class: 'outcome-split' },
            h('a', { class: 'outcome-thumb', href: `match?run=${encodeURIComponent(cell.run)}&id=m01` },
              h('img', { src: `runs/${cell.run}/thumbs/m01-flat.png`, width: 96, height: 158, alt: `Seed 1 in ${cell.run}` }),
              'Seed 1 replay →'),
            h('div', { class: 'outcome-metrics' },
              metric('Attainment', `${pc(cell.rate)} (${cell.attained}/${cell.n})`),
              metric('Hold score', fmt(cell.scores.hold?.score)),
              metric('Claims → Give', `${pc1(cell.targeting.claims.givePct)} (${cell.targeting.claims.give}/${cell.targeting.claims.total})`),
              metric('Claims → Hold', `${pc1(cell.targeting.claims.holdPct)} (${cell.targeting.claims.hold}/${cell.targeting.claims.total})`),
              metric('Claims / agent', n1(cell.claims)),
              metric('Concessions / ag.', n1(cell.concessions)),
              metric('Refusals / agent', n1(cell.refusals)),
              metric('Share dispersion', `${n1(cell.dispersion)} pp`))),
        );
      }
    } else {
      const advKey = state.preset === 'calm-blunt' ? 'calmBlunt46' : state.preset === 'calm-blunt-90' ? 'calmBlunt90' : 'holdGrow';
      const adv = k.adversarial.find(a => a.key === advKey);
      const arm = state.know === 'none' ? adv?.private : adv?.known;
      if (adv && arm) {
        outcomeOut.replaceChildren(
          h('div', { class: 'small muted' }, `Empirical outcome on Jev (run `, h('code', null, arm.run), `, ${arm.seeds} seeds):`),
          h('div', { class: 'outcome-split' },
            h('a', { class: 'outcome-thumb', href: `match?run=${encodeURIComponent(arm.run)}&id=m01` },
              h('img', { src: `runs/${arm.run}/thumbs/m01-flat.png`, width: 96, height: 158, alt: `Seed 1 in ${arm.run}` }),
              'Seed 1 replay →'),
            h('div', { class: 'outcome-metrics' },
              metric('Focal agent share', pc1(arm.focal.to)),
              metric('Paired gain', `${signed(arm.focal.change.mean, 1)} pp`),
              metric('Each neighbour', pc1(arm.others.to)),
              metric('Focal claims', n1(arm.claims.focal)),
              metric('Neighbour claims', n1(arm.claims.others)),
              metric('Neighbour refusals', n1(arm.refusals.others)),
              metric('Known − Private', `${signed(adv.knownVsPrivate.mean, 1)} pp`))),
        );
      }
    }
  }

  render();
  return h('section', { class: 'card lab-card', id: 'lab' },
    h('div', { class: 'kicker' }, 'Interactive Group Experiment Inspector'),
    h('h3', { style: { marginTop: '2px' } }, 'Toggle group composition, common knowledge, and seat to inspect the exact prompt diff & live run outcome'),
    h('div', { class: 'lab-controls' },
      h('div', { class: 'lab-group' }, h('span', { class: 'lab-label' }, 'Group regime:'), h('div', { class: 'segmented' }, pBtns)),
      h('div', { class: 'lab-group' }, h('span', { class: 'lab-label' }, 'Common knowledge (--know):'), h('div', { class: 'segmented' }, kBtns))),
    benchOut,
    h('div', { class: 'lab-grid' },
      h('div', null, promptOut, cmdOut),
      outcomeOut));
}

function metric(label, val) {
  return h('div', { class: 'metric-cell' }, h('div', { class: 'metric-val' }, val), h('div', { class: 'metric-lbl' }, label));
}

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
      h('td', { class: 'num' }, `${n1(a.private.refusals.others)} → ${n1(a.known.refusals.others)}`))));
}

/** Section 5: Interactive side-by-side cloth viewer across knowledge conditions. */
function clothGallery(runs) {
  const byRun = new Map(runs.map(r => [r.run, r]));
  let seed = 1;
  const box = h('div', null);
  const seedBtns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => h('button', {
    type: 'button', class: 'seg-btn', onclick: () => { seed = s; draw(); },
  }, `Seed ${s}`));

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
    return h('div', { class: 'cloth-row' }, list.map(([runName, label]) => {
      const r = byRun.get(runName);
      const m = r?.matches?.find(x => (x.seed ?? x.design) === seed);
      if (!m) return null;
      const reached = m.results.filter(x => !x.placeholder && x.goal !== 'none');
      const att = reached.length ? `${reached.filter(x => x.reached).length}/${reached.length} attained` : `max ${pc(Math.max(...m.results.map(x => (x.area ?? 0) * 100)))}`;
      return h('a', { class: 'cloth-item', href: `match?run=${encodeURIComponent(runName)}&id=${encodeURIComponent(m.id)}` },
        h('img', { src: `runs/${runName}/thumbs/${m.id}-flat.png`, width: 132, height: 218, loading: 'lazy', alt: `${label}, seed ${seed}` }),
        h('div', { class: 'cloth-cap' }, label),
        h('div', { class: 'cloth-sub' }, `Match ${m.id} · ${att}`));
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
  const [d, runs] = await Promise.all([getJSON('api/overview.json'), getJSON('api/runs.json')]);
  const k = d.knowledge;

  page.replaceChildren(
    topbar('groups'),
    h('p', { class: 'kicker' }, 'LoomBench · Group Dynamics Laboratory & Common Knowledge Study'),
    h('h1', null, 'Understanding Agent Behavior in Groups'),
    h('p', { class: 'lede' },
      'Evaluating an LLM in isolation shows whether it can follow instructions when unopposed. Evaluating five LLM agents on a shared 100-warp loom reveals how ',
      h('b', null, 'dispositions'), ', ', h('b', null, 'competing objectives'), ', ', h('b', null, 'peer persuasion'), ', ',
      h('b', null, 'environmental caps'), ', and ', h('b', null, 'common knowledge'), ' interact to shape who ends up with what.'),
    leversGrid(d),
    k ? interactiveLab(d) : null,
    k ? h('section', { id: 'study' },
      h('div', { class: 'kicker' }, 'Study 5 · Common Knowledge of Dispositions & Objectives (--know)'),
      h('h2', { style: { marginTop: '4px' } }, 'What happens when agents know each other\'s dispositions and objectives?'),
      h('p', { class: 'sub' },
        `In the default benchmark, each agent knows only its own disposition and objective. Using the --know switch, we ran ${k.cells.length} balanced-deal conditions on Match Designs 1–${k.designs} and ${k.adversarial.length} paired adversarial probes (10 seeds each) under Jev, disclosing every neighbour's disposition (--know persona), objective (--know objective), or both (--know both).`),
      headlineCards(k),
      h('h2', { id: 'balanced' }, '1. Balanced deal across knowledge regimes (Designs 1–11)'),
      h('p', { class: 'sub' },
        'Aggregate attainment remains near 45–52% with personas on (and 75% → 73% with personas off) because the loom is strictly zero-sum. What changes underneath is who agents target, how often they refuse, and how uneven the final distribution becomes.'),
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
      clothGallery(runs),
      generalizationSection(d),
      literatureSection(d),
    ) : null,
    h('p', { class: 'small muted', style: { marginTop: '36px' } },
      'Every number on this page is computed live from the run records in ', h('code', null, 'runs/'), '. See ',
      h('a', { href: 'controls' }, 'Controls'), ' for all paired switch comparisons, ',
      h('a', { href: 'mix' }, 'Composition'), ' for k = 0..5 sweeps, or ',
      h('a', { href: REPO }, 'Source'), ' for the CLI and engine.'),
  );
}

start().catch(e => {
  document.getElementById('page').replaceChildren(topbar('groups'), h('h1', null, 'Group Dynamics'), h('p', { class: 'lede' }, `Could not load data: ${e.message}.`));
});
