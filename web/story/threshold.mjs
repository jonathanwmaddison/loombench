// Figure 5 of the Overview: the claim threshold, and how the final share of one agent answers to it.
//
// Steps (the words of each are in web/index.mjs):
//   -1  the empty plot: the axis and the row labels
//    0  the claim threshold at 46%: one blunt agent and one rude agent, a dot a match at its final share
//    1  the two look alike: the mean of each row, and the rude agent's gap over the blunt one
//    2  the threshold raised to 90%: the line slides and the dots follow it, with the means and counts
//    3  an objective did not respond the same way: the agent told to grow joins the plot
//    4  one match, both ways: the same match woven at each threshold (without the grow row, 3)
//
// Every element is made once, in its state at step -1. `step(i)` then says where each belongs at step i, and the kit
// moves it there from wherever it is, so any step can follow any other.

/** Draws the figure into `stage` from the overview's `data`, and returns { step }. */
export default function mount(stage, data, kit) {
  const { svg, text, scale, to, fade, count, mark, place, hint, est, chart, axisX, dodge, loom, fmt, COLOR } = kit;
  const t = data.threshold;
  const five = t.contrasts.filter(c => c.size === 5);
  const blunt = five.find(c => c.added === 'Blunt'), rude = five.find(c => c.added === 'Rude'), grow = five.find(c => c.added === 'Grow');
  const hasGrow = Boolean(grow), last = hasGrow ? 4 : 3;
  let shown = t.rules; // the threshold the figure shows at this step, read by the hints
  // Words that may cross the threshold line sit on a halo of the figure's surface, so the line does not cut through them.
  const halo = { stroke: COLOR.surface, 'stroke-width': 4, 'paint-order': 'stroke', 'stroke-linejoin': 'round' };

  const { root, W, H, narrow } = chart(stage, {
    height: (w, tallest) => tallest,
    label: `The claim threshold at ${t.rules}% and ${t.raised}%: final shares of one blunt agent and one rude agent over ${blunt.seeds.length} matches.`,
  });
  const left = narrow ? 118 : 156, right = W - (narrow ? 14 : 28), top = narrow ? 36 : 42, bottom = H - 48;
  const x = scale([0, 100], [left, right]), rowH = (bottom - top) / (hasGrow ? 3 : 2), rowY = n => top + rowH * (n + 0.5);
  const labelX = v => Math.min(x(v), W - 6 - (narrow ? 46 : 72)); // the threshold's label, kept inside the figure at the right
  const viewA = svg('g'), viewB = svg('g', { opacity: 0 });
  root.append(viewA, viewB);

  // ---- view A: one strip a row, the final shares of the changed agent ----------------------------------------------
  const axes = svg('g');
  axisX(axes, x, [0, 20, 40, 60, 80, 100], { y: bottom, format: v => `${v}%`, grid: [top, bottom] });
  axes.append(text('final share of the changed agent', { x: right, y: bottom + 34, 'text-anchor': 'end', class: 't small mute' }));
  viewA.append(axes);
  const thresholdLine = hint(svg('line', { x1: x(t.rules), x2: x(t.rules), y1: top, y2: bottom, stroke: COLOR.accent, 'stroke-width': 2, opacity: 0 }),
    () => `Claim threshold: an agent holding ${shown}% of the loom is offered no more claims`);
  const thresholdLabel = text('', { x: labelX(t.rules), y: top - 10, 'text-anchor': 'middle', class: 't small strong', opacity: 0 });
  viewA.append(thresholdLine);

  const specs = [
    { c: blunt, name: 'One blunt agent', short: 'Blunt', from: 0 },
    { c: rude, name: 'One rude agent', short: 'Rude', from: 0 },
    { c: grow, name: 'One agent told to grow', short: 'Told to grow', from: 3 },
  ].filter(s => s.c);
  let base = 0; // the stagger counts the dots of every row before this one
  const lanes = specs.map((s, n) => {
    const c = s.c, seeds = c.seeds, y = rowY(n), xs = { rules: seeds.map(d => x(d.rules)), raised: seeds.map(d => x(d.raised)) };
    const dy = { rules: dodge(xs.rules, 4.5), raised: dodge(xs.raised, 4.5) }, first = base;
    base += seeds.length;
    const dots = seeds.map(d => hint(place(mark('circle', { fill: COLOR.ink2, r: 4.5, opacity: 0 }), x(20), y),
      `Match number ${d.seed}: ${d.rules}% at the rules' threshold, ${d.raised}% with it raised`));
    const meanWords = () => `${s.short} agent: mean final share ${fmt(lane.mean, 1)}%`;
    const tick = hint(svg('line', { x1: x(c.rules.mean), x2: x(c.rules.mean), y1: y - 13, y2: y + 13, stroke: COLOR.ink, 'stroke-width': 2, opacity: 0 }), meanWords);
    const mlabel = hint(text('', { x: x(c.rules.mean), y: y - 19, 'text-anchor': 'middle', class: 't strong', opacity: 0 }), meanWords);
    const label = text(narrow ? s.short : s.name, { x: 8, y: y + 4, opacity: s.from ? 0 : 1 });
    const sub = s.from ? text(`${fmt(c.rules.mean, 1)}% under the rule`, { x: 8, y: y + 20, class: 't small mute', opacity: 0 }) : null;
    // Under the row's name: how many match numbers ended at the threshold.
    const atText = s.from ? null : text('', { x: 8, y: y + 20, class: 't small mute', opacity: 0 });
    const lane = { s, c, y, xs, dy, dots, first, tick, mlabel, label, sub, atText, mean: c.rules.mean };
    viewA.append(tick, ...dots, mlabel, label, ...[sub, atText].filter(Boolean));
    return lane;
  });

  const gapText = text('', { x: narrow ? 8 : left, y: rowY(1) + rowH / 2 + 4, class: narrow ? 't small' : 't', opacity: 0, ...halo });
  viewA.append(gapText, thresholdLabel);

  // ---- view B: one match both ways, two looms side by side --------------------------------------------------------
  const bw = (W - 20) / 2, lt = 30, labels = narrow ? 'share' : 'full';
  const bluntSeat = t.pictured.rules.seats.find(s => s.personaKey === 'blunt').seat;
  const gL = svg('g'), gR = svg('g');
  const looms = [
    loom(gL, t.pictured.rules, { x: 0, y: lt, w: bw, h: H - lt - 4, labels, emphasis: bluntSeat }),
    loom(gR, t.pictured.raised, { x: bw + 20, y: lt, w: bw, h: H - lt - 4, labels, emphasis: bluntSeat }),
  ];
  viewB.append(gL, gR, text(`Threshold ${t.rules}%`, { x: 0, y: lt - 12, class: 't small strong' }),
    text(`Threshold ${t.raised}%`, { x: bw + 20, y: lt - 12, class: 't small strong' }));
  return {
    step(i) {
      const a = Math.min(i, last - 1), raised = a >= 2, on = i === last, key = raised ? 'raised' : 'rules';
      shown = raised ? t.raised : t.rules;
      fade(viewA, !on, { duration: 350, delay: on ? 0 : 350 });
      fade(viewB, on, { duration: 350, delay: on ? 350 : 0 });
      looms.forEach(l => (on ? l.show(l.rounds, { duration: 2600, delay: 350 }) : l.show(0, { duration: 350 })));

      to(thresholdLine, { opacity: a >= 0 ? 1 : 0 }, { duration: 500 });
      to(thresholdLine, { x1: x(shown), x2: x(shown) }, { duration: 900 });
      to(thresholdLabel, { x: labelX(shown), opacity: a >= 0 ? 1 : 0 }, { duration: 900 });
      count(thresholdLabel, shown, { prefix: narrow ? 'threshold ' : 'claim threshold ', suffix: '%', duration: 900 });

      lanes.forEach(ln => {
        const { s, c, y, xs, dy, dots, tick, mlabel, label, sub, atText, first } = ln;
        const visible = a >= s.from, useRaised = raised || s.from > 0, wait = raised && !s.from ? 800 : 0;
        // The marks: a dot slides from where it stood to its value and offset; the rows follow one another.
        c.seeds.forEach((d, j) => {
          to(dots[j], { translateX: xs[key][j], translateY: y + dy[key][j], opacity: visible ? 1 : 0 },
            { duration: 650, delay: raised ? 500 + (first + j) * 60 : (first + j) * 50 });
        });
        // The mean: a tick and its value, lifted above the stack of dots where the stack would hide it.
        const m = useRaised ? c.raised.mean : c.rules.mean, showMean = a >= Math.max(1, s.from);
        ln.mean = m;
        const near = xs[key].map((px, j) => (Math.abs(px - x(m)) < 24 ? dy[key][j] - 4.5 : 0));
        to(tick, { x1: x(m), x2: x(m), opacity: showMean ? 1 : 0 }, { duration: 700, delay: wait });
        to(mlabel, { x: x(m), y: y + Math.min(-13, ...near) - 6, opacity: showMean ? 1 : 0 }, { duration: 700, delay: wait });
        count(mlabel, m, { digits: 1, suffix: '%', duration: 700, delay: wait });
        if (atText) {
          atText.textContent = `${c[key].atThreshold} of ${c.seeds.length} at ${narrow ? '' : 'the '}threshold`;
          fade(atText, a >= 0, { duration: 400, delay: wait });
        }
        fade(label, visible, { duration: 400 });
        if (sub) fade(sub, a >= 3, { duration: 400, delay: 200 });
      });

      // Between the rude row and the grow row.
      gapText.textContent = `rude minus blunt: ${est(a >= 2 ? t.gap.raised : t.gap.rules)} points`;
      fade(gapText, a >= 1, { duration: 400, delay: 300 });
    },
  };
}
