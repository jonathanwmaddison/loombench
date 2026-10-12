// Figure 8 of the Overview: one decision's options before and after one message, the influence of messages across every
// discordant decision, and the influence by the receiver's persona.
//
// Steps (the words of each are in web/index.mjs):
//   -1  the empty view of one decision
//    0  asked twice: each option's prior probability
//    1  one decision: the bars move to the posterior, and the prior is marked by a tick
//    2  every discordant decision: influence as a histogram, the message above the baseline, the query repeated below
//    3  from unlikely to first choice: how often the advocated action became the most likely, with and without the message
//    4  by receiver persona: mean influence, and how often each receiver moved away from the advocated action
//
// Every element is made once, in its state at step -1. `step(i)` then says where each belongs at step i, and the kit
// moves it there from wherever it is, so any step can follow any other.

/** Draws the figure into `stage` from the overview's `data`, and returns { step }. */
export default function mount(stage, data, kit) {
  const { svg, text, scale, to, fade, count, hint, interval, est, chart, axisX, fmt, signed, COLOR } = kit;
  const p = data.peers, { example, histogram: hist } = p;
  const { root, W, H, narrow } = chart(stage, {
    height: (w, tallest) => tallest,
    label: `One decision and its options before and after a message; the influence of messages across ${fmt(p.discordant)} discordant decisions; and influence by persona.`,
  });
  const M = narrow ? 16 : 24;
  const A = svg('g'), B = svg('g', { opacity: 0 }), C = svg('g', { opacity: 0 });
  root.append(A, B, C);

  // ---- A: one decision -----------------------------------------------------------------------------------------------
  const X0 = M, X = scale([0, 100], [X0, W - M - 46]), top = 40, end = H - 42, rh = (end - top) / example.options.length;
  const title = text(`${example.receiver}'s options`, { x: M, y: 16, class: 't small strong', opacity: 0 });
  const state = text('prior', { x: W - M, y: 16, 'text-anchor': 'end', class: 't small', opacity: 0 });
  const influence = text(`influence: ${signed(example.influence, 0)} percentage points`, { x: M, y: H - 14, class: 't strong', opacity: 0 });
  A.append(title, state, influence);
  // A value sits after its bar, or after the prior tick when that tick lies just beyond the bar's end.
  const labelAt = (v, prior) => (prior > v && X(prior) - X(v) < 36 ? X(prior) : X(v)) + 8;
  const rows = example.options.map((o, n) => {
    const y0 = top + n * rh, words = y0 + 14, mid = y0 + 26;
    const row = {
      o,
      words: text(o.words, { x: M, y: words, class: o.advocated ? 't strong' : 't', opacity: 0 }),
      tag: text(o.advocated ? `advocated by ${example.sender}` : '', { x: W - M, y: words, 'text-anchor': 'end', class: 't small', opacity: 0 }),
      base: svg('line', { x1: X0, x2: X(100), y1: mid, y2: mid, stroke: COLOR.hairline, 'stroke-width': 1, opacity: 0 }),
      bar: svg('rect', { x: X0, y: mid - 6, width: 0, height: 12, rx: 3, fill: o.advocated ? COLOR.accent : COLOR.axis }),
      tick: svg('rect', { x: X(o.prior) - 1, y: mid - 9, width: 2, height: 18, fill: COLOR.ink, opacity: 0 }),
      // A ring of the surface colour under each value, so the scale's hairline does not run through it.
      value: text('', { x: labelAt(0, o.prior), y: mid + 4, class: 't small strong', opacity: 0, stroke: COLOR.surface, 'stroke-width': 4, 'paint-order': 'stroke' }),
    };
    A.append(row.words, row.tag, row.base, row.bar, row.tick, row.value,
      hint(svg('rect', { x: M, y: y0, width: W - 2 * M, height: rh, fill: 'transparent' }), `${o.words}: prior ${o.prior}%, posterior ${o.posterior}%`));
    return row;
  });

  // ---- B: every discordant decision ----------------------------------------------------------------------------------
  const bl = M, br = W - M, btop = 10, bottom = H - 44, mid = (btop + bottom) / 2, x = scale([-100, 100], [bl, br]);
  const bin = hist.step, bw = x(hist.from + bin) - x(hist.from), nT = p.treatment.n, nC = p.control.n;
  // One scale for both halves: the largest share of either arm fills 92% of a half.
  const most = Math.max(...hist.treatment.map(c => c / nT), ...hist.control.map(c => c / nC)), k = (0.92 * (mid - btop)) / most;
  const axes = svg('g');
  axisX(axes, x, [-100, -50, 0, 50, 100], { y: bottom, format: v => signed(v) });
  axes.append(svg('line', { x1: bl, x2: br, y1: mid, y2: mid, stroke: COLOR.axis, 'stroke-width': 1 }),
    svg('line', { x1: bl, x2: br, y1: bottom, y2: bottom, stroke: COLOR.axis, 'stroke-width': 1 }),
    text(narrow ? 'influence (points)' : 'influence on the advocated action (points)', { x: (bl + br) / 2, y: bottom + 32, 'text-anchor': 'middle', class: 't small mute' }));
  B.append(axes);
  const histBars = (counts, n, upper) => counts.map((c, b) => {
    const lo = hist.from + bin * b, share = c / n;
    const bar = svg('rect', { x: x(lo) + 1, y: mid, width: bw - 2, height: 0, rx: 2, fill: upper ? COLOR.accent : COLOR.axis });
    hint(bar, `${signed(lo)} to ${signed(lo + bin)} points: ${fmt(100 * share, 1)}% of decisions ${upper ? 'with the message' : 'with the query repeated'}`);
    B.append(bar);
    return { bar, b, h: share * k };
  });
  const tBars = histBars(hist.treatment, nT, true), cBars = histBars(hist.control, nC, false);
  const tm = p.treatment.influence.mean, cm = p.control.influence.mean;
  B.append(text(narrow ? 'message delivered' : 'message delivered (treatment)', { x: bl, y: btop + 12, class: 't small strong' }),
    text(narrow ? 'query repeated' : 'query repeated (control)', { x: bl, y: bottom - 4, class: 't small strong' }));
  const means = [
    svg('line', { x1: x(tm), x2: x(tm), y1: btop, y2: mid, stroke: COLOR.ink, 'stroke-width': 2, opacity: 0 }),
    text(`mean ${signed(tm, 1)}`, { x: x(tm) + 6, y: btop + 12, class: 't strong', opacity: 0 }),
    svg('line', { x1: x(cm), x2: x(cm), y1: mid, y2: bottom, stroke: COLOR.ink, 'stroke-width': 2, opacity: 0 }),
    text(`mean ${signed(cm, 1)}`, { x: x(cm) + 6, y: bottom - 4, class: 't strong', opacity: 0 }),
  ];
  // The inset of step 3, in the empty upper-left of the upper half: one scale, 100% the inset's width.
  const ix = x(-100), iw = x(-22) - ix, ad = p.treatment.adoption.mean, cad = p.control.adoption.mean;
  const insetTitle = text(narrow ? 'became most likely' : 'became the most likely action', { x: ix, y: btop + 44, class: 't small strong', opacity: 0 });
  const inset = [
    { words: text(`${fmt(ad)}% with the message`, { x: ix, y: btop + 64, opacity: 0 }), bar: svg('rect', { x: ix, y: btop + 70, width: 0, height: 10, rx: 3, fill: COLOR.accent }), share: ad },
    { words: text(narrow ? `${fmt(cad)}% without` : `${fmt(cad)}% with the query repeated`, { x: ix, y: btop + 98, opacity: 0 }), bar: svg('rect', { x: ix, y: btop + 104, width: 0, height: 10, rx: 3, fill: COLOR.axis }), share: cad },
  ];
  B.append(insetTitle, ...means, ...inset.flatMap(({ words, bar }) => [words, bar]));

  // ---- C: by receiver persona ----------------------------------------------------------------------------------------
  const left = narrow ? 100 : 118, cR = W - M - 54, ctop = 34, cbottom = H - 40, rowH = (cbottom - ctop) / p.receivers.length;
  const recs = [...p.receivers].sort((a, b) => b.influence.mean - a.influence.mean);
  const lo = Math.floor(Math.min(-10, ...recs.map(r => r.influence.lo)) / 10) * 10, hi = Math.ceil(Math.max(60, ...recs.map(r => r.influence.hi)) / 10) * 10;
  const xc = scale([lo, hi], [left, cR]);
  axisX(C, xc, [0, 20, 40, 60], { y: cbottom, grid: [ctop, cbottom] });
  C.append(svg('line', { x1: xc(0), x2: xc(0), y1: ctop, y2: cbottom, stroke: COLOR.axis, 'stroke-width': 1 }),
    text('mean influence (points)', { x: (left + cR) / 2, y: cbottom + 32, 'text-anchor': 'middle', class: 't small mute' }),
    text('moved away', { x: W - M, y: ctop - 12, 'text-anchor': 'end', class: 't small mute' }));
  const rowsC = recs.map((r, n) => {
    const y = ctop + rowH * (n + 0.5), blunt = r.key === 'blunt';
    const iv = interval({ mean: 0, lo: 0, hi: 0 }, { x: xc, y, fill: blunt ? COLOR.accent : COLOR.ink2 });
    const rt = text(`${fmt(r.reactance)}%`, { x: W - M, y: y + 4, 'text-anchor': 'end', class: blunt ? 't small strong' : 't small', opacity: 0 });
    C.append(text(r.name, { x: left - 12, y: y + 4, 'text-anchor': 'end', class: blunt ? 't strong' : 't' }), iv.g, rt,
      hint(svg('rect', { x: M, y: y - rowH / 2, width: W - 2 * M, height: rowH, fill: 'transparent' }),
        `${r.name} receivers: mean influence ${est(r.influence)} points; moved more than 5 points away in ${fmt(r.reactance)}% of decisions`));
    return { r, iv, rt, n };
  });

  return {
    step(i) {
      const showA = i <= 1, showB = i === 2 || i === 3, showC = i === 4;
      fade(A, showA, { duration: 350, delay: showA ? 350 : 0 });
      fade(B, showB, { duration: 350, delay: showB ? 350 : 0 });
      fade(C, showC, { duration: 350, delay: showC ? 350 : 0 });

      // A: the prior, then the posterior after the message.
      state.textContent = i === 1 ? (narrow ? 'after the message' : `posterior, after ${example.sender}'s message`) : 'prior';
      fade(title, i >= 0, { duration: 400 });
      fade(state, i >= 0, { duration: 400 });
      fade(influence, i === 1, { duration: 400, delay: 1300 });
      rows.forEach((row, n) => {
        const { o } = row, live = i === 0 || i === 1, v = live ? (i === 1 ? o.posterior : o.prior) : 0;
        const wait = i === 0 ? { duration: 800, delay: n * 80 } : i === 1 ? { duration: 900, delay: o.advocated ? 300 : 0 } : { duration: 350 };
        to(row.bar, { width: X(v) - X0 }, wait);
        count(row.value, v, { suffix: '%', ...wait });
        to(row.value, { x: labelAt(v, o.prior) }, wait);
        fade(row.value, live, { duration: 300 });
        fade(row.words, i >= 0, { duration: 400 });
        fade(row.tag, i >= 0, { duration: 400 });
        fade(row.base, i >= 0, { duration: 400 });
        fade(row.tick, i === 1, { duration: 400, delay: i === 1 ? 900 : 0 });
      });

      // B: influence across every discordant decision, each half on its own baseline.
      tBars.forEach(({ bar, b, h }) => to(bar, showB ? { y: mid - h, height: h } : { y: mid, height: 0 },
        showB ? { duration: 700, delay: 350 + 25 * b } : { duration: 350 }));
      cBars.forEach(({ bar, b, h }) => to(bar, { height: showB ? h : 0 }, showB ? { duration: 700, delay: 350 + 25 * b } : { duration: 350 }));
      means.forEach(el => fade(el, showB, { duration: 400, delay: showB ? 1100 : 0 }));
      const ins = i === 3;
      fade(insetTitle, ins, { duration: 500, delay: ins ? 300 : 0 });
      inset.forEach(({ words, bar, share }) => {
        fade(words, ins, { duration: 500, delay: ins ? 300 : 0 });
        to(bar, { width: ins ? (iw * share) / 100 : 0 }, { duration: 800, delay: ins ? 300 : 0 });
      });

      // C: each persona's interval grows from zero, the blunt row last, then its reactance.
      rowsC.forEach(({ r, iv, rt, n }) => {
        iv.move(showC ? r.influence : { mean: 0, lo: 0, hi: 0 }, showC ? { duration: 800, delay: n * 50 } : { duration: 350 });
        fade(rt, showC, { duration: 400, delay: showC ? 1300 : 0 });
      });
    },
  };
}
