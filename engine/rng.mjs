/**
 * Seeded streams, and the draws made from them. Nothing in a rug comes from `Math.random`: the offers code writes, the
 * order the options are listed in, and the draw from a mind's weights each have their own stream, named by what they
 * are for, so a rug can be woven again from its seed and its tape (`loom.mjs`).
 */

/** Any mix of strings and numbers to one 32-bit seed. Streams named differently never share their first draws. */
export function mix(...parts) {
  let h = 2166136261;
  for (const part of parts) for (const ch of `${part}\u0001`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return h >>> 0;
}

/** A stream of numbers in 0..1 (mulberry32), seeded by `mix(...seed)`. */
export function rng(...seed) {
  let a = mix(...seed);
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

export function shuffled(list, rnd) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** `p` ({ key: weight }) as a distribution. */
export function normalise(p) {
  const keys = Object.keys(p), sum = keys.reduce((s, k) => s + p[k], 0);
  return Object.fromEntries(keys.map(k => [k, sum > 0 ? p[k] / sum : 1 / keys.length]));
}

/** A distribution sharpened (below 1) or flattened (above 1) by `temperature`; at 0 its top is certain. */
export function temper(p, temperature) {
  const keys = Object.keys(p);
  if (temperature <= 0.02) {
    const top = keys.reduce((a, k) => (p[k] > p[a] ? k : a), keys[0]);
    return Object.fromEntries(keys.map(k => [k, k === top ? 1 : 0]));
  }
  return normalise(Object.fromEntries(keys.map(k => [k, Math.pow(Math.max(p[k], 1e-9), 1 / temperature)])));
}

/** One key drawn from `p` at `temperature` by `r` (0..1): asked the same thing twice, a mind does not always answer alike. */
export function draw(p, temperature, r) {
  const q = temper(p, temperature), keys = Object.keys(q);
  let acc = 0;
  for (const k of keys) { acc += q[k]; if (r < acc) return k; }
  return keys.at(-1);
}

/** How sure a distribution is: 1 with all its weight on one option, 0 when flat. */
export function sureness(p) {
  const v = Object.values(p).filter(x => x > 0);
  if (v.length < 2 && Object.keys(p).length < 2) return 1;
  return 1 - v.reduce((h, x) => h - x * Math.log(x), 0) / Math.log(Object.keys(p).length);
}

/** Total variation between two distributions over the same keys: 0 the same wants, 1 nothing in common. */
export const apart = (p, q) => Object.keys(p).reduce((s, k) => s + Math.abs(p[k] - (q[k] ?? 0)), 0) / 2;

export const topOf = p => Object.keys(p).reduce((a, k) => (p[k] > p[a] ? k : a), Object.keys(p)[0]);
