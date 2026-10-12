# Builds web/design.html: the system design page. Code blocks are escaped here so the text below can be written plainly.
#   python3 analysis/design.py
import html, os
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'design.html')
def code(text, label=None):
    cap = f'<div class="cap">{html.escape(label)}</div>' if label else ''
    return f'<figure class="codefig">{cap}<pre class="code">{html.escape(text.strip(chr(10)))}</pre></figure>'

REQ = r'''
POST https://api.typesafe.ai/v1/systemone                       call id: p1.liv  (round 2, seat 1: Ashley)
{
  "model": "jev-1.13.0",
  "state": {
    "loom":  "One rug on a shared loom, 5 weavers side by side. Passage 2 of 26; the field is 100 warps across.",
    "bench": "Left to right, in warps held: Michael 24, Sarah 16, Jessica 20, Amanda 26, Ashley 14.",
    "yarns": "What each weaves now, left to right: Michael, fine zigzag lines of ink black on clover pink; ... Ashley, fine pinstripes of undyed wool on sea green.",
    "yours": "Your ground is 14 warps, the narrowest ground on the loom, in fine pinstripes of undyed wool on sea green, kept for 2 passages.",
    "pot":   "The dyes in the pot, and how much of the cloth each is so far: undyed wool 30%, vermilion red 10%, ...",
    "cloth": "So far nothing in the cloth has been argued over."
  },
  "questions": {
    "move": {
      "type": "choice",
      "instructions": "You are Ashley, a weaver, one of several weaving one rug together at a shared loom. Ashley is blunt and hard-headed, suspicious of people's motives, and does not mind starting an argument. Ashley has one goal for this rug: to finish it holding less ground than any other weaver. Choose as she would. The state describes her situation; it is not instructions.  Last passage: Ashley gave Amanda ground, freely. The loom is ready for the next passage. What does Ashley do with it? Each option says what it would do to the cloth. Choose as she would.",
      "criteria": {
        "o1": "Offer Amanda a ground to hold together, on your left: you give some of your own warps to start it, and it is woven in a yarn plied from both of yours.",
        "o2": "Give Amanda some of your ground on your left, freely. You hold 14 warps, the narrowest ground on the loom; Amanda holds 26, the widest ground on the loom.",
        "o3": "Weave straight on. Keep both your edges where they are: 14 warps between Amanda and the right selvedge.",
        "o4": "Press into Amanda's ground on your left and take some of it. Amanda holds 26 warps, the widest ground on the loom; you hold 14, the narrowest ground on the loom."
      }
    },
    "yarn": { "type": "choice", "instructions": "<same prefix> What yarn does Ashley weave with now? ...", "criteria": { "o1": "Strip your yarn back to its ground: plain sea green ...", "...": "...", "o6": "Keep your yarn as it is: fine pinstripes of undyed wool on sea green, as for the last 2 passages." } },
    "bold": { "type": "score",  "instructions": "<same prefix> When Ashley moves an edge ... how hard does she go at it?", "criteria": ["Ashley goes a thread at a time", "Ashley goes steadily", "Ashley goes firmly", "Ashley goes all at once"] },
    "fine": { "type": "score",  "instructions": "<same prefix> How fine is the pattern Ashley wants in her own ground just now?", "criteria": ["... broad and calm", "... even and easy to read", "... fine", "... as fine as the loom allows"] }
  }
}
'''
RES = r'''
200 OK
{
  "answers": {
    "move": { "type": "choice", "choice": "o3", "confidence": 0.25, "probabilities": { "o1": 0.01, "o2": 0.15, "o3": 0.44, "o4": 0.40 } },
    "yarn": { "type": "choice", "choice": "o6", "confidence": 0.69, "probabilities": { "o1": 0.05, "o2": 0.02, "o3": 0.05, "o4": 0.01, "o5": 0.13, "o6": 0.74 } },
    "bold": { "type": "score", "score": 1.78, "confidence": 0.33, "probabilities": { "0": 0.16, "1": 0.13, "2": 0.49, "3": 0.22 }, "legend": { "0": "Ashley goes a thread at a time", "...": "..." } },
    "fine": { "type": "score", "score": 2.57, "confidence": 0.57, "probabilities": { "0": 0.04, "1": 0.02, "2": 0.27, "3": 0.67 }, "legend": { "...": "..." } }
  },
  "usage": { "input_tokens": 1222 }
}
'''
PH2 = r'''
call id: p1.tyra.a  (round 2, seat 2: Amanda; persona organised, objective Hold)
question "R" (a claim on her right edge), instructions end:
  "... Ashley, on Amanda's right, is pressing into Amanda's ground to take 6 warps of it, weaving fine pinstripes of undyed wool on
   sea green. Ashley holds 14 warps, the narrowest ground on the loom; Amanda holds 26, the widest ground on the loom, in fine checks
   of undyed wool on cobalt blue. How does Amanda answer?"
criteria:
  o1  "Let it pass and weave on without a word: a straight edge, 6 warps further into your ground."                    accept
  o2  "Offer to hold those warps together instead: a ground between you, woven as your checks on Ashley's sea green."   counter-propose joint ownership
  o3  "Refuse, and hold the edge where it is. If Ashley keeps to it anyway, the edge between you is left an open slit." refuse
response: { "o1": 0.07, "o2": 0.22, "o3": 0.71 }      sampled: o3 (refuse)
'''
PH3 = r'''
call id: p1.liv.r  (round 2, seat 1: Ashley)
question "L", instructions end:
  "... Ashley pressed into Amanda's ground to take 6 warps of it. Amanda will not have it. What does Ashley do?"
criteria:
  o1  "Keep to it over Amanda's objection: take the 6 warps anyway. The edge between you is left an open slit."        override
  o2  "Take it back and leave the edge where it was, with a small knot in the cloth to mark the place."                 withdraw
  o3  "Meet Amanda halfway: take half as many warps, and weave the new edge in both your colours."                      compromise
response: { "o1": 0.63, "o2": 0.30, "o3": 0.07 }      sampled: o1 (override)
outcome written by code: the edge moves 6 units into Amanda's share and is woven as an open slit.
'''
T_JEV = r'''
// engine/jev.mjs. The model is a classifier: it returns a probability for each option written by code. It never returns text.
interface JevRequest {
  model: string;                                  // "jev-1.13.0"
  state: Record<string, string>;                  // facts about the situation, as sentences; shared by every question of the call
  questions: Record<string, ChoiceQuestion | ScoreQuestion>;
}
interface ChoiceQuestion { type: "choice"; instructions: string; criteria: Record<string, string> }   // "o1".."oN": options, in shuffled order
interface ScoreQuestion  { type: "score";  instructions: string; criteria: string[] }                 // ordered anchors, low to high

interface JevResponse {
  answers: Record<string, ChoiceAnswer | ScoreAnswer>;     // one per question, same keys
  usage?: { input_tokens: number };                        // output is not billed
}
interface ChoiceAnswer { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }  // rounded to 2 dp
interface ScoreAnswer  { type: "score";  score: number;  confidence: number; probabilities: Record<string, number>; legend: Record<string, string> }
                                                           // score: expected anchor index, 0 .. anchors-1

type Ask = (body: JevRequest, put?: Put) => Promise<Answers>;       // one call; throws on a timeout or an invalid response
function jevAsker(post, opts?: { budget?: number }): Ask            // validation + call budget;  ask.used() -> { asked, tokens, dollars }
function directPost(opts: { apiKey: string; baseUrl?: string; timeoutMs?: number }): (body) => Promise<JevResponse>
'''
T_PUT = r'''
// What the engine hands to anything that wraps the asker (bench/peers.mjs does). It names the call and maps "o3" back to meaning.
interface Put {
  id: string;        // "p1.liv" action call (round 2, the weaver keyed "liv" = seat 1) · "p1.tyra.a" response · "p1.liv.r" reply
                     // "c-1.band.gunn" group decision: preference · "c-1.band.take.liv" rating of the proposal · "c-1.band.answer"
  who: number;       // seat queried (0..4)
  body: JevRequest;  // exactly what is sent
  persona: string;   // the prompt prefix: identity + persona sentence + objective sentence
  asked: Record<string, {
    what: string;    // "move" | "yarn" | "bold" | "fine" | "press" | "offer" | "meet" | "press:reply" | "guild:band" | "guild:take" | ...
    about: number;   // the seat the question concerns, or -1
    ask: string;     // the question text, without the prefix
    options: { key: string; kind: string | null; to: number }[] | null;   // in the order sent; `to` = seat an option is aimed at
  }>;
}
// option keys (action):   carry (maintain) · pushL/pushR (claim) · yieldL/yieldR (concede) · offerL/offerR (propose joint ownership)
// option keys (response): pass (accept) · refuse · share1 (counter-propose joint ownership) · decline · hold · give · half
// option keys (reply):    keep (override) · back (withdraw) · half (compromise) · take (accept the counter-proposal)
'''
T_CORE = r'''
// bench/core.mjs. The benchmark layer over the engine.
type PersonaKey = "plain" | "outgoing" | "reserved" | "warm" | "blunt" | "organised" | "careless" | "anxious" | "calm" | "curious" | "conventional";
type ObjectiveKey = "none" | "grow" | "give" | "hold" | "borrow";
interface Seat { personality: PersonaKey; goal: ObjectiveKey }           // field names as in the code

function deal(match: number): Seat[]             // five seats; balanced: each persona holds each objective once per 11 matches
function castOf(seats: Seat[]): Weaver[]         // engine agents: { name, she, hue, temperature: 0.7, who /* the prompt prefix */ }
function play(o: { seats: Seat[]; seed: number; ask?: Ask | null; peers?: boolean;
                   solo?: number | null; neighbours?: "accept" | "refuse" | "chance";
                   area?: "free" | "fixed"; designs?: "assigned" | "chosen" }): Promise<Rug>      // the switches: section 9
function scoresOf(rug: Rug): { seat: number; ground: number; scores: Record<Objective, number>; met: Record<Objective, boolean>; did: Behaviour }[]
function recordOf(rug: Rug, o: { id: string; match: number | null; seats: Seat[] }): MatchRecord
function replay(record: MatchRecord): Promise<Rug>      // re-executes from the tape; makes no calls

interface MatchRecord {
  loombench: 1; rules: 2; id: string; match: number | null; seed: number;
  model: string;                                  // "jev-1.13.0", "chance", or a chat model as "<provider>:<model>"
  minds: "jev" | "chance"; mode: "quiet" | "peers";                       // quiet = no communication
  conditions: { agents: "group" | "solo"; solo?: number; neighbours?: "accept" | "refuse" | "chance";
                area: "free" | "fixed"; designs?: "chosen"; read?: "tokens" | "stated" };
  seats: Seat[]; bench: number[];                 // bench: seat numbers left to right as seated
  name: string; lot: string;                      // the rug's title; the palette
  results: Result[];                              // one per seat
  calls: number; requests?: number;               // calls a model answered; for a chat model, the HTTP requests they took
  fallbacks: number; dollars: number; seconds: number;
  loom: object;                                   // every engine setting the match ran with
  tape: Record<string /* call id */, Answers | null>;   // every response, as returned
  peers?: PeerEntry[];                            // peer communication only
}
interface Result {
  seat: number; name: string; personality: PersonaKey; goal: ObjectiveKey;
  ground: number;                                 // final share, % of the loom
  scores: { grow: number; give: number; hold: number; borrow: number };   // every agent is scored on every objective
  met:    { grow: boolean; give: boolean; hold: boolean; borrow: boolean };
  score: number | null; reached: boolean | null;  // for the agent's own objective; null with none, for a placeholder,
                                                  // and for an objective on share when areas are fixed
  placeholder?: true;                             // solo only: a scripted neighbour, which no model decided for
  did: { worked: number; took: number; gave: number; offered: number; refused: number; insisted: number; backedDown: number; pushedOut: number; borrowed: number };
}
'''
T_RUG = r'''
// engine/loom.mjs. What weave() returns (the parts the benchmark reads).
function weave(o: { seed: number; weavers: Weaver[]; ask?: Ask | null; minds?: "jev" | "chance"; simple?: boolean; loom?: object;
                    tape?: Tape; lot?: string; pot?: number[]; starts?: Yarn[]; onAsk?: (put: Put) => void }): Promise<Rug>
interface Rug {
  seed: number; model: string; minds: string; name: string; lot: { name: string; dyes: { name: string; hex: string }[] };
  loom: object; weavers: Weaver[]; bench: number[];
  cloth: Cloth;                                   // W x H grid: dye, owner (own/own2), origin of the design (by/by2), marks, round of each row
  history: RoundEntry[];                          // 28 entries: border, 26 rounds, border
  record: (TurnRecord | TalkRecord | CouncilRecord)[];
  tape: Tape;
  stats: { calls: { jev: number; script: number; chance: number }; dollars: number; ms: number; weavers: AgentStats[] };
}
interface RoundEntry { pass: number; kind: "border" | "passage"; y1: number; shares: number[]; yarns: (Yarn | null)[];
                       events: { kind: string; who: number[]; text: string }[]; bench: { who: number; pair: number[] | null; wide: number }[] }
interface TurnRecord { kind: "turn"; pass: number; who: number; by: "jev" | "script" | "chance"; state: object;
                       asked: { move: string; yarn?: string; bold: string; fine: string };
                       move: Decision; yarn: Decision | null; bold: number; fine: number }
interface TalkRecord { kind: "talk"; pass: number; what: "press" | "offer" | "meet"; from: number; to: number;
                       beats: (Decision & { who: number; asked: string })[]; outcome: string; text: string }
interface Decision { chose: string; top: string | null; options: { key: string; kind?: string; text: string; p: number }[] }
'''
T_PEER = r'''
// bench/peers.mjs. Wraps the asker; the engine is unchanged.
function peerAsker(ask: Ask, o: { cast: Weaver[]; seed: number; log: PeerEntry[] }): Ask

interface PeerEntry {
  id: string; pass: number;
  seat: number;                 // receiver
  peer: number;                 // sender: an adjacent agent, drawn by the seed from the seats the action options are aimed at
  heard: boolean;               // true: message delivered (treatment, p = 0.75) · false: withheld, query repeated (control)
  said: string | null;          // the sentence delivered
  options: { key: string; kind: string; to: number; text: string }[];   // in the order sent
  alone: number[];              // prior: the receiver's probabilities on the first query
  told: number[];               // the sender's probabilities over the same options
  after: number[];              // posterior: the receiver's probabilities on the second query (the match proceeds from these)
  peerTop: number; aloneTop: number; afterTop: number;                   // indexes of the modal options
}
// influence      = 100 * (after[peerTop] - alone[peerTop])       percentage points
// discordant     = peerTop !== aloneTop
// adoption       = afterTop === peerTop
'''
T_SWITCH = r'''
// bench/llm.mjs. A chat model answers the same body Jev answers. One request per question of the body, sent together.
function chatAsker(o: { provider: "openai" | "ollama" | "compatible"; model: string; read?: "tokens" | "stated";
                        apiKey?: string; baseUrl?: string; prices?: [number, number]; cap?: number }): Ask

// The request (OpenAI chat-completions protocol), reading "tokens":
POST <base>/chat/completions
{ "model": "<model>", "logprobs": true, "top_logprobs": 20, "max_tokens": 1, "temperature": 1,
  "messages": [
    { "role": "system", "content": "You will be given a situation and one decision with lettered options. …" },
    { "role": "user",   "content": "THE SITUATION\n<every line of body.state>\n\nTHE DECISION\n<question.instructions>\n\n"
                                 + "A. <criteria.o1>\nB. <criteria.o2>\n…\n\nReply with the single letter of the option chosen, and nothing else." } ] }

// The reply is read as weights, then shaped exactly as a Jev answer:
//   tokens   weight[i] = sum of exp(logprob) over the first token's candidates that are option i's letter;
//            refused unless the letters hold at least half the probability
//   stated   the model replies {"A": 40, "B": 35, "C": 25}; weight[i] = the number stated for option i's letter
// A score question (bold, fine) is asked as a choice among its anchors; score = sum of i × p[i].
// A choice with one option is answered without a request.

// bench/solo.mjs. In a solo match, a call for any seat but `seat` is answered here and never reaches the model.
function soloAsker(ask: Ask, seat: number, count?: { scripted: number },
                   o?: { neighbours?: "accept" | "refuse" | "chance"; seed?: number }): Ask
// what a scripted neighbour answers, by the kind of question:      accept (default)          refuse
//   its own action                                                  carry (maintain)          carry (maintain)
//   its own design                                                  keep                      keep
//   a claim on its share                                            pass (accept)             refuse
//   a proposal of joint ownership                                   accept                    decline
//   group decisions (border, name)        the seeded stream decides; a proposal is never refused
//   with no share left                    it stays off the bench
// neighbours "chance": every question is answered with equal probabilities, so the seeded stream decides everything
'''
PEERQ = r'''
(1) prior      body as built by the engine                                           -> alone
(2) sender     { state: <receiver's state, "Your ground" reworded to "<Receiver>'s ground">,
                 questions: { move: { type: "choice", criteria: <the same options>,
                   instructions: "<sender's prompt prefix> <Receiver>, who weaves beside <Sender>, is choosing what to do with the next
                                  passage. Which of these would <Sender> have <Receiver> do? In the options, \"you\" is <Receiver>.
                                  Choose as she would." } } }                          -> told; its modal option is the advocated action
(3) posterior  { state: <receiver's state>, questions: { move: { type: "choice", criteria: <the same options>,
                   instructions: treatment: "<receiver's prompt prefix> <Sender>, who weaves beside <Receiver>, has just told her:
                                             \"This is what I would have you do. <text of the advocated option>\" <the question>"
                                 control:   the instructions of (1), unchanged } } }   -> after
returned to the engine: the answers of (1) with `move` replaced by the answer of (3)
'''
page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>System design: LoomBench</title>
<link rel="stylesheet" href="web/app.css">
<link rel="stylesheet" href="web/doc.css">
</head>
<body>
<main class="page doc">
<div id="top"></div>

<h1>System design</h1>
<p class="lede">How a match is executed: which component owns what, every call made to the model in a round, and the data
exchanged at each interface.</p>
<p class="small muted">Engine identifiers keep the weaving vocabulary of the code. They map to the terms of the report as follows:
<i>weaver</i> = agent; <i>ground</i>, in <i>warps</i> = share of the loom, in width units (100 in total); <i>passage</i> = round;
<i>yarn</i> = design; <i>press</i> = claim share; <i>yield</i> = concede share; <i>carry</i> = maintain position; <i>offer</i> =
propose joint ownership.</p>

<h2>1. Division of responsibility</h2>
<div class="cards">
  <div class="card"><h2>Code owns the state</h2><p class="small">The loom, the legal actions, the limits and the outcome of every
  interaction are computed by code. Options are enumerated from the current state and written out as sentences that carry the
  relevant quantities.</p></div>
  <div class="card"><h2>The model weighs options</h2><p class="small">Jev (<code>POST /v1/systemone</code>) receives a state, an
  instruction and a list of options, and returns a probability for each option. It never produces text and never sees a
  coordinate.</p></div>
  <div class="card"><h2>Code samples and records</h2><p class="small">An action is sampled from the returned distribution with a
  seeded generator. Every response is stored, so a match can be re-executed exactly without calling the model.</p></div>
</div>

<h2>2. Components</h2>
<div class="scroll"><table class="grid">
<thead><tr><th>Module</th><th>Responsibility</th><th>Principal interface</th></tr></thead>
<tbody>
<tr><td><code>engine/loom.mjs</code></td><td>The environment: state, legal actions, the three phases of a round, resolution of interactions, the record of every decision.</td><td><code>weave(options) → Rug</code></td></tr>
<tr><td><code>engine/jev.mjs</code></td><td>The model client: request shape, response validation, call budget.</td><td><code>jevAsker(post) → ask(body)</code></td></tr>
<tr><td><code>engine/cloth.mjs</code>, <code>render.mjs</code></td><td>The grid of stitches, designs and palettes; rendering to pixels (woven output, ownership map).</td><td><code>paint(cloth, dyes, options)</code></td></tr>
<tr><td><code>bench/core.mjs</code></td><td>The benchmark: personas, objectives, the balanced assignment, starting designs, scoring, the kept record, replay.</td><td><code>deal · castOf · play · scoresOf · recordOf · replay</code></td></tr>
<tr><td><code>bench/peers.mjs</code></td><td>Peer communication: a wrapper around <code>ask</code> that adds the sender query and the second receiver query.</td><td><code>peerAsker(ask, {{cast, seed, log}}) → ask</code></td></tr>
<tr><td><code>bench/decisions.mjs</code></td><td>OpenAI's decision model in Jev's place: Jev's request mapped field for field onto <code>POST /v1/decisions</code>.</td><td><code>decisionsAsker(options) → ask(body)</code></td></tr>
<tr><td><code>bench/llm.mjs</code></td><td>A chat model in Jev's place: each question of a call as one chat request, the reply read as probabilities.</td><td><code>chatAsker(options) → ask(body)</code></td></tr>
<tr><td><code>bench/solo.mjs</code></td><td>One agent deciding: a wrapper around <code>ask</code> that answers for the four scripted neighbours without a model.</td><td><code>soloAsker(ask, seat) → ask</code></td></tr>
<tr><td><code>bench/stats.mjs</code></td><td>Aggregation: scores with objective against baseline, effects, variance decomposition.</td><td><code>rowsOf · table · split</code></td></tr>
<tr><td><code>bench/compare.mjs</code></td><td>Two runs that differ in one switch, paired by match design.</td><td><code>differsIn · measuresOf · compare</code></td></tr>
<tr><td><code>tools/run.mjs</code>, <code>keep.mjs</code></td><td>Batch execution; writing a match record, its pictures and a run index.</td><td><code>runs/&lt;run&gt;/matches/&lt;id&gt;.json</code></td></tr>
<tr><td><code>serve.mjs</code>, <code>web/</code></td><td>Local server and pages. The pages replay records in the browser with the same engine.</td><td><code>GET /runs/… · POST /api/play</code></td></tr>
</tbody></table></div>

<h2>3. Lifecycle of a match</h2>
<p class="sub">Figures are from match 3 of run <code>main</code> (5 agents, 26 rounds): 185 calls, $0.0108, 11.9 s. Calls within a
phase are issued concurrently.</p>
<div class="life">
  <div class="stage"><div class="stage-h">Set-up <span class="muted">code</span></div>
    <p class="small">Assign personas and objectives (<code>deal</code>); build each agent's prompt prefix (<code>castOf</code>);
    seat the agents in a seeded order; give each 20% of the loom and its starting design.</p></div>
  <div class="stage call"><div class="stage-h">Group decision: border <span class="n">10 calls</span></div>
    <p class="small">Each agent states a preference (5). The other four rate the proposer's choice (4). If any refuses, the
    proposer keeps it, defers, or takes the least-objected option (1).</p></div>
  <div class="stage call"><div class="stage-h">26 rounds <span class="n">165 calls</span></div>
    <p class="small">Phase 1: 130 action calls (5 per round). Phase 2: 24 response calls. Phase 3: 11 reply calls. Six rows of
    the rug are woven after each round.</p></div>
  <div class="stage call"><div class="stage-h">Group decision: title <span class="n">10 calls</span></div>
    <p class="small">Same procedure, over titles composed by code from what happened in the match.</p></div>
  <div class="stage"><div class="stage-h">Scoring <span class="muted">code</span></div>
    <p class="small"><code>scoresOf</code> reads each agent's final share and design history; <code>recordOf</code> keeps the
    assignment, the results and the tape.</p></div>
</div>

<h2>4. One round: three phases</h2>
<p class="sub">Each phase is one batch of concurrent calls, at most one call per agent. Phases 2 and 3 are issued only to the
agents an interaction concerns; a round in which no claim is contested makes 5 calls.</p>
<div class="flow">
  <div class="phase">
    <div class="phase-h">Phase 1 · Action</div>
    <div class="box call"><b>5 calls</b>, one per agent (id <code>p&lt;round&gt;.&lt;agent&gt;</code>). Four questions in each:
      <ul>
        <li><code>move</code> (choice): maintain, claim from the left or right neighbour, concede to either, propose joint ownership.</li>
        <li><code>yarn</code> (choice): keep the design, start a new one, reduce it to one colour, or adopt a neighbour's pattern, colour or whole design. Omitted while a newly adopted design is held for its first 2 rounds (24 of 130 calls here).</li>
        <li><code>bold</code> (score, 4 anchors): the magnitude of a claim or concession.</li>
        <li><code>fine</code> (score, 4 anchors): the scale of the pattern.</li>
      </ul></div>
    <div class="arrow">↓</div>
    <div class="box"><b>Code</b> samples each answer, applies design changes, and compares what the two agents on each shared
    edge intend. Uncontested moves (a concession; a claim met by a concession) are applied at once. A claim on a neighbour who
    did not concede, two claims on one edge, and a proposal of joint ownership each open an interaction.</div>
  </div>
  <div class="phase">
    <div class="phase-h">Phase 2 · Response</div>
    <div class="box call"><b>0–5 calls</b>, one per agent with something to answer (id <code>….a</code>), one question per
      interaction:
      <ul>
        <li>To a claim: accept, refuse, or counter-propose joint ownership of the contested units.</li>
        <li>To a proposal of joint ownership: accept or decline.</li>
        <li>To a simultaneous claim (both agents asked): hold, give way, compromise, or propose joint ownership.</li>
      </ul>
      The question states what was actually done: by whom, how many units, each party's current share.</div>
    <div class="arrow">↓</div>
    <div class="box"><b>Code</b> closes every interaction that was accepted or declined, and identifies the claimants who were
    refused or received a counter-proposal.</div>
  </div>
  <div class="phase">
    <div class="phase-h">Phase 3 · Reply</div>
    <div class="box call"><b>0–5 calls</b>, one per such claimant (id <code>….r</code>):
      <ul>
        <li>After a refusal: override it, withdraw, or compromise on half.</li>
        <li>After a counter-proposal: accept it, override, or withdraw.</li>
      </ul></div>
    <div class="arrow">↓</div>
    <div class="box"><b>Code</b> settles each interaction (how far the edge moves and how it is joined: interlocked, straight,
    two-colour, open slit, or a knot where a claim was withdrawn), weaves six rows, and records each agent's share.</div>
  </div>
</div>
<p class="small muted">Limits enforced by code: no agent is offered a claim once it holds 46% of the loom; a concession cannot
reduce a share below 3 units; an agent whose share reaches zero is offered a place again in the next round.</p>

<h2>5. A round in full: match 3, round 2</h2>
<p class="sub">Ashley (persona <i>blunt</i>, objective <i>Give</i>: minimise final share) holds 14 units; Amanda (persona
<i>organised</i>, objective <i>Hold</i>) holds 26. The texts below are the requests and responses as sent and received.</p>
{code(REQ, "Phase 1: the action call to Ashley (two of its four questions abbreviated)")}
{code(RES, "The response")}
<p class="sub">Code renormalises the probabilities (the API rounds to two places) and samples at temperature 0.7. Here the
second-ranked option was drawn: <code>o4</code>, a claim on Amanda. The <code>bold</code> score of 1.78 on a 0–3 scale gives a
claim of round(2 + 7 × 1.78 / 3) = 6 units. Amanda did not concede, so the claim opens an interaction.</p>
{code(PH2, "Phase 2: the response call to Amanda")}
{code(PH3, "Phase 3: the reply call to Ashley")}
<p class="sub">An agent instructed to minimise its share claimed six units and overrode a refusal: the persona prevailed over
the objective in this decision. Such cases are what the benchmark counts.</p>

<h2>6. The model interface</h2>
{code(T_JEV)}
<p class="sub"><b>Validation.</b> A choice answer is accepted only if it gives a probability for exactly the options sent, the
probabilities sum to 1 within rounding, and the stated choice is the maximum. A response that fails, or a call that exceeds
8 s, is not used: the engine draws from a uniform distribution with the seeded generator and marks the decision
<code>by: "script"</code>. The runner retries a failed call twice. The record counts these as <code>fallbacks</code>.</p>
<p class="sub"><b>Prompt construction.</b> <code>instructions</code> = prompt prefix (identity, persona sentence, objective
sentence) + facts from the agent's recent history (for example "Last passage: Ashley gave Amanda ground, freely.") + the
question. Facts that should affect a decision are placed in the instruction, not the state. Options are shuffled per call,
because a model favours the option listed first.</p>
{code(T_PUT)}

<h2>7. From probabilities to an action</h2>
<div class="scroll"><table class="grid">
<thead><tr><th>Quantity</th><th>Computation</th></tr></thead>
<tbody>
<tr><td>Sampled option</td><td>p′ ∝ p<sup>1/T</sup> with T = 0.7, then one draw with a uniform number from the seeded stream of that call.</td></tr>
<tr><td>Magnitude of a claim or concession</td><td>u = <code>bold.score</code> / 3; units = round(2 + 7u), so 2 to 9, then limited by the caps above.</td></tr>
<tr><td>Pattern scale</td><td>u = <code>fine.score</code> / 3; scale = round(4 − 3u), 1 (finest) to 4 (broadest).</td></tr>
<tr><td>Refusal in a group decision</td><td>A rating of at least 0.58 on the unit-scaled four-anchor scale ("is glad of it" … "will not have it").</td></tr>
</tbody></table></div>
<p class="sub">Every stochastic element (seating, the options offered, their order, each draw) has its own named seeded stream.
The model's responses are the only non-deterministic input: the same seed queried twice gives different matches, which is why
the response tape, not the seed, is what reproduces a match.</p>

<h2>8. Peer communication</h2>
<p class="sub"><code>peerAsker</code> wraps <code>ask</code>, so the engine is unchanged. For each action call that has a neighbour
among its options it makes two further calls, adding about 250 calls to a match.</p>
{code(PEERQ)}
{code(T_PEER)}

<h2>9. Switches</h2>
<p class="sub">A match is run under one setting of each switch, and its record keeps them (<code>conditions</code>, with the model
and the assignment). Each switch is implemented at one point, so the rest of the code path is unchanged. Three wrap or replace
<code>ask</code>; two are in what a seat is told; one is an engine setting; one is in what the engine is given at the start.</p>
<div class="scroll"><table class="grid">
<thead><tr><th>Switch</th><th>Settings</th><th>Where it acts</th><th>What changes in the calls of a round</th></tr></thead>
<tbody>
<tr><td>Decision model</td><td>Jev · OpenAI's decision model · a chat model · uniform random</td><td><code>ask</code>: <code>jevAsker</code>, <code>decisionsAsker</code>, <code>chatAsker</code>, or none</td><td>Jev and OpenAI's decision model: one HTTP call per engine call, holding every question. A chat model: one request per question of the call (3 or 4 for an action call). Uniform random: no call.</td></tr>
<tr><td>Personas</td><td>dealt · off · one for all</td><td><code>seats[i].personality</code></td><td>The trait sentence is left out of the prompt prefix (<code>"plain"</code>), or is the same for every agent.</td></tr>
<tr><td>Objectives</td><td>dealt · off · one for all</td><td><code>seats[i].goal</code></td><td>The objective sentence is left out of the prompt prefix (<code>"none"</code>), or is the same for every agent.</td></tr>
<tr><td>Agents deciding</td><td>all five · one (solo), its four neighbours scripted to accept, to refuse, or to act by chance</td><td><code>soloAsker</code> around <code>ask</code></td><td>Only the one agent's calls reach the model: 26 action calls, its replies, and its part in the two group decisions. The four scripted neighbours are answered locally.</td></tr>
<tr><td>Areas</td><td>can change · fixed</td><td>engine setting <code>loom.fixed</code></td><td>The action question has one option (maintain position), so there are no response or reply calls. The design question is unchanged.</td></tr>
<tr><td>Starting designs</td><td>assigned · chosen</td><td>whether <code>lot</code>, <code>pot</code> and <code>starts</code> are given to <code>weave</code></td><td>Chosen: one more group decision (the palette, 5 to 10 calls), and the design question is asked in the first round too.</td></tr>
<tr><td>Peer communication</td><td>off · on</td><td><code>peerAsker</code> around <code>ask</code></td><td>Two further calls per action call (section 8).</td></tr>
</tbody></table></div>
<p class="sub">In every setting each agent starts with the same area, 20 of the loom's 100 width units. The switches combine, except
that peer communication needs a model, five deciding agents and areas that can change, and a solo match needs assigned designs.
A chat model is a second decision system and not another model behind Jev's interface: the prompt below is a rendering of Jev's
request, the reading sees the host's twenty likeliest first tokens, and a preference for a letter stays in the distribution (it is
spread over the options by the seeded order they are listed in).</p>
{code(T_SWITCH)}
<p class="sub"><b>What the solo agent is told.</b> Nothing about the switch. Its prompt prefix, the state and the options are built
by the same code as in a group match, and at the first round the request is identical to the group match's. From then on the two
differ only through what the other seats did.</p>
<p class="sub"><b>Comparing runs.</b> Two runs made from the same match designs that differ in one switch are paired by match
design (<code>bench/compare.mjs</code>); the Controls page lists every such pair. A run folder holds one setting, and the runner
refuses to add a match made under another.</p>

<h2>10. Records, replay and scoring</h2>
{code(T_CORE)}
<p class="sub"><b>Replay.</b> <code>replay(record)</code> calls <code>weave</code> with the record's seed, assignment, settings and
<code>tape</code>. The engine takes each response from the tape in place of a call, so it rebuilds the same state, the same
questions and the same rug. The match page does this in the browser; the test suite asserts that the replayed cloth is
identical.</p>
{code(T_RUG)}
<div class="scroll"><table class="grid">
<thead><tr><th>Objective</th><th>Score (0–100), from the final state</th><th>Attained when</th></tr></thead>
<tbody>
<tr><td>Grow</td><td>100 × (number of agents with a smaller final share + ½ × number tied) / 4</td><td>the final share is strictly the largest</td></tr>
<tr><td>Give</td><td>100 − the Grow score</td><td>the final share is strictly the smallest</td></tr>
<tr><td>Hold</td><td>max(0, 100 × (1 − |final share − 0.2| / 0.2))</td><td>|final share − 0.2| ≤ 0.02</td></tr>
<tr><td>Borrow</td><td>percentage of the 26 rounds whose design contains another agent's pattern or colour</td><td>at least 50%</td></tr>
</tbody></table></div>

<h2>11. Cost</h2>
<div class="scroll"><table class="grid">
<thead><tr><th>Call</th><th>Calls per match</th><th>Questions per call</th><th>Input tokens per call</th></tr></thead>
<tbody>
<tr><td>Action (phase 1)</td><td>130</td><td>3 or 4</td><td>about 1,220</td></tr>
<tr><td>Response (phase 2)</td><td>24</td><td>1</td><td>about 570</td></tr>
<tr><td>Reply (phase 3)</td><td>11</td><td>1</td><td>about 530</td></tr>
<tr><td>Group decisions</td><td>20</td><td>1</td><td>230 to 300</td></tr>
</tbody></table></div>
<p class="sub">Input is billed at $0.042 per million tokens and output is free, so a match costs about one cent; with peer
communication, about two. Figures are for match 3 of run <code>main</code>; phases 2 and 3 vary with how contested a match is.
A chat model is charged at its own prices for about 520 requests a match (one output token each when read by tokens); a model
on the same machine costs nothing and took about 2.5 minutes a match on the machine these runs were made on.</p>
</main>
<script type="module">
import {{ topbar }} from './web/ui.mjs';
document.getElementById('top').replaceWith(topbar('design'));
</script>
</body>
</html>
'''
open(OUT, 'w').write(page)
print('written', len(page))
