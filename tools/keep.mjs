/**
 * Keeping matches on disk: a match's record and two pictures of its rug, the index over every match kept in a run's
 * folder, and the Jev asker this process can make from its environment. Node only. Every file is written whole under a
 * temporary name and then renamed, and a match's record is written last, so a match is either kept or not there at all.
 */
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { paint } from '../engine/render.mjs';
import { jevAsker, directPost, JEV } from '../engine/jev.mjs';
import { HUES, summaryOf } from '../bench/core.mjs';
import { png } from './png.mjs';

const writeWhole = async (file, data) => {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
};

/**
 * Writes the rug as two pictures (`dir/thumbs/<id>.png`, and `<id>-who.png` with each stitch in its holder's colour),
 * then the record (`dir/matches/<id>.json`).
 */
export async function keepMatch(dir, record, rug) {
  await mkdir(join(dir, 'matches'), { recursive: true });
  await mkdir(join(dir, 'thumbs'), { recursive: true });
  const thumb = join(dir, 'thumbs', record.id);
  await writeWhole(`${thumb}.png`, png(paint(rug.cloth, rug.lot.dyes, { scale: 2 })));
  await writeWhole(`${thumb}-who.png`, png(paint(rug.cloth, rug.lot.dyes, { scale: 2, view: 'who', hues: HUES })));
  await writeWhole(join(dir, 'matches', `${record.id}.json`), JSON.stringify(record));
}

/** Rebuilds `dir/index.json` from every match record in `dir/matches`, sorted by match then id, and returns it. */
export async function writeIndex(dir, run) {
  const files = (await readdir(join(dir, 'matches')).catch(() => [])).filter(f => f.endsWith('.json'));
  const records = await Promise.all(files.map(async f => JSON.parse(await readFile(join(dir, 'matches', f), 'utf8'))));
  records.sort((a, b) => (a.match ?? 0) - (b.match ?? 0) || String(a.id).localeCompare(String(b.id)));
  const sum = k => records.reduce((s, r) => s + (r[k] ?? 0), 0);
  const index = {
    loombench: 1, run, model: records[0]?.model ?? null, minds: records[0]?.minds ?? null, updated: new Date().toISOString(),
    matches: records.map(summaryOf),
    totals: { matches: records.length, calls: sum('calls'), dollars: sum('dollars'), seconds: sum('seconds') },
  };
  await mkdir(dir, { recursive: true });
  await writeWhole(join(dir, 'index.json'), JSON.stringify(index, null, 2));
  return index;
}

/** A Jev asker from `TYPESAFE_API_KEY` (and `TYPESAFE_BASE_URL`), each failed call tried twice more; null without a key. */
export function environmentAsk() {
  const apiKey = process.env.TYPESAFE_API_KEY, baseUrl = process.env.TYPESAFE_BASE_URL ?? JEV.url;
  if (!apiKey && baseUrl === JEV.url) return null;
  const post = directPost({ apiKey, baseUrl });
  const tried = async body => {
    for (let attempt = 1; ; attempt++) {
      try { return await post(body); } catch (e) {
        if (attempt === 3) throw e;
        await new Promise(done => setTimeout(done, 400));
      }
    }
  };
  return jevAsker(tried, { budget: 100000 });
}
