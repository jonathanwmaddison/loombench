// Figure 3 of the Overview: one agent told it is blunt, in the same match and then across every match number.
//
// Steps (the words of each are in web/index.mjs):
//   -1  the empty figure: two cloths of one match, both at the start
//    0  five calm agents: the first cloth is woven, every agent at a fifth
//    1  one agent told it is blunt: the same match woven again beside it
//    2  every match number: the changed agent's final share as a calm agent and as the blunt agent, a line a match
//    3  the same for the other four agents: their lines, their means and the change each shows, noted at the bottom left
//
// Every element is made once, in its state at step -1. `step(i)` then says where each belongs at step i.

/** Draws the figure into `stage` from the overview's `data`, and returns { step }. */
export default function mount(stage, data, kit) {
  const { svg, text, scale, fade, draw, loom, mark, place, hint, legend, chart, axisY, fmt, est, COLOR } = kit;
  const s = data.blunt, changed = s.pairs.find(p => p.seed === s.seed).seat;
  const key = legend([
    { label: 'the changed agent', shape: 'circle', hue: COLOR.ink },
    { label: 'mean of the other four agents', shape: 'ring', hue: COLOR.muted },
  ]);
  stage.append(key);
  const { root, W, H, narrow } = chart(stage, {
    height: (w, tallest) => tallest,
    label: `One agent told it is blunt, in the same match and across ${s.pairs.length} match numbers, with the final shares of the changed agent and the other four.`,
  });

  // ---- view A: the two cloths, side by side ----------------------------------------------------------------------------
  const gap = 20, colW = (W - gap) / 2, rx = colW + gap, cy = 26, ch = H - cy - 2, labels = narrow ? 'share' : 'full';
  const viewA = svg('g'), calm = svg('g'), blunt = svg('g', { opacity: 0 });
  calm.append(text('Five calm agents', { x: 0, y: 14, class: 't small strong' }));
  blunt.append(text('One agent blunt', { x: rx, y: 14, class: 't small strong' }));
  const before = loom(calm, s.before, { x: 0, y: cy, w: colW, h: ch, labels, emphasis: changed });
  const after = loom(blunt, s.after, { x: rx, y: cy, w: colW, h: ch, labels, emphasis: changed });
  viewA.append(calm, blunt);

  // ---- view B: the slope chart -----------------------------------------------------------------------------------------
  const viewB = svg('g', { opacity: 0 });
  const pl = narrow ? 40 : 52, pr = W - 16, pt = 16, pb = H - 30;
  const y = scale([0, 60], [pb, pt]), xl = pl + 0.3 * (pr - pl), xr = pl + 0.7 * (pr - pl);
  axisY(viewB, y, [0, 20, 40, 60], { x: pl, format: v => `${v}%`, grid: [pl, pr] });
  viewB.append(
    text(narrow ? 'calm' : 'as a calm agent', { x: xl, y: pb + 17, 'text-anchor': 'middle', class: 't small' }),
    text(narrow ? 'blunt' : 'as the blunt agent', { x: xr, y: pb + 17, 'text-anchor': 'middle', class: 't small' }),
    svg('line', { x1: pl, x2: pr, y1: y(s.threshold), y2: y(s.threshold), stroke: COLOR.axis, 'stroke-width': 1 }),
    // At the left end, where no line passes: every line starts near a fifth.
    text(`claim threshold ${s.threshold}%`, { x: pl + 4, y: y(s.threshold) - 5, class: 't small mute' }),
  );

  // One agent's line from its left value to its right value, with a wider transparent line on top to point at.
  const pairLine = (from, to, attrs, words) => {
    const l = svg('line', { x1: xl, y1: y(from), x2: xr, y2: y(to), 'stroke-width': 1.5, ...attrs });
    const hit = hint(svg('line', { x1: xl, y1: y(from), x2: xr, y2: y(to), stroke: 'transparent', 'stroke-width': 12, opacity: 0 }), words);
    viewB.append(l, hit);
    return { l, hit };
  };
  const others = s.pairs.map(p => pairLine(p.others[0], p.others[1], { stroke: COLOR.muted, opacity: 0.5 },
    `Match number ${p.seed}: the other four agents average ${p.others[0]}% when the changed agent is calm, ${p.others[1]}% when it is blunt`));
  const focal = s.pairs.map(p => pairLine(p.focal[0], p.focal[1], { stroke: COLOR.ink, opacity: 0.45 },
    `Match number ${p.seed}: ${p.focal[0]}% as a calm agent, ${p.focal[1]}% as the blunt agent`));

  // The means: a filled circle for the changed agent, a ring for the other four.
  const meanAt = (shape, fill, x, v, words) => {
    const m = place(mark(shape, { fill, r: 5.5, opacity: 0 }), x, y(v));
    viewB.append(hint(m, words));
    return m;
  };
  const focalL = meanAt('circle', COLOR.ink, xl, s.focal.from, `The changed agent, mean over all match numbers: ${fmt(s.focal.from, 1)}% as a calm agent`);
  const focalR = meanAt('circle', COLOR.ink, xr, s.focal.to, `The changed agent, mean over all match numbers: ${fmt(s.focal.to, 1)}% as the blunt agent`);
  const othersL = meanAt('ring', COLOR.muted, xl, s.others.from, `The other four agents, mean: ${fmt(s.others.from, 1)}% as calm agents`);
  const othersR = meanAt('ring', COLOR.muted, xr, s.others.to, `The other four agents, mean: ${fmt(s.others.to, 1)}% when the changed agent is blunt`);

  // The mean labels: on the left the two means nearly coincide, so the changed agent's sits above its mark and the others' below.
  const say = (words, attrs) => { const t = text(words, { opacity: 0, ...attrs }); viewB.append(t); return t; };
  const focalLabelL = say(`${fmt(s.focal.from, 1)}%`, { x: xl - 12, y: y(s.focal.from) - 9, 'text-anchor': 'end', class: 't strong' });
  const focalLabelR = say(`${fmt(s.focal.to, 1)}%`, { x: xr + 12, y: y(s.focal.to) + 4, class: 't strong' });
  const othersLabelL = say(`${fmt(s.others.from, 1)}%`, { x: xl - 12, y: y(s.others.from) + 17, 'text-anchor': 'end', class: 't' });
  const othersLabelR = say(`${fmt(s.others.to, 1)}%`, { x: xr + 12, y: y(s.others.to) + 4, class: 't' });

  // The annotation, in the empty bottom left of the plot: every line starts near a fifth, so nothing passes under it.
  const notes = narrow
    ? [[`the changed agent: ${est(s.focal.change)} points`, 't small strong'], [`each other agent: ${est(s.others.change)} points`, 't small strong']]
    : [['the changed agent', 't small'], [`${est(s.focal.change)} points`, 't strong'], ['each other agent', 't small'], [`${est(s.others.change)} points`, 't strong']];
  const noted = notes.map(([words, cls], n) => say(words, { x: pl + 8, y: pb - 10 - 17 * (notes.length - 1 - n), class: cls }));
  const aboutFocal = noted.slice(0, notes.length / 2), aboutOthers = noted.slice(notes.length / 2);
  root.append(viewA, viewB);

  // ---- motion ----------------------------------------------------------------------------------------------------------
  const LINES_DONE = 1150; // the last of the staggered lines has been drawn by then
  const reveal = (el, on) => fade(el, on, { duration: 400, delay: on ? LINES_DONE : 0 });
  // The lines are drawn in one after another, 60 ms apart, and their hit areas follow them.
  const drawLines = (lines, on) => lines.forEach(({ l, hit }, n) => {
    draw(l, on, { duration: 600, delay: on ? n * 60 : 0 });
    fade(hit, on, { duration: 0 });
  });

  return {
    step(i) {
      fade(viewA, i < 2, { duration: 350, delay: i < 2 ? 350 : 0 });
      fade(viewB, i >= 2, { duration: 350, delay: i >= 2 ? 350 : 0 });
      before.show(i >= 0 ? before.rounds : 0, i === 0 ? { duration: 2200 } : {});
      fade(blunt, i >= 1, { duration: 300 });
      after.show(i >= 1 ? after.rounds : 0, i === 1 ? { duration: 2600, delay: 300 } : {});

      drawLines(focal, i >= 2);
      drawLines(others, i >= 3);
      [focalL, focalR, focalLabelL, focalLabelR, ...aboutFocal].forEach(el => reveal(el, i >= 2));
      [othersL, othersR, othersLabelL, othersLabelR, ...aboutOthers].forEach(el => reveal(el, i >= 3));
      key.items[0].hidden = i < 2;
      key.items[1].hidden = i < 3;
    },
  };
}
