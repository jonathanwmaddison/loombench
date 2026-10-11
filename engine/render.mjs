/**
 * THE PICTURE: a cloth as pixels. Pure, and the same on the page and the command line: it writes RGBA into a plain
 * array, which the page puts on a canvas and `tools/png.mjs` writes to a file. Rows are painted one at a time, so a
 * timelapse repaints only what was woven since the last frame.
 *
 * Above the last woven row the bare warp shows, as on a loom; the fringe at the top appears when the rug is finished.
 */
import { MARK, GUILD, UNDYED, DARK } from './cloth.mjs';

export const VIEW = Object.freeze({ scale: 6, margin: 4, fringe: 5, wall: [233, 228, 218] });

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hash = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** An empty picture for `cloth`: the wall, and the shadow the rug throws on it. */
export function frame(cloth, o = {}) {
  const v = { ...VIEW, ...o }, s = v.scale, width = (cloth.W + 2 * v.margin) * s, height = (cloth.H + 2 * (v.margin + v.fringe)) * s;
  const img = { width, height, data: new Uint8ClampedArray(width * height * 4), s, ox: v.margin * s, oy: (v.margin + v.fringe) * s, v, top: -1, done: false };
  const rx0 = img.ox + 4, ry0 = img.oy + 5, rx1 = img.ox + cloth.W * s + 4, ry1 = img.oy + cloth.H * s + 5;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = Math.max(rx0 - x, 0, x - rx1), dy = Math.max(ry0 - y, 0, y - ry1), d = Math.hypot(dx, dy), k = d < 14 ? 1 - 0.2 * (1 - d / 14) ** 2 : 1, i = (y * width + x) * 4;
    img.data[i] = v.wall[0] * k; img.data[i + 1] = v.wall[1] * k; img.data[i + 2] = v.wall[2] * k; img.data[i + 3] = 255;
  }
  return img;
}

function px(img, x, y, c, k = 1) { const i = (y * img.width + x) * 4; img.data[i] = c[0] * k; img.data[i + 1] = c[1] * k; img.data[i + 2] = c[2] * k; }

/** One strand of fringe (or of bare warp) below or above the rug at warp `x`. */
function strand(img, lot, x, y0, y1, k) {
  const s = img.s, c = lot[UNDYED], a = img.ox + x * s + (s >> 1) - 1, shade = 0.82 + 0.16 * hash(x, 7);
  for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y++) for (let i = 0; i < 2; i++) px(img, a + i, y, c, shade * k * (1 - 0.1 * ((y >> 1) & 1)) * (i ? 0.9 : 1));
}

/**
 * Rows `y0` up to (not including) `y1` painted into `img`: woven rows as stitches, rows not yet woven (at or above
 * `shown`) as bare warp. `view` is 'cloth'; or 'who', every stitch tinted by whose ground it is in; or 'ideas', by whose
 * idea put it there (`hues`, one per weaver). A stitch of two (a ground held together, one weaver's pattern in another's
 * colour) is striped in both, so the two readings of one cloth can be laid side by side.
 */
export function paintRows(img, cloth, dyes, y0, y1, { shown = cloth.rows, view = 'cloth', hues = [] } = {}) {
  const s = img.s, W = cloth.W, lot = dyes.map(d => rgb(d.hex)), wall = img.v.wall, who = hues.map(rgb);
  const first = view === 'ideas' ? cloth.by : cloth.own, second = view === 'ideas' ? cloth.by2 : cloth.own2;
  for (let y = y0; y < y1; y++) {
    const top = img.oy + (cloth.H - 1 - y) * s;
    if (y >= shown) {
      for (let j = 0; j < s; j++) for (let x = 0; x < W * s; x++) px(img, img.ox + x, top + j, wall, 0.8);
      for (let x = 0; x < W; x++) strand(img, lot, x, top, top + s, 0.86);
      continue;
    }
    for (let x = 0; x < W; x++) {
      const i = y * W + x, dye = cloth.dye[i], mark = cloth.mark[i];
      if (mark & MARK.bare) {
        // Bare warp: nothing woven here, so the threads show with the wall dim behind them.
        for (let j = 0; j < s; j++) for (let q = 0; q < s; q++) {
          const thread = q === (s >> 1) - 1 || q === (s >> 1);
          px(img, img.ox + x * s + q, top + j, thread ? lot[UNDYED] : wall, thread ? (0.8 + 0.14 * hash(x, 7)) * (1 - 0.1 * (((top + j) >> 1) & 1)) : 0.62);
        }
        continue;
      }
      let c = lot[dye];
      // Abrash: a dye lot never takes evenly, so each colour drifts a little from row to row.
      let k = 1 + 0.05 * (Math.sin(y * 0.37 + dye * 1.7) * 0.6 + Math.sin(y * 0.11 + dye * 4.1) * 0.4) + 0.05 * (hash(x, y) - 0.5);
      if (view !== 'cloth') { const w = ((x + y) >> 1) & 1 ? second[i] : first[i], lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255; c = w >= 0 ? who[w] : [206, 201, 190]; k *= 0.74 + 0.36 * lum; }
      for (let j = 0; j < s; j++) {
        const rowK = j === 0 ? 1.05 : j === s - 1 ? 0.86 : 1;
        for (let q = 0; q < s; q++) {
          let m = k * rowK * (q === 0 ? 0.88 : q === s - 1 ? 0.93 : q === (s >> 1) ? 1.04 : 1);
          if (mark & MARK.slit && q < 2) m *= q ? 0.55 : 0.22;
          if (mark & MARK.knot) m *= Math.abs(q - s / 2 + 0.5) + Math.abs(j - s / 2 + 0.5) < s / 2 - 0.5 ? 1.7 : 0.8;
          px(img, img.ox + x * s + q, top + j, c, m);
        }
      }
    }
  }
}

/** The fringes: the bottom one as soon as anything is woven, the top one when the rug is finished. */
export function paintFringe(img, cloth, dyes, { shown = cloth.rows } = {}) {
  const s = img.s, lot = dyes.map(d => rgb(d.hex)), len = x => Math.round(img.v.fringe * s * (0.7 + 0.3 * hash(x, 3)));
  const bottom = img.oy + cloth.H * s, done = shown >= cloth.H;
  for (let x = 0; x < cloth.W; x++) {
    strand(img, lot, x, bottom, bottom + len(x), 1);
    for (let i = 0; i < 2; i++) px(img, img.ox + x * s + (s >> 1) - 1 + i, bottom, lot[DARK], 1.6);
    if (done) strand(img, lot, x, img.oy - len(x + 91), img.oy, 1); else strand(img, lot, x, 0, img.oy, 0.86);
  }
}

/** The whole picture of `cloth` with `shown` rows woven. */
export function paint(cloth, dyes, o = {}) {
  const img = frame(cloth, o), shown = o.shown ?? cloth.rows;
  paintRows(img, cloth, dyes, 0, cloth.H, { ...o, shown });
  paintFringe(img, cloth, dyes, { shown });
  return img;
}

/** A small piece of cloth on its own, every row woven, with no wall, shadow or fringe: for a pattern book. */
export function swatch(cloth, dyes, scale = 4) {
  const img = frame(cloth, { scale, margin: 0, fringe: 0 });
  paintRows(img, cloth, dyes, 0, cloth.H, { shown: cloth.H });
  return img;
}

/** Whose stitch is under picture pixel (`px`, `py`): the warp, the row, and what the cloth holds there. Null off the rug. */
export function stitchAt(img, cloth, pxX, pxY) {
  const x = Math.floor((pxX - img.ox) / img.s), y = cloth.H - 1 - Math.floor((pxY - img.oy) / img.s);
  if (x < 0 || x >= cloth.W || y < 0 || y >= cloth.H) return null;
  const i = y * cloth.W + x;
  return { x, y, own: cloth.own[i], own2: cloth.own2[i], by: cloth.by[i], by2: cloth.by2[i], dye: cloth.dye[i], mark: cloth.mark[i], pass: cloth.pass[y], guild: cloth.own[i] === GUILD };
}
