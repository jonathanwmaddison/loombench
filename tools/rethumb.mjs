#!/usr/bin/env node
/**
 * Draws again every picture of a kept run from its records, asking nobody. Each match is woven again from its record,
 * a match with neighbours speaking gets its decisions back before its pictures are drawn (so `-heard.png` is written
 * too), and the pictures are written under runs/<run>/thumbs/.
 *
 *   node tools/rethumb.mjs --run jev-peers
 *
 * --run NAME    the folder under runs/ (required; the run must be kept)
 */
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replay } from '../bench/core.mjs';
import { keepPictures } from './keep.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const USAGE = 'usage: node tools/rethumb.mjs --run NAME';
const fail = message => { console.error(message); process.exit(1); };

const args = process.argv.slice(2);
const at = args.indexOf('--run');
const run = at >= 0 ? args[at + 1] : undefined;
if (!run || run.startsWith('--')) fail(`--run needs the name of a kept run. ${USAGE}`);

const dir = join(ROOT, 'runs', run), matches = join(dir, 'matches');
if (!(await access(matches).then(() => true, () => false))) fail(`There is no kept run called "${run}" under runs/. ${USAGE}`);

const files = (await readdir(matches)).filter(f => f.endsWith('.json')).sort();
let drawn = 0;
for (const file of files) {
  const record = JSON.parse(await readFile(join(matches, file), 'utf8'));
  const rug = await replay(record);
  if (record.peers?.length) rug.peers = record.peers;
  await keepPictures(dir, record.id, rug);
  const decisions = record.peers?.length ? `${record.peers.length} neighbour decisions` : 'quiet';
  console.log(`${record.id} "${record.name}" drawn · ${decisions}`);
  drawn++;
}
console.log(`${drawn} ${drawn === 1 ? 'match' : 'matches'} drawn in runs/${run}/thumbs`);
