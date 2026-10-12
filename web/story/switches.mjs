// Figure 7 of the Overview: attainment rate of each decision system under five conditions, one dot plot that fills in
// step by step. The two executions of Jev's default run form the band every other difference is read against.
//
// Steps (the words of each are in web/index.mjs):
//   -1  the empty plot: axes, rows and their names
//    0  a model against no model: Jev's default run, and uniform random's
//    1  the same run executed a second time: Jev's second execution, and the band between the two
//    2  the personas switched off, and one agent deciding alone: Jev's three other conditions, and uniform random alone
//    3  the other decision systems, in every condition
//
// Every mark is made once, in its state at step -1. `step(i)` then says where each belongs at step i, and the kit moves
// it there from wherever it is, so any step can follow any other.

/** Draws the figure into `stage` from the overview's `data`, and returns { step }. */
export default function mount(stage, data, kit) {
  const { svg, text, scale, to, fade, mark, place, hint, legend, chart, axisX, fmt, dodge, SYSTEM_MARKS, COLOR } = kit;
  const w = data.switches;
  const cell = (system, key) => w.systems.find(s => s.system === system)?.cells.find(c => c.key === key) ?? null;
  const condName = key => w.conditions.find(c => c.key === key).name;
  const ROWS = w.conditions.map(c => c.key);
  const SHORT = { default: 'Default', again: 'Second execution', personaOff: 'Personas off', solo: 'Solo, accept', soloRefuse: 'Solo, refuse' };

  // The step at which a mark first shows: Jev's default and uniform random's default at 0, Jev's other runs at 1 or 2, every
  // other mark at 3.
  const visibleAt = (system, key) => (system === 'jev' ? ({ default: 0, again: 1 })[key] ?? 2 : system === 'chance' ? (key === 'default' ? 0 : 2) : 3);
  const firstAt = new Map(w.systems.map(s => [s.system, Math.min(...s.cells.map(c => visibleAt(s.system, c.key)))]));
  const systemsAt = v => w.systems.filter(s => firstAt.get(s.system) === v).map(s => s.system);

  const lg = legend(w.systems.map(s => ({ label: s.name, shape: SYSTEM_MARKS[s.system].shape, hue: SYSTEM_MARKS[s.system].hue })));
  stage.append(lg);
  const { root, W, H, narrow } = chart(stage, {
    height: (width, tallest) => tallest,
    label: 'Attainment rate, in percent of agents, by decision system and condition.',
  });
  const left = narrow ? 124 : 184, right = W - (narrow ? 22 : 28), top = 40, bottom = H - 46;
  const x = scale([0, 100], [left, right]), rowH = (bottom - top) / ROWS.length, rowY = n => top + rowH * (n + 0.5);
  const plot = svg('g'), j = cell('jev', 'default'), again = cell('jev', 'again');

  // The band between Jev's two executions, behind the grid and the marks.
  const band = again ? svg('rect', { x: Math.min(x(j.rate), x(again.rate)), y: top, width: Math.abs(x(again.rate) - x(j.rate)), height: bottom - top, fill: COLOR.accentSoft, opacity: 0 }) : null;
  const bandLabel = again ? text(narrow ? 'two executions' : 'two executions of the same run', { x: (x(j.rate) + x(again.rate)) / 2, y: top - 10, 'text-anchor': 'middle', class: 't small', opacity: 0 }) : null;
  if (band) plot.append(band, bandLabel);

  axisX(plot, x, [0, 25, 50, 75, 100], { y: bottom, format: v => `${v}%`, grid: [top, bottom] });
  plot.append(text('attainment rate', { x: right, y: bottom + 34, 'text-anchor': 'end', class: 't small mute' }));

  const rows = ROWS.map((key, n) => {
    const y = rowY(n), name = text(narrow ? SHORT[key] : condName(key), { x: left - 12, y: y + 4, 'text-anchor': 'end' });
    plot.append(svg('line', { x1: left, x2: right, y1: y, y2: y, stroke: COLOR.hairline, 'stroke-width': 1 }), name);
    return { key, y, name };
  });

  // One mark per cell. The vertical offsets are set once per row, over every system's mark in that row.
  const marks = rows.flatMap(row => {
    const here = w.systems.flatMap(s => { const c = s.cells.find(c => c.key === row.key); return c ? [{ s, c }] : []; });
    const dy = dodge(here.map(({ c }) => x(c.rate)), 5.5);
    return here.map(({ s, c }, n) => {
      const { hue, shape } = SYSTEM_MARKS[s.system], y = row.y + dy[n], vis = visibleAt(s.system, c.key), final = x(c.rate);
      // Jev's runs slide out of its default run; uniform random's default starts at 0; anything else only fades in.
      const origin = vis === 0 ? x(0) : s.system === 'jev' ? x(j.rate) : final;
      const m = mark(shape, { fill: hue, r: 5.5, opacity: 0 });
      m.prepend(svg('circle', { r: 9, fill: 'transparent' }));
      hint(m, `${s.name}, ${condName(c.key)}: ${fmt(c.rate)}% (${c.attained} of ${c.n})`);
      place(m, origin, y);
      plot.append(m);
      let label = null;
      if (s.system === 'jev') label = text(`${fmt(c.rate)}%`, { x: origin, y: y - 13, 'text-anchor': 'middle', class: 't strong', opacity: 0 });
      else if (s.system === 'chance' && c.key === 'default') label = text(`${fmt(c.rate)}%`, { x: origin, y: y + 20, 'text-anchor': 'middle', class: 't', opacity: 0 });
      if (label) plot.append(label);
      return { system: s.system, key: c.key, vis, m, label, origin, final };
    });
  });
  root.append(plot);

  // Which rows a step is about, in ink.
  const about = { 0: ['default'], 1: ['again'], 2: ['personaOff', 'solo', 'soloRefuse'] };
  // How each mark enters: runs in turn, a system at a time at step 0 and 3, the rows of step 2 one after another.
  const timing = e => (e.vis === 1 ? { duration: 900, delay: 250 }
    : e.vis === 2 ? { duration: 700, delay: 90 * ROWS.indexOf(e.key) }
      : { duration: 700, delay: 150 * systemsAt(e.vis).indexOf(e.system) });

  return {
    step(i) {
      if (band) {
        to(band, { opacity: i >= 1 ? 0.35 : 0 }, { duration: 500 });
        fade(bandLabel, i >= 1, { duration: 500 });
      }
      w.systems.forEach((s, n) => { lg.items[n].hidden = i < firstAt.get(s.system); });
      rows.forEach(row => row.name.setAttribute('class', (about[i] ?? []).includes(row.key) ? 't strong' : 't'));
      for (const e of marks) {
        const on = i >= e.vis, wait = timing(e);
        to(e.m, { translateX: on ? e.final : e.origin, opacity: on ? 1 : 0 }, wait);
        if (e.label) to(e.label, { x: on ? e.final : e.origin, opacity: on ? 1 : 0 }, wait);
      }
    },
  };
}
