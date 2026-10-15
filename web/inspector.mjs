// Interactive Group Experiment & Prompt Inspector: shared by the Overview (/) and the Lab & Runs page (/groups).
import { h, fmt, signed } from './ui.mjs';
import { NAMES, deal, personality, goal, sentenceOf } from '../bench/core.mjs';

const pc = x => `${fmt(x, 0)}%`, pc1 = x => `${fmt(x, 1)}%`, n1 = x => fmt(x, 1);

function seatsForPreset(preset) {
  if (preset === 'balanced') return deal(1);
  if (preset === 'persona-off') return deal(1).map(s => ({ personality: 'plain', goal: s.goal }));
  if (preset === 'calm-blunt' || preset === 'calm-blunt-90') {
    return [0, 1, 2, 3, 4].map(s => ({ personality: s === 2 ? 'blunt' : 'calm', goal: 'none' }));
  }
  return [0, 1, 2, 3, 4].map(s => ({ personality: 'plain', goal: s === 2 ? 'grow' : 'hold' }));
}

function metric(label, val) {
  return h('div', { class: 'metric-cell' }, h('div', { class: 'metric-val' }, val), h('div', { class: 'metric-lbl' }, label));
}

export function interactiveLab(d) {
  const k = d.knowledge;
  if (!k) return null;
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

    if (state.preset === 'balanced' || state.preset === 'persona-off') {
      const cellKey = state.preset === 'persona-off'
        ? (state.know === 'objective' ? 'personaOffObjective' : 'personaOff')
        : (state.know === 'none' ? 'private' : state.know);
      const cell = k.cells.find(c => c.key === cellKey);
      if (cell) {
        outcomeOut.replaceChildren(
          h('div', { class: 'small muted' }, `Empirical outcome on Jev (run `, h('code', null, cell.run), `, ${cell.matches} matches):`),
          h('div', { class: 'outcome-split' },
            h('a', { class: 'outcome-thumb', href: `match?run=${encodeURIComponent(cell.run)}&id=m001` },
              h('img', { src: `runs/${cell.run}/thumbs/m001-flat.png`, width: 88, height: 145, alt: `Seed 1 in ${cell.run}` }),
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
            h('a', { class: 'outcome-thumb', href: `match?run=${encodeURIComponent(arm.run)}&id=m001` },
              h('img', { src: `runs/${arm.run}/thumbs/m001-flat.png`, width: 88, height: 145, alt: `Seed 1 in ${arm.run}` }),
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
  return h('div', { class: 'card lab-card', id: 'lab' },
    h('div', { class: 'kicker', style: { marginBottom: '4px' } }, 'Interactive Group Experiment & Prompt Inspector'),
    h('div', { class: 'small muted', style: { marginBottom: '12px' } }, 'Toggle group composition, common knowledge (--know), and seat to inspect the exact system prompt diff, CLI command, and live run outcome:'),
    h('div', { class: 'lab-controls' },
      h('div', { class: 'lab-group' }, h('span', { class: 'lab-label' }, 'Group regime:'), h('div', { class: 'segmented' }, pBtns)),
      h('div', { class: 'lab-group' }, h('span', { class: 'lab-label' }, 'Common knowledge (--know):'), h('div', { class: 'segmented' }, kBtns))),
    benchOut,
    h('div', { class: 'lab-grid' },
      h('div', null, promptOut, cmdOut),
      outcomeOut));
}
