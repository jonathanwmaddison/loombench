// Figure 4 of the Overview: the final share of one blunt and one calm agent as k of the five are told to be blunt, and
// the calm agents' share left over; then another pair of types, whose share held jointly collapses as greedy agents are added.
//
// Steps (the words of each are in web/index.mjs):
//   -1  the axes and the empty plot
//    0  the six matches of the first pair, one above each k, fade in
//    1  each blunt agent's final share falls as k rises: its line is drawn in, with its two labels
//    2  the calm agents' share, drawn the same way, is left with little
//    3  five alike do not end equal: the matches at k = 1 to 4 dim, and the two notes on dispersion appear
//    4  another pair (cooperative and greedy, if its data is there): the matches and the lines move to its values,
//       and the loom held jointly is drawn in
//
// Every element is made once, in its state at step -1. `step(i)` then says where each belongs at step i, and the kit
// moves it there from wherever it is, so any step can follow any other.

/** Draws the figure into `stage` from the overview's `data`, and returns { step }. */
export default function mount(stage, data, kit) {
  const { svg, text, to, fade, count, mark, place, hint, legend, chart, axisX, axisY, fmt, COLOR } = kit;
  const A = data.sweeps.find(s => s.system === 'jev' && s.added === 'Blunt');
  const B = data.sweeps.find(s => s.system === 'gptd' && s.added === 'Greedy');
  const K = [0, 1, 2, 3, 4, 5], FROM = { second: 1, first: 2, joint: 4 };
  let S = A; // the pair the figure shows now: A, or B from step 4

  const key = legend([
    { label: `each ${A.added.toLowerCase()} agent`, shape: 'circle', hue: COLOR.ink },
    { label: `each ${A.group.toLowerCase()} agent`, shape: 'ring', hue: COLOR.muted },
    { label: 'loom held jointly', shape: 'square', hue: COLOR.accent },
  ]);
  stage.append(key);
  const { root, W, H, narrow } = chart(stage, {
    height: (w, tallest) => tallest,
    label: 'Final share of each type of agent as the number of agents of the second type rises from 0 to 5 of five.',
  });

  // ---- layout: a band of six matches above, one column at each k; the plot below it ------------------------------------
  const titleH = narrow ? 30 : 18, margin = narrow ? 40 : 50;
  const left = margin, right = W - margin, gap = (right - left) / 5, xk = k => left + gap * k;
  const pw = Math.min(0.3 * H * 232 / 384, gap - 8, 2 * margin - 6), ph = pw * 384 / 232;
  const picTop = titleH + 6, labelY = picTop + ph + 13, top = picTop + ph + 36, bottom = H - 42;
  const y = v => bottom - (bottom - top) * v / 50;

  const title = text('', { x: 2, y: 13, class: 't small strong' }), titleRest = text('', { x: 2, y: 27, class: 't small strong' });
  const setTitle = d => {
    const head = `${d.systemName}:`, rest = `${d.group.toLowerCase()} group, k agents ${d.added.toLowerCase()}`;
    // A phone is too narrow for one line, so the title goes over two.
    title.textContent = narrow ? head : `${head} ${rest}`;
    titleRest.textContent = narrow ? rest : '';
  };
  setTitle(A);

  const axes = svg('g');
  axisY(axes, y, [0, 10, 20, 30, 40, 50], { x: left, format: v => `${v}%`, grid: [left, right] });
  axisX(axes, xk, K, { y: bottom });
  axes.append(svg('line', { x1: left, x2: right, y1: bottom, y2: bottom, stroke: COLOR.axis, 'stroke-width': 1 }),
    text('agents of the second type (k)', { x: (left + right) / 2, y: bottom + 34, 'text-anchor': 'middle', class: 't small mute' }));

  // One band of six matches: the picture of one match at each k, with its label. Its layer is faded as a whole.
  function band(d, visible) {
    const layer = svg('g', { opacity: 0 }), imgs = [], lbls = [];
    for (const level of d.levels) {
      const cx = xk(level.k);
      const img = svg('image', { href: level.pictured.picture, x: cx - pw / 2, y: picTop, width: pw, height: ph, preserveAspectRatio: 'xMidYMid meet', opacity: visible ? 1 : 0 });
      const lbl = text(`k = ${level.k}`, { x: cx, y: labelY, 'text-anchor': 'middle', class: 't small', opacity: visible ? 1 : 0 });
      hint(img, `k = ${level.k}: match number ${level.pictured.seed}`);
      imgs.push(img); lbls.push(lbl);
      layer.append(img, lbl);
    }
    return { layer, imgs, lbls };
  }
  const bandA = band(A, false), bandB = B ? band(B, true) : null;

  // What a mark or a label says, from the pair on show now.
  const words = (field, k) => {
    const v = S.levels[k][field];
    if (v === null) return '';
    if (field === 'joint') return `k = ${k}: ${fmt(v, 1)}% of the loom held jointly by two agents`;
    const who = field === 'second' ? S.added.toLowerCase() : S.group.toLowerCase();
    return `k = ${k}: each ${who} agent ${fmt(v, 1)}% of the loom`;
  };

  // One series: a mark at each k, and a line for each pair of neighbours. Both are placed by `arrange`.
  function makeSeries(field, shape, fill) {
    const segs = K.slice(0, 5).map(j => svg('line', { x1: xk(j), x2: xk(j), y1: y(0), y2: y(0), stroke: fill, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0 }));
    const marks = K.map(k => {
      const m = place(mark(shape, { fill, r: 5, opacity: 0 }), xk(k), y(0));
      m.append(svg('circle', { r: 9, fill: 'transparent' })); // a wider target for the pointer
      return hint(m, () => words(field, k));
    });
    return { field, segs, marks };
  }
  // Moves a series to the values of dataset D: a mark shows where its value is, and a line joins two shown marks.
  function arrange(sr, D, on) {
    const vals = K.map(k => D.levels[k][sr.field]);
    sr.marks.forEach((m, k) => to(m, { translateX: xk(k), translateY: y(vals[k] ?? 0), opacity: on && vals[k] !== null ? 1 : 0 }, { duration: 600, delay: k * 110 }));
    sr.segs.forEach((seg, j) => {
      const a = vals[j], b = vals[j + 1], drawn = on && a !== null && b !== null;
      to(seg, { x1: xk(j), y1: y(a ?? 0), x2: xk(drawn ? j + 1 : j), y2: drawn ? y(b) : y(a ?? 0), opacity: drawn ? 1 : 0 }, { duration: 600, delay: j * 110 });
    });
  }
  const second = makeSeries('second', 'circle', COLOR.ink), first = makeSeries('first', 'ring', COLOR.muted);
  const joint = B ? makeSeries('joint', 'square', COLOR.accent) : null;
  const lines = [second, first, joint].filter(Boolean);

  // Direct labels: the value a step is about, counted to. Joint labels sit beside their marks where the line below would cut them.
  const spec = [
    { field: 'second', k: 1, cls: 't strong', dy: () => -12 },
    { field: 'second', k: 5, cls: 't strong', dy: () => -12 },
    { field: 'first', k: 0, cls: 't', anchor: 'start', dx: 9, dy: () => -8 },
    { field: 'first', k: 4, cls: 't', dy: v => (y(v) + 16 > bottom - 4 ? -10 : 16) },
    { field: 'joint', k: 0, cls: 't', anchor: 'start', dx: 9, dy: () => 4 },
    { field: 'joint', k: 1, cls: 't', anchor: 'start', dx: 9, dy: () => 4 },
    { field: 'joint', k: 2, cls: 't', anchor: 'start', dx: 9, dy: () => -8 },
  ].filter(lb => lb.field !== 'joint' || B);
  const labels = spec.map(({ field, k, cls, anchor = 'middle', dx = 0, dy }) => ({
    field, k, dx, dy, el: text('', { x: xk(k) + dx, y: y(0), 'text-anchor': anchor, class: cls, opacity: 0 }),
  }));
  function labelAt(lb, D, on) {
    const v = D.levels[lb.k][lb.field];
    to(lb.el, { x: xk(lb.k) + lb.dx, y: y(v) + lb.dy(v), opacity: on ? 1 : 0 }, { duration: 600, delay: lb.k * 110 });
    count(lb.el, v, { digits: 1, suffix: '%', duration: 600, delay: lb.k * 110 });
  }

  // The notes on the first pair's dispersion, at k = 0 and at k = 5. They are about A only, and show at step 3.
  const notes = [
    text(`dispersion ${fmt(A.levels[0].dispersion, 1)} points`, { x: xk(0) + 9, y: y(A.levels[0].first) - 24, class: 't small', opacity: 0 }),
    text(`dispersion ${fmt(A.levels[5].dispersion, 1)} points`, { x: xk(5) - 8, y: y(A.levels[5].second) + 12, 'text-anchor': 'end', class: 't small', opacity: 0 }),
    text(`largest share ${fmt(A.levels[5].largest, 1)}%`, { x: xk(5) - 8, y: y(A.levels[5].second) + 24, 'text-anchor': 'end', class: 't small', opacity: 0 }),
  ];

  root.append(title, titleRest, axes, bandA.layer, ...(bandB ? [bandB.layer] : []),
    ...lines.flatMap(sr => [...sr.segs, ...sr.marks]), ...labels.map(lb => lb.el), ...notes);

  return {
    step(i) {
      S = i >= 4 && B ? B : A;
      const onB = S === B;
      setTitle(S);
      key.items[0].lastChild.textContent = `each ${S.added.toLowerCase()} agent`;
      key.items[1].lastChild.textContent = `each ${S.group.toLowerCase()} agent`;
      key.items.forEach((item, n) => { item.hidden = i < [1, 2, 4][n]; });

      // The two bands cross-fade: the one leaving first, then the one arriving.
      to(bandA.layer, { opacity: onB ? 0 : 1 }, onB ? { duration: 350 } : { duration: 450, delay: 350 });
      if (bandB) to(bandB.layer, { opacity: onB ? 1 : 0 }, onB ? { duration: 450, delay: 350 } : { duration: 350 });
      bandA.imgs.forEach((img, k) => {
        const wait = { duration: 500, delay: k * 90 }, dim = i === 3 && k > 0 && k < 5;
        to(img, { opacity: i < 0 ? 0 : dim ? 0.3 : 1 }, wait);
        to(bandA.lbls[k], { opacity: i < 0 ? 0 : 1 }, wait);
      });

      for (const sr of lines) arrange(sr, sr.field === 'joint' ? B : S, i >= FROM[sr.field]);
      for (const lb of labels) labelAt(lb, lb.field === 'joint' ? B : S, i >= FROM[lb.field]);
      for (const n of notes) fade(n, i === 3, { duration: 400, delay: i === 3 ? 350 : 0 });
    },
  };
}
