// Figure 1 of the Overview: one match as a loom. Five agents share the cloth; each round an agent is given a probability
// for each of its legal actions and one is sampled and woven; after the last round the final shares are scored.
//
// Steps (the words of each are in web/index.mjs):
//   -1  the empty loom
//    0  the start: five equal shares, and the agents with their persona and objective
//    1  one decision: the probability of each action for one agent in one round, the sampled one marked
//    2  twenty-six rounds woven: the cloth built up, the round counted
//    3  the final shares, counted up, each with its objective attained or not
//
// Every element is made once, in its state at step -1. `step(i)` then says where each belongs at step i.

/** Draws the figure into `stage` from the overview's `data`, and returns { step }. */
export default function mount(stage, data, kit) {
  const { svg, text, to, fade, count, hint, chart, loom, COLOR, EASE } = kit;
  const o = data.opening, seat = n => o.seats.find(s => s.seat === n);
  const { root, W, H, narrow } = chart(stage, {
    height: (w, tallest) => tallest,
    label: `One match of ${o.seats.length} agents sharing a loom: each round a probability for each action, one sampled, then the final shares scored against each objective.`,
  });

  // The cloth on the left (on a phone, the top band), the panel on the right (on a phone, below the cloth).
  // On a phone the cloth takes the top 54% of H, unless a short figure leaves the panel less than its rows need.
  const pad = 8, split = Math.min(Math.round(H * 0.54), H - 230);
  const box = narrow
    ? { x: pad, y: pad, w: W - 2 * pad, h: split - 24 - pad }
    : { x: pad, y: pad, w: Math.round(W * 0.56) - pad, h: H - pad - 40 };
  const px = narrow ? pad : Math.round(W * 0.6), pw = narrow ? W - 2 * pad : W - pad - px;
  const py = narrow ? split + 8 : pad, ph = narrow ? H - py - pad : H - 2 * pad;

  const clothG = svg('g');
  root.append(clothG);
  const cloth = loom(clothG, o, { ...box, labels: 'full', emphasis: o.focal });
  // Every count of the counter passes the same words, since a count keeps only the words of its own call.
  const rounds = { prefix: 'round ', suffix: ` of ${cloth.rounds}` };
  const counter = text('', { x: pad, y: narrow ? split - 8 : H - 12, class: 't small', opacity: 0 });
  count(counter, 0, rounds);

  // ---- the panel: three groups, one shown at a time ------------------------------------------------------------------
  const cast = svg('g', { opacity: 0 }), query = svg('g', { opacity: 0 }), result = svg('g', { opacity: 0 });
  root.append(cast, query, result, counter);

  cast.append(text('The agents', { x: px, y: py + 12, class: 't small strong' }));
  const castP = Math.min(narrow ? 40 : 34, (ph - 40) / o.order.length);
  const castRows = o.order.map((n, k) => {
    const s = seat(n), y = py + 36 + k * castP, nameW = s.name.length * 8;
    const rest = `${s.persona} → ${s.objectiveKey === 'none' ? 'no objective' : s.objective}`;
    // The persona and objective sit beside the name when they fit, else under it.
    const oneLine = 18 + nameW + 10 + rest.length * 7.2 <= pw;
    const row = svg('g', { opacity: 0 },
      svg('rect', { x: px, y: y - 9, width: 10, height: 10, rx: 2, fill: s.hue }),
      text(s.name, { x: px + 18, y, class: 't strong' }),
      text(rest, { x: oneLine ? px + 30 + nameW : px + 18, y: oneLine ? y : y + 16, class: 't' }),
      hint(svg('rect', { x: px, y: y - 12, width: pw, height: castP - 2, fill: 'transparent' }), `${s.name}: ${rest}`));
    cast.append(row);
    return row;
  });

  const opts = [...o.decision.options].sort((a, b) => b.p - a.p);
  // The sampled option's bar grows last, so the reader sees the draw after the odds.
  const queued = [...opts.filter(q => !q.sampled), ...opts.filter(q => q.sampled)];
  const wordsOf = q => ({
    maintain: 'Maintain position', claim: `Claim share from ${q.to}`,
    concede: `Concede share to ${q.to}`, propose: `Propose joint ownership with ${q.to}`,
  })[q.act];
  query.append(text(`${o.decision.name}, round ${o.decision.round}`, { x: px, y: py + 12, class: 't small strong' }),
    text('probability of each option', { x: px, y: py + 28, class: 't small mute' }));
  const qP = Math.min(narrow ? 36 : 44, (ph - 60) / opts.length);
  const options = opts.map((q, k) => {
    const y = py + 56 + k * qP, track = y + 12, words = wordsOf(q), w = pw * q.p / 100;
    const bar = svg('rect', { x: px, y: track - 5, width: 0, height: 10, rx: 3, fill: q.sampled ? COLOR.accent : COLOR.axis });
    const value = text('', { x: px + 6, y: track + 4, class: 't small strong' });
    count(value, 0, { suffix: '%' });
    // 'sampled' sits on the words line when they leave room for it, else on the track line.
    const onWords = words.length * 7.5 + 12 + 44 <= pw;
    query.append(svg('rect', { x: px, y: track - 0.5, width: pw, height: 1, fill: COLOR.hairline }),
      text(words, { x: px, y, class: q.sampled ? 't strong' : 't' }), bar, value);
    if (q.sampled) query.append(text('sampled', { x: px + pw, y: onWords ? y : track + 4, 'text-anchor': 'end', class: 't small' }));
    query.append(hint(svg('rect', { x: px, y: y - 14, width: pw, height: qP - 4, fill: 'transparent' }),
      `${words}: ${q.p}%${q.sampled ? ', the one sampled' : ''}`));
    return { q, bar, value, w, k: queued.indexOf(q) };
  });

  result.append(text('Final share and objective', { x: px, y: py + 12, class: 't small strong' }));
  const rP = Math.min(narrow ? 36 : 44, (ph - 44) / o.order.length);
  const finals = o.order.map((n, k) => {
    const s = seat(n), y = py + 36 + k * rP, strong = s.seat === o.focal ? 't strong' : 't';
    const line = s.objectiveKey === 'none' ? 'no objective' : `${s.objective}: ${s.attained ? '✓ attained' : '✗ not attained'}`;
    const share = text('', { x: px + pw, y, 'text-anchor': 'end', class: strong });
    count(share, 0, { suffix: '%' });
    result.append(svg('rect', { x: px, y: y - 9, width: 10, height: 10, rx: 2, fill: s.hue }),
      text(s.name, { x: px + 18, y, class: strong }), share, text(line, { x: px + 18, y: y + 16, class: 't small' }),
      hint(svg('rect', { x: px, y: y - 12, width: pw, height: rP - 2, fill: 'transparent' }), `${s.name}: final share ${s.share}%, ${line}`));
    return { s, share };
  });

  // ---- the steps ------------------------------------------------------------------------------------------------------
  // A group comes in once the group before it has gone; it goes at once.
  const panel = (g, on) => fade(g, on, { duration: 350, delay: on ? 350 : 0 });

  return {
    step(i) {
      panel(cast, i === 0 || i === 2);
      panel(query, i === 1);
      panel(result, i === 3);

      // The rows of the cast come in one after another at the start, and are simply there at step 2.
      castRows.forEach((row, k) => {
        const on = i === 0 || i === 2;
        to(row, { opacity: on ? 1 : 0 }, i === 0 ? { duration: 350, delay: 350 + k * 70 } : { duration: 0, delay: i === 2 ? 0 : 350 });
      });

      options.forEach(({ q, bar, value, w, k }) => {
        const on = i === 1, wait = on ? { duration: 600, delay: k * 90 } : { duration: 0, delay: 350 };
        to(bar, { width: on ? w : 0 }, wait);
        to(value, { x: px + (on ? w : 0) + 6 }, wait);
        count(value, on ? q.p : 0, { suffix: '%', ...wait });
      });

      fade(counter, i >= 1, { duration: 350 });
      if (i === 1) count(counter, o.decision.round - 1, { ...rounds, duration: 900 });
      else if (i === 2) count(counter, cloth.rounds, { ...rounds, duration: 4200, ease: EASE.linear });
      else if (i === 3) count(counter, cloth.rounds, { ...rounds, duration: 600 });
      else count(counter, 0, { ...rounds, duration: 0, delay: 350 });

      if (i === 1) cloth.show(o.decision.round - 1, { duration: 900 });
      else if (i === 2) cloth.show(cloth.rounds, { duration: 4200, ease: EASE.linear });
      else if (i === 3) cloth.show(cloth.rounds, { duration: 600 });
      else cloth.show(0);

      finals.forEach(({ s, share }) => count(share, i === 3 ? s.share : 0,
        { suffix: '%', ...(i === 3 ? { duration: 600, delay: 350 } : { duration: 0, delay: 350 }) }));
    },
  };
}
