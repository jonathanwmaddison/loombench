// Figure for the Overview: Common knowledge of dispositions and objectives (--know persona|objective|both).
//
// Steps:
//   -1  empty axes and row labels
//    0  the 4 balanced-deal conditions (Private, Know dispositions, Know objectives, Know both): targeting of claims (Hold vs Give) and dispersion
//    1  personas off (Private vs Know objectives): claims drop −1.2/agent, pushes into Hold drop −43%, Hold score climbs 73 -> 81
//    2  adversarial compositions (4 calm + 1 blunt at 46% and 90%, 4 Hold + 1 Grow): knowing who the aggressor is does not stop extraction

export default function mount(stage, data, kit) {
  const { svg, text, scale, to, fade, mark, place, hint, legend, chart, axisX, fmt, COLOR } = kit;
  const k = data.knowledge;
  const lg = legend([
    { label: 'Claims hitting Hold (%)', shape: 'square', hue: COLOR.compare },
    { label: 'Claims targeting Give (%)', shape: 'circle', hue: COLOR.accent },
    { label: 'Hold score / Focal share (%)', shape: 'diamond', hue: COLOR.ink },
  ]);
  stage.append(lg);

  const { root, W, H, narrow } = chart(stage, {
    height: (width, tallest) => tallest,
    label: 'Common knowledge of dispositions and objectives: claim targeting, Hold score, and adversarial extraction.',
  });

  const left = narrow ? 136 : 196, right = W - (narrow ? 20 : 28);
  const topA = 34, botA = Math.round(H * 0.58), topB = Math.round(H * 0.68), botB = H - 38;
  const x = scale([0, 100], [left, right]);

  const gA = svg('g'), gB = svg('g', { opacity: 0 });
  axisX(gA, x, [0, 20, 40, 60, 80, 100], { y: botA, format: v => `${v}%`, grid: [topA, botA] });
  gA.append(text('share of claims (%) · Hold score (0–100)', { x: right, y: botA + 28, 'text-anchor': 'end', class: 't small mute' }));

  const rowHA = (botA - topA) / k.cells.length;
  const rowsA = k.cells.map((c, idx) => {
    const y = topA + rowHA * (idx + 0.5);
    const vis = c.personaDealt ? 0 : 1;
    const label = text(c.name, { x: left - 10, y: y + 4, 'text-anchor': 'end', class: 't', opacity: 0 });
    const line = svg('line', { x1: left, x2: right, y1: y, y2: y, stroke: COLOR.hairline, 'stroke-width': 1, opacity: 0 });
    const holdPct = c.targeting.claims.holdPct, givePct = c.targeting.claims.givePct, holdScore = c.scores.hold?.score ?? 0;

    const mHold = mark('square', { fill: COLOR.compare, r: 5, opacity: 0 });
    const mGive = mark('circle', { fill: COLOR.accent, r: 5, opacity: 0 });
    const mScore = mark('diamond', { fill: COLOR.ink, r: 5.5, opacity: 0 });
    place(mHold, x(0), y - 4);
    place(mGive, x(0), y + 4);
    place(mScore, x(0), y);

    const tipText = `${c.name}: Attainment ${fmt(c.rate)}% · Hold score ${fmt(holdScore)} · Claims hitting Hold ${fmt(holdPct, 1)}% (${c.targeting.claims.hold}/${c.targeting.claims.total}), targeting Give ${fmt(givePct, 1)}% (${c.targeting.claims.give}/${c.targeting.claims.total}) · Claims/agent ${fmt(c.claims, 1)}, Concessions ${fmt(c.concessions, 1)}, Refusals ${fmt(c.refusals, 1)}, Dispersion ${fmt(c.dispersion, 1)} pp`;
    for (const el of [mHold, mGive, mScore]) {
      el.prepend(svg('circle', { r: 9, fill: 'transparent' }));
      hint(el, tipText);
    }
    const vText = text(`${fmt(holdScore)}`, { x: x(holdScore) + 8, y: y + 4, class: 't small strong', opacity: 0 });
    gA.append(line, label, mHold, mGive, mScore, vText);
    return { c, vis, y, label, line, mHold, mGive, mScore, vText, holdPct, givePct, holdScore };
  });

  // Panel B: Adversarial extraction (Private vs Known)
  gB.append(text('Adversarial focal agent final share (%): Private (hollow) vs. Common knowledge (filled)', { x: left, y: topB - 10, class: 't small strong' }));
  const rowHB = (botB - topB) / Math.max(1, k.adversarial.length);
  const rowsB = k.adversarial.map((a, idx) => {
    const y = topB + rowHB * (idx + 0.5);
    const label = text(narrow ? a.label.replace(/ \(.*\)/, '') : a.label, { x: left - 10, y: y + 4, 'text-anchor': 'end', class: 't' });
    const line = svg('line', { x1: left, x2: right, y1: y, y2: y, stroke: COLOR.hairline, 'stroke-width': 1 });
    const privVal = a.private.focal.to, knowVal = a.known.focal.to;
    const link = svg('line', { x1: x(privVal), x2: x(knowVal), y1: y, y2: y, stroke: COLOR.ink, 'stroke-width': 2 });
    const mPriv = svg('circle', { cx: x(privVal), cy: y, r: 5, fill: COLOR.paper, stroke: COLOR.ink, 'stroke-width': 2 });
    const mKnow = svg('circle', { cx: x(knowVal), cy: y, r: 5.5, fill: COLOR.accent });
    const valTxt = text(`${fmt(privVal, 1)}% → ${fmt(knowVal, 1)}%`, { x: Math.max(x(privVal), x(knowVal)) + 8, y: y + 4, class: 't small strong' });
    const tipB = `${a.label}: Private ${fmt(privVal, 1)}% (others' refusals ${fmt(a.private.refusals.others, 1)}) → Known ${fmt(knowVal, 1)}% (others' refusals ${fmt(a.known.refusals.others, 1)})`;
    hint(mPriv, tipB);
    hint(mKnow, tipB);
    gB.append(line, label, link, mPriv, mKnow, valTxt);
    return { a, y };
  });

  root.append(gA, gB);

  return {
    step(i) {
      for (const r of rowsA) {
        const on = i >= r.vis;
        fade(r.label, on, { duration: 400 });
        fade(r.line, on, { duration: 400 });
        r.label.setAttribute('class', (i === 0 && r.c.personaDealt) || (i === 1 && !r.c.personaDealt) ? 't strong' : 't');
        to(r.mHold, { translateX: on ? x(r.holdPct) : x(0), opacity: on ? 1 : 0 }, { duration: 600 });
        to(r.mGive, { translateX: on ? x(r.givePct) : x(0), opacity: on ? 1 : 0 }, { duration: 600 });
        to(r.mScore, { translateX: on ? x(r.holdScore) : x(0), opacity: on ? 1 : 0 }, { duration: 600 });
        fade(r.vText, on, { duration: 500 });
      }
      fade(gB, i >= 2, { duration: 500 });
    },
  };
}
