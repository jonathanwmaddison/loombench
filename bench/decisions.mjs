/**
 * OPENAI'S DECISION MODEL IN JEV'S PLACE. OpenAI's Decisions API (`POST /v1/decisions`, public beta from 6 October
 * 2026, model `gpt-6-luna`) is the same kind of thing Jev is: one request holds an input and several questions, and
 * each `choice` is answered with a probability for every option, each `score` with an expected place among ordered
 * levels. It writes no text. So a Jev body maps onto it one field at a time, with nothing rephrased:
 *
 *   Jev                                             Decisions API
 *   state { key: text }                             input: the texts, one to a line
 *   questions[k] { type: 'choice',                  questions[] { type: 'choice', name: k,
 *     instructions, criteria { o1: text, … } }        instructions, choices [{ value: 'o1', description: text }, …] }
 *   questions[k] { type: 'score',                   questions[] { type: 'score', name: k,
 *     instructions, criteria [anchor, …] }            instructions, levels [{ label: '1', description: anchor }, …] }
 *   answers[k] { choice, probabilities { o1: p } }  answers[] { name: k, choice, probabilities [{ value, probability }] }
 *   answers[k] { score }                            answers[] { name: k, score }   (the mean level index, from 0)
 *
 * Every question of a call goes in one request, as with Jev. A choice with one option is not sent. An answer of type
 * `refusal`, or one that does not give a probability for exactly the options sent, fails the call, and the loom counts
 * a fallback. The schema is the one in OpenAI's Decisions guide; `decisionRequest` and `decisionAnswers` are the whole
 * of what this file knows about it. Imports nothing, so it runs in Node and in the browser.
 */
export const DECISIONS = Object.freeze({
  model: 'gpt-6-luna',             // the only model the API takes (October 2026)
  url: 'https://api.openai.com/v1',
  dollarsPerToken: 0.10e-6,        // input; nothing is charged for output
  timeoutMs: 30000,
  atOnce: 8,
});

/** A Jev body as a Decisions request. Questions with one option are left out: there is nothing to decide. */
export function decisionRequest(body, model = DECISIONS.model) {
  const questions = [];
  for (const [name, q] of Object.entries(body.questions)) {
    if (q.type === 'choice') {
      const choices = Object.entries(q.criteria).map(([value, description]) => ({ value, description }));
      if (choices.length > 1) questions.push({ type: 'choice', name, instructions: q.instructions, choices });
    } else if (q.criteria.length > 1) {
      questions.push({ type: 'score', name, instructions: q.instructions, levels: q.criteria.map((description, i) => ({ label: String(i + 1), description })) });
    }
  }
  return { model, input: Object.values(body.state ?? {}).join('\n'), questions };
}

/** A Decisions reply as Jev's answers to `body`. Throws a sentence when an answer is missing, refused or not a distribution over the options sent. */
export function decisionAnswers(body, reply) {
  const given = new Map((Array.isArray(reply?.answers) ? reply.answers : []).map(a => [a?.name, a])), answers = {};
  for (const [name, q] of Object.entries(body.questions)) {
    const choice = q.type === 'choice', keys = choice ? Object.keys(q.criteria) : q.criteria.map((_, i) => i);
    if (keys.length === 1) { answers[name] = choice ? { type: 'choice', choice: keys[0], confidence: 1, probabilities: { [keys[0]]: 1 } } : { type: 'score', score: 0 }; continue; }
    const a = given.get(name);
    if (!a) throw Error(`the decision model gave no answer to "${name}"`);
    if (a.type === 'refusal') throw Error(`the decision model refused "${name}"`);
    if (!choice) {
      if (a.type !== 'score' || typeof a.score !== 'number' || !(a.score >= -1e-6 && a.score <= keys.length - 1 + 1e-6)) throw Error(`the decision model gave no score within the levels of "${name}"`);
      answers[name] = { type: 'score', score: Math.max(0, Math.min(keys.length - 1, a.score)) };
      continue;
    }
    const p = new Map((Array.isArray(a.probabilities) ? a.probabilities : []).map(x => [x?.value, x?.probability]));
    const ok = a.type === 'choice' && p.size === keys.length && keys.every(k => typeof p.get(k) === 'number' && p.get(k) >= 0 && p.get(k) <= 1);
    const sum = ok ? keys.reduce((s, k) => s + p.get(k), 0) : NaN;
    if (!ok || Math.abs(sum - 1) > 0.02 || !keys.includes(a.choice)) throw Error(`the decision model gave no distribution over the options of "${name}"`);
    // To four places and summing to one, as a Jev answer is; the choice is the likeliest option.
    const rounded = keys.map(k => Math.round(1e4 * p.get(k) / sum) / 1e4), top = rounded.indexOf(Math.max(...rounded));
    rounded[top] = Math.round(1e4 * (rounded[top] + 1 - rounded.reduce((x, y) => x + y, 0))) / 1e4;
    answers[name] = { type: 'choice', choice: keys[top], confidence: rounded[top], probabilities: Object.fromEntries(keys.map((k, i) => [k, rounded[i]])) };
  }
  return answers;
}

/**
 * `ask(body)` for the loom, answered by the Decisions API. Past `cap` dollars nothing more is sent (what requests in
 * flight could cost counts as spent). `ask.model` is the spec (`openai-decisions:<model>`), `ask.used()` what has been
 * spent, and `ask.fatal` becomes a sentence once no later call can succeed (a refused key, no credit, no such
 * endpoint for this key), so whoever is running matches should stop. Each answer carries `tokens` and `dollars`.
 */
export function decisionsAsker({ apiKey, model = DECISIONS.model, baseUrl = DECISIONS.url, cap = 1, atOnce = DECISIONS.atOnce, timeoutMs = DECISIONS.timeoutMs, fetchImpl = fetch }) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}/decisions`, used = { requests: 0, input: 0, failed: 0 }, state = { fatal: null };
  const tokensOf = text => Math.ceil(text.length / 3);
  let held = 0, flying = 0;
  const waiting = [];
  const slot = async () => { if (flying >= atOnce) await new Promise(go => waiting.push(go)); flying++; };
  const free = () => { flying--; waiting.shift()?.(); };

  const ask = async body => {
    const request = decisionRequest(body, model);
    if (!request.questions.length) return Object.defineProperties(decisionAnswers(body, { answers: [] }), { tokens: { value: 0 }, dollars: { value: 0 } });
    const text = JSON.stringify(request), most = tokensOf(text) * DECISIONS.dollarsPerToken;
    for (let attempt = 1; ; attempt++) {
      if (state.fatal) throw Error(state.fatal);
      if (used.input * DECISIONS.dollarsPerToken + held + most > cap) { state.fatal = `the cap of $${cap} for this run is spent`; throw Error(state.fatal); }
      held += most;
      await slot();
      let response, reply;
      try {
        response = await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(timeoutMs), headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: text });
        reply = await response.json().catch(() => ({}));
      } catch (e) {
        if (attempt === 3) { used.failed++; throw Error(String(e?.message ?? e)); }
        continue;
      } finally { free(); held -= most; }
      const error = reply?.error, kind = `${error?.type ?? ''} ${error?.code ?? ''}`;
      if (/insufficient_quota|billing/.test(kind) || response.status === 402) { state.fatal = 'the OpenAI account has no credit'; throw Error(state.fatal); }
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        state.fatal = response.status === 404 ? 'this key cannot reach the Decisions API (HTTP 404)' : `OpenAI refused the key (HTTP ${response.status})`;
        throw Error(state.fatal);
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 4) { await new Promise(go => setTimeout(go, 500 * 2 ** attempt)); continue; }
      if (!response.ok) { used.failed++; throw Error(`Decisions API HTTP ${response.status}: ${String(error?.message ?? '').slice(0, 160)}`); }
      // What OpenAI counted, where it says; else a count from the request's length.
      const input = reply.usage?.input_tokens ?? reply.usage?.prompt_tokens ?? Math.ceil(text.length / 4);
      used.requests++; used.input += input;
      let answers;
      try { answers = decisionAnswers(body, reply); } catch (e) { used.failed++; throw e; }
      Object.defineProperty(answers, 'tokens', { value: input, enumerable: false });
      return Object.defineProperty(answers, 'dollars', { value: input * DECISIONS.dollarsPerToken, enumerable: false });
    }
  };
  ask.model = `openai-decisions:${model}`;
  ask.used = () => ({ ...used, output: 0, dollars: used.input * DECISIONS.dollarsPerToken, cap });
  return Object.defineProperty(ask, 'fatal', { get: () => state.fatal });
}
