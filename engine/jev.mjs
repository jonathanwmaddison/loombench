/**
 * JEV (`POST /v1/systemone`): a body of questions asked at once over one state, each a `choice` among written options
 * (answered with a probability for every option) or a `score` along written anchors (answered with a place among them).
 * It never writes a word. This file is the whole of what the loom knows about it: the request's shape, the check every
 * answer must pass, and a daily budget. Whoever calls supplies `post`, so the same code asks from the page (through
 * `serve.mjs`, which holds the key) and from the command line.
 */
export const JEV = Object.freeze({
  model: 'jev-1.13.0',
  url: 'https://api.typesafe.ai',
  timeoutMs: 8000,     // Past this the loom decides by its own stream; nobody sits waiting on a model.
  budget: 12000,       // Calls a day, each tried once. A rug of five is about 250 calls and a cent and a half.
  bytes: 65536,        // The largest answer read.
  dollarsPerToken: 0.042e-6,   // Input; output is free.
});

/** A score answer as 0..1: its expected place among `anchors` anchors, over the last. */
export const unit = (a, anchors) => (a && Number.isFinite(a.score) ? Math.max(0, Math.min(1, a.score / Math.max(1, anchors - 1))) : null);

/**
 * A choice among `keys`: its probabilities a distribution over exactly them, the choice the likeliest. Throws otherwise.
 * Jev rounds each probability to two places, so a true distribution can arrive summing to 0.99 and its choice can
 * trail a rounded tie by a hundredth (8 of 390 answers, measured 6 October 2026). Both are allowed; anything more is not.
 */
export function validChoice(a, keys) {
  const ok = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1, p = a?.probabilities;
  if (!p || !keys.includes(a.choice) || Object.keys(p).sort().join() !== [...keys].sort().join() || !Object.values(p).every(ok)
    || Math.abs(Object.values(p).reduce((s, n) => s + n, 0) - 1) > 0.006 * (keys.length + 1) || Object.values(p).some(n => n > p[a.choice] + 0.011)) throw Error('invalid choice');
  return a;
}

/** A score within its anchors. Throws otherwise. */
export function validScore(a, anchors) {
  if (!a || !Number.isFinite(a.score) || a.score < -1e-6 || a.score > anchors - 1 + 1e-6) throw Error('invalid score');
  return a;
}

/** Every answer of a body checked against its question. An answer that names an option code never wrote is refused whole. */
export function validAnswers(body, answers) {
  if (!answers || typeof answers !== 'object') throw Error('no answers');
  for (const [k, q] of Object.entries(body.questions)) {
    if (q.type === 'choice') validChoice(answers[k], Object.keys(q.criteria));
    else validScore(answers[k], q.criteria.length);
  }
  return answers;
}

/**
 * `ask(body)`: one Jev call, its answers checked. `post(body)` sends it and returns the parsed reply. Counted against
 * `budget` by UTC day; `ask.used()` is what has been spent, in calls, input tokens and dollars.
 */
export function jevAsker(post, { budget = JEV.budget, now = () => Date.now() } = {}) {
  let day = '', asked = 0, tokens = 0;
  const ask = async body => {
    const d = new Date(now()).toISOString().slice(0, 10);
    if (d !== day) { day = d; asked = 0; tokens = 0; }
    if (asked >= budget) throw Error('over the day\'s budget');
    asked++;
    const reply = await post(body), answers = validAnswers(body, reply?.answers);
    // What the call cost, as Jev counted it (or about four characters to a token). Carried beside the answers, not in them, so a tape stays answers only.
    const input = reply?.usage?.input_tokens ?? Math.round(JSON.stringify(body).length / 4);
    tokens += input;
    return Object.defineProperty(answers, 'tokens', { value: input, enumerable: false });
  };
  ask.used = () => ({ day, asked, budget, tokens, dollars: tokens * JEV.dollarsPerToken });
  return ask;
}

/** `post` for a process that holds the key itself (the command line; the server's proxy). */
export function directPost({ apiKey, baseUrl = JEV.url, timeoutMs = JEV.timeoutMs, fetchImpl = fetch }) {
  const target = new URL(baseUrl.replace(/\/+$/, '') + '/v1/systemone');
  if (target.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw Error('Jev needs HTTPS');
  return async body => {
    const response = await fetchImpl(target, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify(body) });
    if (!response.ok) throw Error(`Jev ${response.status}`);
    const text = await response.text();
    if (text.length > JEV.bytes) throw Error('answer too large');
    return JSON.parse(text);
  };
}
