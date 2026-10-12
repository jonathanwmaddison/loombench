// Figure 6 of the Overview: one experiment (five calm agents, then one blunt) under three decision systems. Six panels,
// filled row by row; then the last step's contrast as two slope charts.
//
// Steps (the words of each are in web/index.mjs):
//   -1  the empty panels: titles and zero lines only
//    0  the same matches, three ways: row 1, the changed agent's and each other agent's change in share
//    1  the change in share did not clearly differ: Jev's interval as a band, and the differences between systems
//    2  what was recorded did differ: row 2, the blunt agent's claims and the calm agents' refusals
//    3  nor was the calm group equally still: row 3, its claims and the share it held jointly
//    4  told to give, one system gave: each match with no objective and told to give, as slopes (if the data has it)
//
// Every element is made once, in its state at step -1. `step(i)` then says where each belongs at step i.

const PANELS = [
  ['focal', 'Changed agent: change in share (points)', 'Changed agent, change (pts)', true],
  ['others', 'Each other agent: change in share (points)', 'Other agents, change (pts)', true],
  ['claims', 'Blunt agent: claims per match', 'Blunt agent, claims', false],
  ['refusals', 'Calm agents: refusals each, per match', 'Calm agents, refusals', false],
  ['baseClaims', 'All-calm group: claims per agent', 'Calm group, claims', false],
  ['baseJoint', 'All-calm group: loom held jointly (%)', 'Calm group, held jointly (%)', false],
];
const ZERO = Object.freeze({ mean: 0, lo: 0, hi: 0 });

/** Draws the figure into `stage` from the overview's `data`, and returns { step }. */
export default function mount(stage, data, kit) {
  const { svg, text, scale, to, fade, draw, interval, mark, place, hint, legend, chart, est, fmt, signed, COLOR, SYSTEM_MARKS } = kit;
  const rows = data.systems.rows, versus = data.systems.versus, jev = rows[0];
  const give = ['jev', 'gptd'].map(k => data.steps.find(s => s.system === k && s.contrast === 'No objective → Give')).filter(Boolean);
  const hasLast = give.length === 2;

  const key = legend(rows.map(r => ({ label: r.name, shape: SYSTEM_MARKS[r.system].shape, hue: SYSTEM_MARKS[r.system].hue })));
  stage.append(key);
  const { root, W, H, narrow } = chart(stage, {
    height: (w, tallest) => tallest,
    label: 'Three decision systems on one experiment: the changed agent’s change in share is about the same under each, while what was recorded differs.',
  });

  // ---- view A: six panels, two columns and three rows; a strip under the first row for the differences ----------------
  const pad = 4, gap = narrow ? 16 : 28, colW = (W - 2 * pad - gap) / 2, STRIP = 40, rowH = (H - STRIP) / 3;
  const rowTop = r => r * rowH + (r ? STRIP : 0);
  const A = svg('g'), B = svg('g', { opacity: 0 });
  root.append(A, B);

  const panels = PANELS.map(([key, title, short, sgn], i) => {
    const col = i % 2, r = Math.floor(i / 2), left = pad + col * (colW + gap), top = rowTop(r), right = left + colW;
    // Three rows about 20px apart (never under 15), centred under the title with the zero label beneath them.
    const sp = Math.max(15, Math.min(20, (rowH - 42) / 3)), groupTop = top + 26 + Math.max(0, (rowH - 42 - 3 * sp) / 2);
    const ys = [0, 1, 2].map(k => groupTop + sp / 2 + k * sp), lineTop = groupTop, lineBottom = groupTop + 3 * sp;
    const vals = rows.flatMap(d => [d[key].lo, d[key].hi, d[key].mean]);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), pad8 = 0.08 * (hi - lo);
    const x = scale([lo - pad8, hi + pad8], [left, right - 44]);
    const g = svg('g'), p = { r, band: null, bandLabel: null, items: [] };
    A.append(g);
    g.append(text(narrow ? short : title, { x: left, y: top + 12, class: 't small strong' }));

    if (i === 0) {
      // The band is drawn first, so that it sits behind the marks.
      const bx = x(jev.focal.lo), bw = x(jev.focal.hi) - bx;
      p.band = svg('rect', { x: bx, y: lineTop, width: bw, height: 3 * sp, fill: COLOR.accentSoft, opacity: 0 });
      g.append(p.band);
      if (groupTop - top > 30) {
        const cx = Math.min(Math.max(bx + bw / 2, left + 44), right - 44);
        p.bandLabel = text('Jev’s interval', { x: cx, y: lineTop - 5, 'text-anchor': 'middle', class: 't small mute', opacity: 0 });
        g.append(p.bandLabel);
      }
    }
    g.append(svg('line', { x1: x(0), x2: x(0), y1: lineTop, y2: lineBottom, stroke: COLOR.axis, 'stroke-width': 1 }),
      text('0', { x: x(0), y: lineBottom + 13, 'text-anchor': 'middle', class: 't small mute' }));

    rows.forEach((d, n) => {
      const { shape, hue } = SYSTEM_MARKS[d.system], e = d[key], yy = ys[n];
      const iv = interval(ZERO, { x, y: yy, shape, fill: hue });
      iv.g.style.opacity = '0';
      const num = text(sgn ? signed(e.mean, 1) : fmt(e.mean, 1), { x: right, y: yy + 4, 'text-anchor': 'end', class: 't small', opacity: 0 });
      const hit = hint(svg('rect', { x: left, y: yy - sp / 2, width: colW, height: sp, fill: 'transparent' }), `${d.name}: ${title}: ${est(e, { plus: sgn })}`);
      g.append(iv.g, num, hit);
      p.items.push({ n, e, iv, num });
    });
    return p;
  });

  // The differences from Jev, under the first row of panels.
  const strip = versus.map((v, k) => text(narrow ? `${v.name}: ${est(v.focal)}` : `${v.name}: ${est(v.focal)} points`,
    { x: pad, y: rowH + 14 + 16 * k, class: 't small', opacity: 0 }));
  A.append(...strip);

  // ---- view B: told to give, one slope chart per system -----------------------------------------------------------------
  const slopes = [];
  if (hasLast) {
    const bGap = narrow ? 16 : 28, bW = (W - 2 * pad - bGap) / 2, top = 50, bottom = H - 34;
    const yS = scale([0, 40], [bottom, top]);
    give.forEach((s, k) => {
      const { shape, hue } = SYSTEM_MARKS[s.system];
      const left = pad + k * (bW + bGap), right = left + bW, plotL = left + (k ? 4 : 36), plotR = right - 6, pw = plotR - plotL;
      const xL = plotL + 0.3 * pw, xR = plotL + 0.7 * pw, met = s.pairs.filter(q => q.met).length;
      const item = { lines: [], marks: [], labels: [] };
      B.append(text(s.systemName, { x: left, y: 14, class: 't small strong' }),
        text(`criterion met in ${met} of ${s.seeds}`, { x: left, y: 30, class: 't small' }));
      for (const v of [0, 10, 20, 30, 40]) {
        B.append(svg('line', { x1: plotL, x2: plotR, y1: yS(v), y2: yS(v), stroke: COLOR.hairline, 'stroke-width': 1 }));
        if (!k) B.append(text(`${v}%`, { x: plotL - 8, y: yS(v) + 4, 'text-anchor': 'end', class: 't small' }));
      }
      B.append(text(narrow ? 'none' : 'no objective', { x: xL, y: bottom + 18, 'text-anchor': 'middle', class: 't small' }),
        text(narrow ? 'give' : 'told to give', { x: xR, y: bottom + 18, 'text-anchor': 'middle', class: 't small' }));
      s.pairs.forEach(q => {
        const line = hint(svg('line', { x1: xL, x2: xR, y1: yS(q.focal[0]), y2: yS(q.focal[1]), stroke: COLOR.ink, 'stroke-width': 1.5, opacity: 0.4 }),
          `Match number ${q.seed}: ${q.focal[0]}% with no objective, ${q.focal[1]}% told to give`);
        item.lines.push(line);
        B.append(line);
      });
      // The means: the mark in the system's own shape and hue, its value beside it (above it where the panel is too narrow).
      const from = hint(place(mark(shape, { fill: hue, r: 5.5, opacity: 0 }), xL, yS(s.focal.from)),
        `${s.systemName}, mean final share with no objective: ${fmt(s.focal.from, 1)}%`);
      const to_ = hint(place(mark(shape, { fill: hue, r: 5.5, opacity: 0 }), xR, yS(s.focal.to)),
        `${s.systemName}, mean final share told to give: ${fmt(s.focal.to, 1)}%`);
      const fromLabel = text(`${fmt(s.focal.from, 1)}%`, { x: xL - 10, y: yS(s.focal.from) + 4, 'text-anchor': 'end', class: 't strong', opacity: 0 });
      const toWords = `${fmt(s.focal.to, 1)}%`, toLabel = xR + 10 + 46 <= right
        ? text(toWords, { x: xR + 10, y: yS(s.focal.to) + 4, class: 't strong', opacity: 0 })
        : text(toWords, { x: xR, y: yS(s.focal.to) - 11, 'text-anchor': 'middle', class: 't strong', opacity: 0 });
      item.marks.push(from, to_);
      item.labels.push(fromLabel, toLabel);
      B.append(from, to_, fromLabel, toLabel);
      slopes.push(item);
    });
  }
  root.append(A, B);

  return {
    step(i) {
      const level = Math.min(i, 3), depth = level < 0 ? -1 : Math.max(0, level - 1);
      fade(A, i < 4, { duration: 350, delay: i < 4 ? 350 : 0 });
      fade(B, i >= 4, { duration: 350, delay: i >= 4 ? 350 : 0 });

      panels.forEach(p => {
        const on = p.r <= depth;
        p.items.forEach(({ n, e, iv, num }) => {
          if (on) {
            iv.move(e, { duration: 700, delay: n * 120 });
            fade(iv.g, true, { duration: 500, delay: n * 120 });
            fade(num, true, { duration: 300, delay: n * 120 + 500 });
          } else {
            iv.move(ZERO, { duration: 500 });
            fade(iv.g, false, { duration: 350 });
            fade(num, false, { duration: 200 });
          }
        });
        if (p.band) {
          to(p.band, { opacity: level >= 1 ? 0.3 : 0 }, { duration: 500, delay: level >= 1 ? 600 : 0 });
          if (p.bandLabel) fade(p.bandLabel, level >= 1, { duration: 400, delay: level >= 1 ? 600 : 0 });
        }
      });
      strip.forEach(t => fade(t, level >= 1, { duration: 400, delay: level >= 1 ? 600 : 0 }));

      const shown = i >= 4;
      // The last view has only the systems that ran its contrast.
      rows.forEach((r, n) => { key.items[n].hidden = shown && !give.some(g => g.system === r.system); });
      slopes.forEach(({ lines, marks, labels }) => {
        lines.forEach((line, n) => draw(line, shown, shown ? { duration: 600, delay: 350 + n * 50 } : { duration: 300 }));
        [...marks, ...labels].forEach(el => to(el, { opacity: shown ? 1 : 0 }, { duration: 400, delay: shown ? 1400 : 0 }));
      });
    },
  };
}
