#!/usr/bin/env node
/**
 * LoomBench's pages and its one write, on this machine only: `node --env-file=<file with TYPESAFE_API_KEY> serve.mjs`,
 * then http://127.0.0.1:4330/ (`PORT` overrides). Without a key a play is woven by chance.
 *
 * It serves the three pages, then files under web/, engine/, bench/ and runs/ and nothing else. `POST /api/play` weaves
 * the bench the page sent (JSON, at most 20,000 characters) and keeps it in runs/play. It answers only this server's own
 * page: a request from another host or another origin is refused.
 */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JEV } from './engine/jev.mjs';
import { personality, goal, play, recordOf } from './bench/core.mjs';
import { environmentAsk, keepMatch, writeIndex } from './tools/keep.mjs';

const PORT = Number(process.env.PORT ?? 4330), HOST = '127.0.0.1', ROOT = fileURLToPath(new URL('./', import.meta.url));
const PAGES = { '/': 'web/index.html', '/match': 'web/match.html', '/play': 'web/play.html' };
const TREES = ['web', 'engine', 'bench', 'runs'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const BODY_LIMIT = 20000, RUNS = join(ROOT, 'runs'), ask = environmentAsk();

const send = (res, status, type, body) => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
const json = (res, status, body) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(body));
const notHere = res => send(res, 404, 'text/plain; charset=utf-8', 'not here');

/** A file, if its type is known and it lies inside one of the served folders; anything else is not here. */
async function serveFile(res, rel) {
  const path = resolve(ROOT, rel), type = TYPES[extname(path)];
  if (!type || !TREES.some(t => path.startsWith(resolve(ROOT, t) + sep))) return notHere(res);
  try { send(res, 200, type, await readFile(path)); } catch { notHere(res); }
}

/** The kept runs: every folder of runs/ with a readable index. The play run comes last, the rest newest first. */
async function runList() {
  const runs = [];
  for (const run of await readdir(RUNS).catch(() => [])) {
    try {
      const index = JSON.parse(await readFile(join(RUNS, run, 'index.json'), 'utf8'));
      runs.push({ run, model: index.model, minds: index.minds, matches: index.totals.matches, updated: index.updated });
    } catch { /* a folder without a readable index is not a run */ }
  }
  return runs.sort((a, b) => (a.run === 'play') - (b.run === 'play') || String(b.updated).localeCompare(String(a.updated)));
}

const known = (lookup, key, what) => {
  try { return lookup(key).key; } catch { throw Error(`no such ${what}: ${JSON.stringify(key)?.slice(0, 40)}`); }
};

/** A play as the page sends it, checked: five seats of known keys, and a seed from 1 to 999999. Throws a sentence otherwise. */
function checkPlay(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('send an object with seats and a seed');
  const { seats, seed } = body;
  if (!Array.isArray(seats) || seats.length !== 5) throw Error('seats: exactly five, each with a personality and a goal');
  if (!Number.isInteger(seed) || seed < 1 || seed > 999999) throw Error('seed: a whole number from 1 to 999999');
  return {
    seed, seats: seats.map(s => ({ personality: known(personality, s?.personality, 'personality'), goal: known(goal, s?.goal, 'goal') })),
  };
}

/** `POST /api/play`: weave the bench, keep it in runs/play, answer its id. */
async function playPost(req, res) {
  const host = req.headers.host ?? '', origin = req.headers.origin;
  const own = [`127.0.0.1:${PORT}`, `localhost:${PORT}`].includes(host);
  if (!own || (origin && origin !== `http://${host}`) || !/^application\/json\b/.test(req.headers['content-type'] ?? '')) {
    return json(res, 403, { error: 'only this server\'s own page may play' });
  }
  req.setEncoding('utf8');
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > BODY_LIMIT) return json(res, 413, { error: `a play is at most ${BODY_LIMIT} characters` });
  }
  let body;
  try { body = JSON.parse(text); } catch { return json(res, 400, { error: 'the body is not JSON' }); }
  let checked;
  try { checked = checkPlay(body); } catch (e) { return json(res, 400, { error: e.message }); }
  let rug;
  try { rug = await play({ seats: checked.seats, seed: checked.seed, ask }); } catch (e) {
    return json(res, 500, { error: `could not weave this bench: ${e.message}` });
  }
  const id = `p${checked.seed}-${Date.now()}`, dir = join(RUNS, 'play');
  await keepMatch(dir, recordOf(rug, { id, seats: checked.seats }), rug);
  await writeIndex(dir, 'play');
  json(res, 200, { run: 'play', id });
}

createServer(async (req, res) => {
  try {
    let path;
    try { path = decodeURIComponent(new URL(req.url ?? '/', `http://${HOST}`).pathname); } catch { return notHere(res); }
    if (path === '/api/play' && req.method === 'POST') return await playPost(req, res);
    if (req.method !== 'GET') return send(res, 405, 'text/plain; charset=utf-8', 'only GET and POST');
    if (path === '/api/status') return json(res, 200, { key: ask !== null, model: JEV.model });
    if (path === '/api/runs') return json(res, 200, await runList());
    return await serveFile(res, Object.hasOwn(PAGES, path) ? PAGES[path] : path.slice(1));
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: String(e.message ?? e) });
  }
}).listen(PORT, HOST, () => {
  console.log(`LoomBench: http://${HOST}:${PORT}/ ${ask ? '(Jev key from the environment)' : '(no key: plays are woven by chance)'}`);
});
