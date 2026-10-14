#!/usr/bin/env node
/**
 * LoomBench's pages and its one write, on this machine only: `node --env-file=<file with TYPESAFE_API_KEY> serve.mjs`,
 * then http://127.0.0.1:4330/ (`PORT` overrides). Without a key a play is woven by chance, or by a chat model.
 *
 * It serves the pages, then files under web/, engine/, bench/ and runs/ and nothing else. `POST /api/play` starts the
 * match the page sent (JSON, at most 20,000 characters: the seats, a seed and the switches) and answers a job;
 * `GET /api/play/<job>` says how far it has got, and when it is done the match is kept in runs/play. One match is run
 * at a time. It answers only this server's own page: a request from another host or another origin is refused.
 *
 * WHO CAN DECIDE (`api/status.json`, `models`): Jev when `TYPESAFE_API_KEY` is set; OpenAI's decision model and its
 * smaller current chat model when `OPENAI_API_KEY` is set; every model an Ollama on this machine has; any spec listed
 * in `LOOMBENCH_MODELS` (comma-separated `<provider>:<model>`, see bench/llm.mjs); and chance. A play names one of
 * these and nothing else.
 *
 * The pages ask for `api/runs.json`, `api/status.json` and `api/overview.json` (what the landing page draws), which this
 * server answers live; `tools/site.mjs` writes the same three as files, so the same pages work as a static copy with no server (GitHub Pages).
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JEV } from './engine/jev.mjs';
import { SEATS, SWITCHES, KNOW, personality, goal, play, recordOf } from './bench/core.mjs';
import { PROVIDERS, modelsAt, parseModel } from './bench/llm.mjs';
import { NEIGHBOURS } from './bench/solo.mjs';
import { DECISIONS } from './bench/decisions.mjs';
import { askerFor, keepMatch, overviewFrom, runList, writeIndex } from './tools/keep.mjs';

const PORT = Number(process.env.PORT ?? 4330), HOST = '127.0.0.1', ROOT = fileURLToPath(new URL('./', import.meta.url));
const PAGES = {
  '/': 'web/index.html', '/groups': 'web/groups.html', '/results': 'web/results.html', '/match': 'web/match.html', '/peers': 'web/peers.html', '/play': 'web/play.html',
  '/report': 'web/report.html', '/design': 'web/design.html', '/controls': 'web/controls.html', '/mix': 'web/mix.html', '/brief': 'web/brief.html', '/brief-objective': 'web/brief-objective.html',
};
const TREES = ['web', 'engine', 'bench', 'runs'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const BODY_LIMIT = 20000, RUNS = join(ROOT, 'runs');

/**
 * One asker for each model a play has named, made when first wanted and kept, so its spending cap is the server's.
 * An OpenAI chat model is run with its reasoning off, as the benchmark's run of it was: with it on, five agents cost
 * about $0.14 and take several times as long.
 */
const askers = new Map();
function askerOf(spec) {
  if (!askers.has(spec)) askers.set(spec, askerFor(spec, { cap: 1, ...(spec.startsWith('openai:') ? { effort: 'none' } : {}) }));
  return askers.get(spec);
}
// The server's own Jev asker is made at once, so the status can say whether there is a key.
const jev = askerOf('jev');

/** The deciders a play may name, each { spec, name, note }: asked afresh at most every 20 seconds, since a local model can come and go. */
let offered = { at: 0, list: [] };
async function modelsOffered() {
  if (Date.now() - offered.at < 20000) return offered.list;
  const list = [], add = (spec, name, note) => { if (!list.some(x => x.spec === spec)) list.push({ spec, name, note }); };
  if (jev) add('jev', `Jev (${JEV.model})`, 'about 200 calls, $0.01, 10-40 s for five agents');
  for (const spec of await modelsAt('ollama', { baseUrl: process.env.OLLAMA_BASE_URL ?? null })) add(spec, `${spec.slice('ollama:'.length)} (Ollama, this machine)`, 'a chat model on this machine: no charge, several minutes for five agents');
  // OpenAI's current models only: its decision model, and its smaller current chat model. The larger ones cost dollars a match and are run from the command line, under a cap.
  if (process.env.OPENAI_API_KEY) {
    add(`openai-decisions:${DECISIONS.model}`, `${DECISIONS.model} (OpenAI Decisions API)`, 'OpenAI\'s decision model: like Jev, it returns a probability for each option. About $0.02 and 10-15 s for five agents, charged to the OpenAI key');
    add('openai:gpt-6-luna', 'gpt-6-luna (OpenAI, chat)', 'a chat model with its reasoning off, read by the chances it states; about $0.04 and three minutes for five agents, charged to the OpenAI key');
  }
  for (const spec of (process.env.LOOMBENCH_MODELS ?? '').split(',').map(x => x.trim()).filter(Boolean)) {
    try { const { provider, model } = parseModel(spec); add(spec, `${model} (${PROVIDERS[provider].name})`, 'a chat model named in LOOMBENCH_MODELS'); } catch { /* not a spec: not offered */ }
  }
  add('chance', 'Uniform random (no model)', 'every action sampled uniformly at random: instant');
  offered = { at: Date.now(), list };
  return list;
}

/** What the landing page draws, from the kept runs: read again at most every 30 seconds, since a run can be added while the server is up. */
let overview = { at: 0, made: null };
function overviewNow() {
  if (!overview.made || Date.now() - overview.at > 30000) overview = { at: Date.now(), made: overviewFrom(ROOT) };
  return overview.made;
}

const send = (res, status, type, body) => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
const json = (res, status, body) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(body));
const notHere = res => send(res, 404, 'text/plain; charset=utf-8', 'not here');

/** A file, if its type is known and it lies inside one of the served folders; anything else is not here. */
async function serveFile(res, rel) {
  const path = resolve(ROOT, rel), type = TYPES[extname(path)];
  if (!type || !TREES.some(t => path.startsWith(resolve(ROOT, t) + sep))) return notHere(res);
  try { send(res, 200, type, await readFile(path)); } catch { notHere(res); }
}

const known = (lookup, key, what) => {
  try { return lookup(key).key; } catch { throw Error(`no such ${what}: ${JSON.stringify(key)?.slice(0, 40)}`); }
};

/**
 * A play as the page sends it, checked: five seats of known keys, a seed from 1 to 999999, and the switches (a decider
 * this server offers, the one seat that decides or null, whether areas are fixed, whether agents hear a neighbour).
 * Throws a sentence otherwise.
 */
async function checkPlay(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('send an object with seats and a seed');
  const { seats, seed, model = null, solo = null, neighbours = 'accept', area = 'free', designs = 'assigned', peers = false, know = 'none' } = body;
  if (!Array.isArray(seats) || seats.length !== SEATS) throw Error('seats: exactly five, each with a personality and a goal');
  if (!Number.isInteger(seed) || seed < 1 || seed > 999999) throw Error('seed: a whole number from 1 to 999999');
  const list = await modelsOffered(), spec = model ?? list[0].spec;
  if (!list.some(x => x.spec === spec)) throw Error(`model: one of ${list.map(x => x.spec).join(', ')}`);
  if (solo !== null && !(Number.isInteger(solo) && solo >= 0 && solo < SEATS)) throw Error('solo: null, or the seat that decides (0 to 4)');
  if (!NEIGHBOURS.includes(neighbours) || (solo === null && neighbours !== 'accept')) throw Error('neighbours: accept, refuse or chance, and only with solo');
  if (!SWITCHES.area.includes(area)) throw Error('area: free or fixed');
  if (!SWITCHES.designs.includes(designs)) throw Error('designs: assigned or chosen');
  if (designs === 'chosen' && solo !== null) throw Error('a solo match needs assigned designs');
  if (typeof peers !== 'boolean') throw Error('peers: true or false');
  if (peers && (spec === 'chance' || solo !== null || area === 'fixed')) throw Error('peer communication needs a model, five deciding agents and areas that can change');
  if (!KNOW.includes(know)) throw Error('know: none, persona, objective or both');
  return {
    seed, spec, solo, neighbours, area, designs, peers, know,
    seats: seats.map(s => ({ personality: known(personality, s?.personality, 'personality'), goal: known(goal, s?.goal, 'goal') })),
  };
}

/** The matches started from the page, by job: { state: 'running' | 'done' | 'failed', round, rounds, id, error }. One runs at a time. */
const jobs = new Map(), ROUNDS = 26;
let running = null;

/** Weaves a checked play, keeps it in runs/play, and leaves how it went on its job. */
async function runJob(job, checked) {
  let ask = null;
  try {
    // Making the asker can itself fail in a sentence (a model with no known price, a host with no address).
    if (checked.spec !== 'chance') ask = askerOf(checked.spec);
    if (checked.spec !== 'chance' && !ask) throw Error(`there is no key for ${checked.spec}`);
    const rug = await play({ seats: checked.seats, seed: checked.seed, ask, peers: checked.peers, solo: checked.solo, neighbours: checked.neighbours, area: checked.area, designs: checked.designs, know: checked.know,
      onPass: entry => { job.round = Math.max(job.round, Math.min(ROUNDS, entry.pass + 1)); } });
    if (ask?.fatal) throw Error(`The match was not run: ${ask.fatal}`);
    if (rug.stats.calls.script) throw Error(`${rug.stats.calls.script} calls had no valid response from the model, so the match was not kept. Try again`);
    const id = `p${checked.seed}-${Date.now()}`, dir = join(RUNS, 'play');
    await keepMatch(dir, recordOf(rug, { id, seats: checked.seats }), rug);
    await writeIndex(dir, 'play');
    Object.assign(job, { state: 'done', id, round: ROUNDS });
  } catch (e) {
    Object.assign(job, { state: 'failed', error: String(e.message ?? e) });
  } finally { running = null; }
}

/** `POST /api/play`: start the match and answer its job. */
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
  try { checked = await checkPlay(body); } catch (e) { return json(res, 400, { error: e.message }); }
  if (running) return json(res, 409, { error: 'A match is already running on this server. Wait for it to finish' });
  const job = `j${Date.now()}`;
  jobs.set(job, { state: 'running', round: 0, rounds: ROUNDS, id: null, error: null });
  if (jobs.size > 50) jobs.delete(jobs.keys().next().value);
  running = job;
  runJob(jobs.get(job), checked);
  json(res, 202, { job });
}

createServer(async (req, res) => {
  try {
    let path;
    try { path = decodeURIComponent(new URL(req.url ?? '/', `http://${HOST}`).pathname); } catch { return notHere(res); }
    if (path === '/api/play' && req.method === 'POST') return await playPost(req, res);
    if (req.method !== 'GET') return send(res, 405, 'text/plain; charset=utf-8', 'only GET and POST');
    if (path.startsWith('/api/play/')) { const job = jobs.get(path.slice('/api/play/'.length)); return job ? json(res, 200, job) : notHere(res); }
    if (path === '/api/status' || path === '/api/status.json') return json(res, 200, { key: jev !== null, model: JEV.model, models: await modelsOffered() });
    if (path === '/api/runs' || path === '/api/runs.json') return json(res, 200, await runList(RUNS));
    if (path === '/api/overview' || path === '/api/overview.json') return json(res, 200, await overviewNow());
    return await serveFile(res, Object.hasOwn(PAGES, path) ? PAGES[path] : path.slice(1));
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: String(e.message ?? e) });
  }
}).listen(PORT, HOST, () => {
  console.log(`LoomBench: http://${HOST}:${PORT}/ ${jev ? '(Jev key from the environment)' : '(no Jev key: a play is decided by a chat model this server can reach, or by chance)'}`);
});
