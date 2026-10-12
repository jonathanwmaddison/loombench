#!/usr/bin/env node
/**
 * The static copy of the site, for a host with no server (GitHub Pages): `node tools/site.mjs [--out DIR]`, default
 * `_site/`. The folder is emptied and rebuilt.
 *
 *   <page>.html            the seven pages, side by side at the top, so /report and /match?run=… work as they do locally
 *   web/ engine/ bench/    the pages' styles, scripts and figures, and the modules they import
 *   runs/                  every kept run but `play`: indexes, records and pictures
 *   api/runs.json          what the server answers at /api/runs, written once
 *   api/status.json        { static: true, models }: the Play page shows its switches and how to run a match locally,
 *                          instead of running one
 *
 * Every address in the pages is relative, so the copy works under any base path.
 */
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JEV } from '../engine/jev.mjs';
import { runList } from './keep.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PAGES = ['index', 'match', 'peers', 'play', 'report', 'design', 'controls', 'mix', 'brief', 'brief-objective'];
const args = process.argv.slice(2), at = args.indexOf('--out');
if (args.some((a, i) => a !== '--out' && i !== at + 1) || (at >= 0 && !args[at + 1])) {
  console.error('usage: node tools/site.mjs [--out DIR]');
  process.exit(1);
}
const OUT = resolve(ROOT, at >= 0 ? args[at + 1] : '_site');
if (OUT === resolve(ROOT) || !OUT.startsWith(resolve(ROOT) + '/')) {
  console.error(`--out must be a folder inside the repository, not ${OUT}`);
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'api'), { recursive: true });
for (const page of PAGES) await cp(join(ROOT, 'web', `${page}.html`), join(OUT, `${page}.html`));
// web/ without its pages (they are at the top) and without the component kit, which is a development aid
await cp(join(ROOT, 'web'), join(OUT, 'web'), { recursive: true, filter: source => !source.endsWith('.html') });
for (const tree of ['engine', 'bench']) await cp(join(ROOT, tree), join(OUT, tree), { recursive: true });
const runs = (await runList(join(ROOT, 'runs'))).filter(r => r.run !== 'play');
for (const { run } of runs) await cp(join(ROOT, 'runs', run), join(OUT, 'runs', run), { recursive: true });
await writeFile(join(OUT, 'api', 'runs.json'), JSON.stringify(runs));
// The published copy runs nothing, but its Play page still shows the switches: the deciders a server would offer are listed for it.
const models = [{ spec: 'jev', name: `Jev (${JEV.model})`, note: 'The default decision model: about 200 calls and $0.01 for five agents.' },
  { spec: 'chance', name: 'Uniform random (no model)', note: 'Every action sampled uniformly at random.' }];
await writeFile(join(OUT, 'api', 'status.json'), JSON.stringify({ key: false, model: JEV.model, static: true, models }));
await writeFile(join(OUT, '.nojekyll'), '');

const count = async dir => {
  let n = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) n += entry.isDirectory() ? await count(join(dir, entry.name)) : 1;
  return n;
};
console.log(`${OUT}: ${PAGES.length} pages, ${runs.length} runs (${runs.map(r => r.run).join(', ')}), ${await count(OUT)} files`);
