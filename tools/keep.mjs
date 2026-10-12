/**
 * Keeping matches on disk: a match's record and two pictures of its rug, the index over every match kept in a run's
 * folder, and the Jev asker this process can make from its environment. Node only. Every file is written whole under a
 * temporary name and then renamed, and a match's record is written last, so a match is either kept or not there at all.
 */
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { paint } from '../engine/render.mjs';
import { jevAsker, directPost, JEV } from '../engine/jev.mjs';
import { HUES, conditionsOf, summaryOf } from '../bench/core.mjs';
import { heededCloth, rowsOfPeers } from '../bench/peers.mjs';
import { PROVIDERS, chatAsker, parseModel } from '../bench/llm.mjs';
import { decisionsAsker } from '../bench/decisions.mjs';
import { overviewOf } from '../bench/overview.mjs';
import { png } from './png.mjs';

const writeWhole = async (file, data) => {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
};

/**
 * Writes a match's pictures under `dir/thumbs/`: `<id>.png` (the rug), `<id>-who.png` (each stitch in its holder's
 * colour), `<id>-flat.png` (flat colours: who holds what, with what was taken from whom drawn over it), and, when the
 * rug has neighbours' decisions, `<id>-heard.png` (the rug read by who was heeded).
 */
export async function keepPictures(dir, id, rug) {
  await mkdir(join(dir, 'thumbs'), { recursive: true });
  const thumb = join(dir, 'thumbs', id);
  await writeWhole(`${thumb}.png`, png(paint(rug.cloth, rug.lot.dyes, { scale: 2 })));
  await writeWhole(`${thumb}-who.png`, png(paint(rug.cloth, rug.lot.dyes, { scale: 2, view: 'who', hues: HUES })));
  await writeWhole(`${thumb}-flat.png`, png(paint(rug.cloth, rug.lot.dyes, { scale: 2, view: 'flat', hues: HUES })));
  if (rug.peers?.length) {
    const heeded = heededCloth(rug.cloth, rug.peers);
    await writeWhole(`${thumb}-heard.png`, png(paint(heeded, rug.lot.dyes, { scale: 2, view: 'who', hues: HUES })));
  }
}

/**
 * Writes the match's pictures (`keepPictures`), then the record (`dir/matches/<id>.json`).
 */
export async function keepMatch(dir, record, rug) {
  await mkdir(join(dir, 'matches'), { recursive: true });
  await keepPictures(dir, record.id, rug);
  await writeWhole(join(dir, 'matches', `${record.id}.json`), JSON.stringify(record));
}

/**
 * Rebuilds `dir/index.json` from every match record in `dir/matches`, sorted by match then id, and returns it. When any
 * record has peer decisions, `dir/peers.json` lists them all (`rowsOfPeers`); otherwise a stale one is removed.
 */
export async function writeIndex(dir, run) {
  const files = (await readdir(join(dir, 'matches')).catch(() => [])).filter(f => f.endsWith('.json'));
  const records = await Promise.all(files.map(async f => JSON.parse(await readFile(join(dir, 'matches', f), 'utf8'))));
  records.sort((a, b) => (a.match ?? 0) - (b.match ?? 0) || String(a.id).localeCompare(String(b.id)));
  const sum = k => records.reduce((s, r) => s + (r[k] ?? 0), 0);
  const index = {
    loombench: 1, run, model: records[0]?.model ?? null, minds: records[0]?.minds ?? null, mode: records[0]?.mode ?? 'quiet',
    // `design`: 'uniform' when, in every match, all five agents hold one objective (a reference run); else the balanced deal.
    design: records.length && records.every(r => new Set(r.seats.map(x => x.goal)).size === 1) ? 'uniform' : 'dealt',
    rules: records[0]?.rules ?? 1,
    // The switches the run was made under (`conditionsOf`): a run is one condition, so its first match speaks for it.
    conditions: records.length ? conditionsOf(records[0]) : null,
    updated: new Date().toISOString(), matches: records.map(summaryOf),
    totals: { matches: records.length, calls: sum('calls'), ...(records.some(r => r.requests != null) ? { requests: sum('requests') } : {}), ...(records.some(r => r.reasked) ? { reasked: sum('reasked') } : {}), ...(records.some(r => r.unanswered) ? { unanswered: sum('unanswered') } : {}), dollars: sum('dollars'), seconds: sum('seconds') },
  };
  await mkdir(dir, { recursive: true });
  await writeWhole(join(dir, 'index.json'), JSON.stringify(index, null, 2));
  if (records.some(r => r.peers?.length)) {
    await writeWhole(join(dir, 'peers.json'), JSON.stringify({ loombench: 1, run, rows: records.flatMap(rowsOfPeers) }));
  } else await rm(join(dir, 'peers.json'), { force: true });
  return index;
}

/** The kept runs under `runsDir`: every folder with a readable index. The play run comes last, the rest newest first. */
export async function runList(runsDir) {
  const runs = [];
  for (const run of await readdir(runsDir).catch(() => [])) {
    try {
      const index = JSON.parse(await readFile(join(runsDir, run, 'index.json'), 'utf8'));
      runs.push({
        run, model: index.model, minds: index.minds, mode: index.mode ?? 'quiet', design: index.design ?? 'dealt',
        rules: index.rules ?? 1, matches: index.totals.matches, updated: index.updated, conditions: index.conditions ?? null,
      });
    } catch { /* a folder without a readable index is not a run */ }
  }
  return runs.sort((a, b) => (a.run === 'play') - (b.run === 'play') || String(b.updated).localeCompare(String(a.updated)));
}

/** What the landing page draws (`bench/overview.mjs`), read from the runs kept under `root` (the repository, or a copy of it with `runs/`). */
export function overviewFrom(root) {
  return overviewOf(async path => (path === 'api/runs.json' ? runList(join(root, 'runs')) : JSON.parse(await readFile(join(root, path), 'utf8'))));
}

/**
 * A Jev asker from `TYPESAFE_API_KEY` (and `TYPESAFE_BASE_URL`), each failed call tried twice more; null without a key.
 * `ask.fatal` becomes a sentence once the account has no credit or the key is refused: no later call can succeed, so
 * whoever is running matches should stop. (The loom itself never stops for a failed call: it decides by its own seeded
 * stream and counts a fallback, which is right for a page and wrong for a benchmark, so the runner checks.)
 */
export function environmentAsk() {
  const apiKey = process.env.TYPESAFE_API_KEY, baseUrl = process.env.TYPESAFE_BASE_URL ?? JEV.url;
  if (!apiKey && baseUrl === JEV.url) return null;
  const post = directPost({ apiKey, baseUrl }), state = { fatal: null };
  const tried = async body => {
    for (let attempt = 1; ; attempt++) {
      try { return await post(body); } catch (e) {
        if (/^Jev (401|402|403)$/.test(e.message)) {
          state.fatal = e.message === 'Jev 402' ? 'the model account has no credit (HTTP 402)' : `the model refused the key (${e.message})`;
          throw e;
        }
        if (attempt === 3) throw e;
        await new Promise(done => setTimeout(done, 400));
      }
    }
  };
  return Object.defineProperty(jevAsker(tried, { budget: 100000 }), 'fatal', { get: () => state.fatal });
}

/**
 * The asker for a model spec, from this process's environment: 'jev' (`environmentAsk`), 'openai-decisions:<model>'
 * (OpenAI's decision model, `bench/decisions.mjs`) or '<provider>:<model>' (a chat model, `bench/llm.mjs`), its key
 * read from the provider's variable and its address from `<PROVIDER>_BASE_URL` when
 * that is set; `LLM_AT_ONCE` overrides how many requests are in flight together. Null when the key it needs is not set.
 * Throws a sentence for a spec that is not one.
 */
export function askerFor(spec = 'jev', { read = null, effort = null, prices = null, cap = 1 } = {}) {
  if (spec === 'jev') return environmentAsk();
  const { provider, model } = parseModel(spec), P = PROVIDERS[provider];
  const apiKey = P.keyEnv ? process.env[P.keyEnv] ?? null : null;
  const baseUrl = process.env[P.urlEnv ?? `${provider.toUpperCase().replace(/-/g, '_')}_BASE_URL`] ?? null;
  if (P.keyEnv && !apiKey && P.url) return null;
  if (P.api === 'decisions') return decisionsAsker({ apiKey, model, cap, ...(baseUrl ? { baseUrl } : {}) });
  const atOnce = Number(process.env.LLM_AT_ONCE) || null;
  return chatAsker({ provider, model, read, effort, apiKey, baseUrl, prices, cap, atOnce });
}
