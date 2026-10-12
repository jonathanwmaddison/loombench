// Figure 2 of the Overview: final share by persona under three assignments, then each objective against its baseline.
//
// Steps (the words of each are in web/index.mjs):
//   -1  the empty plot
//    0  no objective: one ring a persona, at its mean final share
//    1  told to grow: a filled circle leaves each ring for the Grow share; the warm row is named and numbered
//    2  told to give: a diamond leaves each ring for the Give share; the blunt row is named and numbered
//    3  the shares give way to attainment: two bars (with an objective, baseline), and each objective's score against its baseline
//
// Every element is made once, in its state at step -1. `step(i)` then says where each belongs at step i, and the kit
// moves it there from wherever it is, so any step can follow any other.

/** Draws the figure into `stage` from the overview's `data`, and returns { step }. */
export default function mount(stage, data, kit) {
  const { svg, text, scale, to, fade, count, mark, place, hint, legend, chart, axisX, fmt, COLOR } = kit;
  const b = data.benchmark, GROW = COLOR.accent, GIVE = '#eb6834';
  const personas = [...b.personas].sort((p, q) => q.none.mean - p.none.mean);

  const key = legend([
    { label: 'no objective', shape: 'ring', hue: COLOR.ink2 }, { label: 'told to grow', shape: 'circle', hue: GROW },
    { label: 'told to give', shape: 'diamond', hue: GIVE }, { label: 'with the objective', shape: 'circle', hue: COLOR.ink },
  ]);
  stage.append(key);
  const { root, W, H, narrow } = chart(stage, {
    height: (width, tallest) => tallest,
    label: `Mean final share by persona with no objective, told to grow and told to give; then attainment: ${fmt(b.withObjective.rate)}% with an objective against ${fmt(b.baseline.rate)}% baseline.`,
  });
  const left = narrow ? 92 : 118, right = W - 44, top = 26, bottom = H - 28;

  // ---- the shares: one row a persona ---------------------------------------------------------------------------------
  const shares = svg('g'), most = Math.max(...personas.flatMap(p => [p.none.mean, p.grow.mean, p.give.mean]));
  const max = Math.max(50, 10 * Math.ceil(most / 10)), x = scale([0, max], [left, right]), rowH = (bottom - top) / personas.length;
  axisX(shares, x, [0, 10, 20, 30, 40, 50, 60, 70, 80].filter(v => v <= max), { y: bottom, format: v => `${v}%`, grid: [top, bottom] });
  shares.append(svg('line', { x1: x(20), x2: x(20), y1: top - 4, y2: bottom, stroke: COLOR.axis, 'stroke-width': 1 }),
    text('equal share', { x: x(20), y: top - 10, 'text-anchor': 'middle', class: 't small' }));
  const rows = personas.map((p, n) => {
    const y = top + rowH * (n + 0.5), at = x(p.none.mean);
    const row = {
      p, y,
      name: text(p.name, { x: left - 14, y: y + 4, 'text-anchor': 'end' }),
      toGrow: svg('line', { x1: at, x2: at, y1: y, y2: y, stroke: GROW, 'stroke-width': 2 }),
      toGive: svg('line', { x1: at, x2: at, y1: y, y2: y, stroke: GIVE, 'stroke-width': 2 }),
      none: place(mark('ring', { fill: COLOR.ink2, opacity: 0 }), x(20), y),
      grow: place(mark('circle', { fill: GROW, opacity: 0 }), at, y),
      give: place(mark('diamond', { fill: GIVE, r: 4.5, opacity: 0 }), at, y),
      // The one number a step is about, beside its mark.
      value: text('', { y: y + 4, class: 't strong', opacity: 0 }),
    };
    shares.append(row.name, row.toGrow, row.toGive, row.grow, row.give, row.none, row.value);
    // The whole row answers the pointer, since its marks are small.
    shares.append(hint(svg('rect', { x: left, y: y - rowH / 2, width: right - left + 30, height: rowH, fill: 'transparent' }),
      `${p.name}. No objective: ${fmt(p.none.mean)}%. Told to grow: ${fmt(p.grow.mean)}%. Told to give: ${fmt(p.give.mean)}%. Four agents each.`));
    return row;
  });

  // ---- attainment: two bars, then one row an objective ---------------------------------------------------------------
  const scores = svg('g', { opacity: 0 }), s = scale([0, 100], [left, right]), barsTop = top + 14, barH = 18, rowsTop = barsTop + 2 * (barH + 22) + 34;
  const objH = (bottom - rowsTop) / b.objectives.length;
  scores.append(text('Attainment rate', { x: left, y: top - 2, class: 't small strong' }), text('Mean objective score, 0 to 100', { x: left, y: rowsTop - 14, class: 't small strong' }));
  axisX(scores, s, [0, 25, 50, 75, 100], { y: bottom, grid: [rowsTop, bottom] });
  const bars = [[narrow ? 'objective' : 'with an objective', b.withObjective, COLOR.ink], ['baseline', b.baseline, COLOR.axis]].map(([name, tally, fill], n) => {
    const y = barsTop + n * (barH + 22), bar = svg('rect', { x: left, y, width: 0, height: barH, rx: 3, fill });
    const value = text('', { x: left + 8, y: y + barH / 2 + 5, class: 't strong' });
    scores.append(text(name, { x: left - 14, y: y + barH / 2 + 4, 'text-anchor': 'end' }), bar, value,
      text(`${tally.attained} of ${tally.n} agents`, { x: left, y: y + barH + 14, class: 't small mute' }));
    hint(bar, `${name}: ${fmt(tally.rate)}% attained (${tally.attained} of ${tally.n})`);
    return { tally, bar, value };
  });
  const objectives = b.objectives.map((o, n) => {
    const y = rowsTop + objH * (n + 0.5);
    const row = {
      o, y, link: svg('line', { x1: s(o.baseline), x2: s(o.baseline), y1: y, y2: y, stroke: COLOR.ink, 'stroke-width': 2 }),
      base: place(mark('ring', { fill: COLOR.ink2 }), s(o.baseline), y), told: place(mark('circle', { fill: COLOR.ink }), s(o.baseline), y),
    };
    scores.append(text(o.name, { x: left - 14, y: y + 4, 'text-anchor': 'end' }), row.link, row.base, row.told,
      text(`${o.attained} of ${o.n}`, { x: right + 40, y: y + 4, 'text-anchor': 'end', class: 't small' }));
    scores.append(hint(svg('rect', { x: left, y: y - objH / 2, width: right - left + 40, height: objH, fill: 'transparent' }),
      `${o.name} (${o.line.toLowerCase()}). Baseline score ${fmt(o.baseline)}, with the objective ${fmt(o.score)}; attained by ${o.attained} of ${o.n}.`));
    return row;
  });
  scores.append(text('attained', { x: right + 40, y: rowsTop - 14, 'text-anchor': 'end', class: 't small mute' }));
  root.append(shares, scores);

  // The number a step is about: the warm persona told to grow at step 1, the blunt persona told to give at step 2.
  const about = (i, p) => (i === 1 && p.key === 'warm' ? p.grow.mean : i === 2 && p.key === 'blunt' ? p.give.mean : null);

  return {
    step(i) {
      fade(shares, i <= 2, { duration: 400 });
      fade(scores, i === 3, { duration: 400, delay: i === 3 ? 250 : 0 });
      [true, i === 1 || i === 2, i === 2, i === 3].forEach((on, k) => { key.items[k].hidden = !on; });
      rows.forEach((row, n) => {
        const { p } = row, wait = { duration: 650, delay: n * 35 };
        const grow = i >= 1 ? p.grow.mean : p.none.mean, give = i >= 2 ? p.give.mean : p.none.mean, said = about(i, p);
        to(row.none, { translateX: x(i >= 0 ? p.none.mean : 20), opacity: i >= 0 ? 1 : 0 }, wait);
        to(row.grow, { translateX: x(grow), opacity: i >= 1 ? 1 : 0 }, wait);
        to(row.toGrow, { x2: x(grow) }, wait);
        to(row.give, { translateX: x(give), opacity: i >= 2 ? 1 : 0 }, wait);
        to(row.toGive, { x2: x(give) }, wait);
        row.name.setAttribute('class', said === null ? 't' : 't strong');
        if (said !== null) {
          // Beside the mark, on the side away from the ring it left.
          const after = said >= p.none.mean && i === 1;
          row.value.textContent = `${fmt(said)}%`;
          row.value.setAttribute('x', x(said) + (after ? 11 : -11));
          row.value.setAttribute('text-anchor', after ? 'start' : 'end');
        }
        fade(row.value, said !== null, { duration: 300, delay: said === null ? 0 : 700 });
      });
      bars.forEach(({ tally, bar, value }, n) => {
        const wait = { duration: 800, delay: 350 + n * 150 }, rate = i === 3 ? tally.rate : 0;
        to(bar, { width: s(rate) - left }, wait);
        to(value, { x: s(rate) + 8 }, wait);
        count(value, rate, { suffix: '%', ...wait });
      });
      objectives.forEach(({ o, link, told }, n) => {
        const wait = { duration: 700, delay: 700 + n * 90 }, at = s(i === 3 ? o.score : o.baseline);
        to(told, { translateX: at }, wait);
        to(link, { x2: at }, wait);
      });
    },
  };
}
