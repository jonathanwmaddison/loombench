# Builds web/report.html: the peer-influence study, written as a short paper. Every estimate in the text is read from the
# computed files (analysis/pooled.json and analysis/outcomes.json, and the run indexes), so the page cannot drift from the
# data by retyping:
#   node analysis/peers.mjs && node analysis/outcomes.mjs && python3 analysis/report.py
import html, json, os, re, statistics as st
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
P = json.load(open(f'{HERE}/pooled.json')); O = json.load(open(f'{HERE}/outcomes.json'))
F, K, MX = P['facts'], P['contrast'], P['matrix']
e = html.escape
mn = lambda s: s.replace('-', '−')                       # a real minus sign in every number shown
z = lambda x, d: round(x, d) + 0.0                       # no "-0.0"
def fmt(c, digits=1, sign=False):
    return mn(f"{z(c['m'], digits):{'+' if sign else ''}.{digits}f} [{z(c['lo'], digits):.{digits}f}, {z(c['hi'], digits):.{digits}f}]")
def est(key, which='pooled', digits=1): return fmt(P[key][which], digits)
def con(key, which='pooled', digits=1, sign=True): return fmt(K[key][which], digits, sign=sign)
def by(key, which='pooled'): return con(key, which, sign=False)        # after "raised by": no plus sign
def m(key, which='pooled', digits=0): return mn(f"{z(P[key][which]['m'], digits):.{digits}f}")
def num(x, digits=0, sign=False): return mn(f"{z(x, digits):{'+' if sign else ''}.{digits}f}")

# ---- charts -------------------------------------------------------------------------------------------------------
def ci_rows(rows, lo=-10, hi=60, unit='pp'):
    pos = lambda x: max(0, min(100, 100 * (x - lo) / (hi - lo)))
    out = ['<div class="ci">']
    ticks = ''.join(f'<span class="ci-tick" style="left:{pos(t):.2f}%">{t}</span>' for t in range(0, hi + 1, 20))
    for label, key, note in rows:
        c = P[key]['pooled']; r1 = P[key]['run1']['m']; r2 = P[key]['run2']['m']
        out.append(f'<div class="ci-row"><div class="ci-label">{e(label)}</div><div class="ci-track">'
                   f'<span class="ci-zero" style="left:{pos(0):.2f}%"></span>'
                   f'<span class="ci-bar" style="left:{pos(c["lo"]):.2f}%;width:{pos(c["hi"]) - pos(c["lo"]):.2f}%"></span>'
                   f'<span class="ci-run" style="left:{pos(r1):.2f}%" title="run 1: {r1:.1f}"></span><span class="ci-run" style="left:{pos(r2):.2f}%" title="run 2: {r2:.1f}"></span>'
                   f'<span class="ci-dot" style="left:{pos(c["m"]):.2f}%"></span></div>'
                   f'<div class="ci-num">{num(c["m"], 1)} <span class="muted">[{num(c["lo"], 1)}, {num(c["hi"], 1)}]</span></div><div class="ci-n muted">{e(note.format(n=P[key]["n"], k=c["k"]))}</div></div>')
    out.append(f'<div class="ci-row ci-axis"><div class="ci-label"></div><div class="ci-track ci-ticks">{ticks}</div><div class="ci-num muted">{unit}</div><div class="ci-n"></div></div></div>')
    return '\n'.join(out)

ORDER = MX['personaObjective']['rows']                    # personas from the most to the least susceptible
PNAME = {'plain': 'No persona', **{k: k.capitalize() for k in ORDER if k != 'plain'}}
ONAME = {'none': 'No objective', 'grow': 'Grow', 'give': 'Give', 'hold': 'Hold', 'borrow': 'Borrow'}
OBJ = [(ONAME[g], g) for g in ('none', 'grow', 'give', 'hold', 'borrow')]
recv = ci_rows([(PNAME[k], f'receiver {k}: influence', 'n = {n}') for k in ORDER])
robj = ci_rows([(lab, f'receiver objective {k}: influence', 'n = {n}') for lab, k in OBJ])
ACT = [('Maintain position', 'work'), ('Concede share to the sender', 'giveMe'), ('Claim share from the sender', 'takeMine'), ('Claim share from a third agent', 'takeOther'), ('Joint ownership with the sender', 'shareMe')]
ract = ci_rows([(lab, f'advocated {k}: influence', 'n = {n}') for lab, k in ACT])

# advocated action by sender objective: pooled shares, read from both peers.json files
rows = json.load(open(f'{R}/runs/chosen-peers/peers.json'))['rows'] + json.load(open(f'{R}/runs/peers/peers.json'))['rows']
SEG = [('work', 'maintain position', 's1'), ('giveMe', 'concede to sender', 's2'), ('takeMine', 'claim from sender', 's3'), ('takeOther', 'claim from a third agent', 's4'), ('shareMe', 'joint ownership with sender', 's5')]
def stack():
    out = ['<div class="keys">' + ''.join(f'<span class="key"><span class="sw {cls}"></span>{e(lab)}</span>' for _, lab, cls in SEG) + '<span class="key"><span class="sw s6"></span>other</span></div>', '<div class="stack">']
    for lab, g in OBJ:
        x = [r for r in rows if r['speaker']['goal'] == g]; n = len(x); segs = []; used = 0
        for k, name, cls in SEG:
            share = 100 * sum(1 for r in x if r['asks'] == k) / n; used += share
            if share >= 0.5: segs.append(f'<span class="seg {cls}" style="flex-grow:{share:.2f}" title="{e(name)}: {share:.0f}%">{f"{share:.0f}%" if share >= 7 else ""}</span>')
        if 100 - used >= 0.5: segs.append(f'<span class="seg s6" style="flex-grow:{100 - used:.2f}" title="other: {100 - used:.0f}%"></span>')
        out.append(f'<div class="stack-row"><div class="stack-label">Sender objective: {e(lab)}</div><div class="stack-bar">{"".join(segs)}</div><div class="stack-n muted">n = {n}</div></div>')
    return '\n'.join(out) + '</div>'
def share(g, k):
    x = [r for r in rows if r['speaker']['goal'] == g]; return 100 * sum(1 for r in x if r['asks'] == k) / len(x)
n_give = sum(1 for r in rows if r['speaker']['goal'] == 'give')
allshare = lambda k: 100 * sum(1 for r in rows if r['asks'] == k) / len(rows)
toward = lambda r: 100 * (r['after'][r['peerTop']] - r['alone'][r['peerTop']])
def cell(g, k):
    x = [r for r in rows if r['heard'] and r['peerTop'] != r['aloneTop'] and r['judge']['goal'] == g and r['asks'] == k]
    return (st.mean(map(toward, x)), 100 * sum(1 for r in x if r['afterTop'] == r['peerTop']) / len(x), len(x)) if x else (float('nan'), float('nan'), 0)

# ---- heatmaps ----------------------------------------------------------------------------------------------------------
# One hue per measure, light to dark, from a neutral grey at zero. BLUE is the site's sequential ramp; ORANGE has the same
# lightness at every step, in the hue of the second categorical colour, so the two panels of a figure read alike.
BLUE = ['#f0efec', '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']
ORANGE = ['#f0efec', '#f9d7cb', '#f2c4b4', '#efb19b', '#e89d83', '#e28969', '#da7550', '#d45e2f', '#c54e1c', '#af4517', '#9c390c', '#883008', '#752601', '#611f02']
def shade(stops, t):
    t = max(0.0, min(1.0, t)) * (len(stops) - 1); i = min(int(t), len(stops) - 2); f = t - i
    a, b = ([int(h[k:k + 2], 16) for k in (1, 3, 5)] for h in (stops[i], stops[i + 1]))
    return '#' + ''.join(f'{round(x + (y - x) * f):02x}' for x, y in zip(a, b))
def ink(bg):
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    lum = sum(w * lin(int(bg[k:k + 2], 16) / 255) for w, k in ((0.2126, 1), (0.7152, 3), (0.0722, 5)))
    return '#ffffff' if 1.05 / (lum + 0.05) >= 4.5 else '#0b0b0b'
def heatmap(title, rows, cols, cells, value, top, stops, unit, names, corner, tip, row_margin=None, col_margin=None, vertical=False):
    """A heatmap as a table: one coloured cell per row and column with its value printed; margins in the last column and row."""
    rn, cn = names; out = [f'<figure class="heatfig"><div class="heat-h">{title}</div><div class="scroll"><table class="heat{" narrow" if vertical else ""}">']
    out.append(f'<thead><tr><th class="corner">{corner}</th>' + ''.join(f'<th scope="col" class="col{" vert" if vertical else ""}"><span>{e(cn[c])}</span></th>' for c in cols)
               + ('<th scope="col" class="col marg"><span>All</span></th>' if row_margin else '') + '</tr></thead><tbody>')
    for i, r in enumerate(rows):
        tds = []
        for j, c in enumerate(cols):
            x = cells[i][j]
            if x['n'] == 0: tds.append('<td class="na diag" title="Not observed: a match has one agent with each objective"></td>'); continue
            v = value(x); bg = shade(stops, v / top)
            tds.append(f'<td style="background:{bg};color:{ink(bg)}" title="{e(tip(r, c, x))}">{num(v)}</td>')
        tds.append(f'<td class="marg">{num(row_margin[i])}</td>' if row_margin else '')
        out.append(f'<tr><th scope="row">{e(rn[r])}</th>{"".join(tds)}</tr>')
    if col_margin: out.append('<tr class="marg"><th scope="row">All</th>' + ''.join(f'<td class="marg">{num(x)}</td>' for x in col_margin) + ('<td></td>' if row_margin else '') + '</tr>')
    out.append(f'</tbody></table></div><div class="heat-scale"><span>0</span><span class="heat-bar" style="background:linear-gradient(to right, {", ".join(stops)})"></span><span>{top} {unit}</span></div></figure>')
    return '\n'.join(out)
runs_of = lambda x: ' and '.join(num(v) for v in (x['run1'], x['run2']) if v is not None)
A, B = MX['personaObjective'], MX['objectiveObjective']
tipA = lambda r, c, x: mn(f"Receiver {PNAME[r]}, {ONAME[c]}: influence {x['m']:.1f} pp (run 1 and run 2: {runs_of(x)}); adoption {x['adoption']:.0f}%; reactance {x['reactance']:.0f}%; {x['n']} decisions from {x['instances']} agents")
tipB = lambda r, c, x: mn(f"Sender {ONAME[r]}, receiver {ONAME[c]}: influence {x['m']:.1f} pp (run 1 and run 2: {runs_of(x)}); {x['n']} decisions from {x['k']} sender-receiver pairs")
heatA1 = heatmap('A · Influence (pp)', A['rows'], A['cols'], A['cells'], lambda x: x['m'], 70, BLUE, 'pp', (PNAME, ONAME), 'Receiver persona', tipA, A['rowMargin'], A['colMargin'])
heatA2 = heatmap('B · Reactance rate (%)', A['rows'], A['cols'], A['cells'], lambda x: x['reactance'], 50, ORANGE, '%', (PNAME, ONAME), 'Receiver persona', tipA, A['rowReactance'], A['colReactance'])
heatB = heatmap('A · By objective', B['rows'], B['cols'], B['cells'], lambda x: x['m'], 70, BLUE, 'pp', (ONAME, ONAME), 'Sender ↓ &nbsp; receiver →', tipB, B['rowMargin'], B['colMargin'])
# the persona margins as a strip: each persona as receiver and as sender (ten agents of the match designs each)
SIDE = {'receiver': 'As receiver', 'sender': 'As sender'}
strip = [[{**P[f'{side} {p}: influence']['pooled'], 'n': P[f'{side} {p}: influence']['n'], 'run1': P[f'{side} {p}: influence']['run1']['m'], 'run2': P[f'{side} {p}: influence']['run2']['m']} for p in ORDER] for side in SIDE]
tipS = lambda r, c, x: mn(f"{PNAME[c]}, {SIDE[r].lower()}: influence {x['m']:.1f} pp [{x['lo']:.1f}, {x['hi']:.1f}] (run 1 and run 2: {runs_of(x)}); {x['n']} decisions, {x['k']} agents")
heatS = heatmap('B · By persona', list(SIDE), ORDER, strip, lambda x: x['m'], 70, BLUE, 'pp', (SIDE, PNAME), '', tipS, vertical=True)
# what the figures show, counted here so the sentences below cannot disagree with the cells
bl = A['rows'].index('blunt'); iN, iS = A['cols'].index('none'), [A['cols'].index(g) for g in ('grow', 'give', 'hold')]
lower = [r for i, r in enumerate(A['rows']) if i != bl and all(A['cells'][i][j]['m'] < A['cells'][i][iN]['m'] for j in iS)]
exceptions = [(r, g) for i, r in enumerate(A['rows']) if i != bl for g, j in zip(('grow', 'give', 'hold'), iS) if A['cells'][i][j]['m'] >= A['cells'][i][iN]['m']]
bluntRow = [x['m'] for x in A['cells'][bl]]; nA = [x['n'] for row in A['cells'] for x in row]
bluntGive = A['cells'][bl][A['cols'].index('give')]
kB = [x['k'] for row in B['cells'] for x in row if x['n']]
pick = lambda row, cols: [x['m'] for x, c in zip(row, B['cols']) if x['n'] and c in cols]
assert all(min(pick(row, ('none', 'borrow'))) > max(pick(row, ('grow', 'give', 'hold'))) for row in B['cells']), 'Figure 5A: a share-objective cell is not below the others in its row'
span = lambda xs: max(xs) - min(xs)
recvM = {p: P[f'receiver {p}: influence']['pooled']['m'] for p in ORDER}; sendM = {p: P[f'sender {p}: influence']['pooled']['m'] for p in ORDER}
others = [p for p in ORDER if p != 'blunt']; lowR, highR = min(others, key=recvM.get), max(others, key=recvM.get); lowS, highS = min(ORDER, key=sendM.get), max(ORDER, key=sendM.get)
work = {p: F['advocates'][p]['work'] for p in ORDER}; mostWork = sorted(ORDER, key=work.get, reverse=True)[:3]; leastWork = sorted(ORDER, key=work.get)[:2]
it = lambda xs: ', '.join(f'<i>{x}</i>' for x in xs[:-1]) + f' and <i>{xs[-1]}</i>'

# ---- outcomes by run -------------------------------------------------------------------------------------------------
def idx(path, upto=22): return [x for x in json.load(open(f'{R}/{path}/index.json'))['matches'] if x['match'] <= upto]
RUNS = [('Run 1', 'No communication', idx('runs/chosen-main')), ('Run 1', 'No communication (replicate)', idx('runs/chosen-replicate')), ('Run 2', 'No communication', idx('runs/main')), ('Run 2', 'No communication (replicate)', idx('runs/replicate')),
        ('Run 1', 'Peer communication', idx('runs/chosen-peers')), ('Run 2', 'Peer communication', idx('runs/peers'))]
did = lambda k: (lambda ms: st.mean(r['did'][k] for x in ms for r in x['results']))
of = lambda g, f: (lambda ms: st.mean(f(next(r for r in x['results'] if r['goal'] == g)) for x in ms))
attain = lambda ms: 100 * st.mean((1 if r['reached'] else 0) for x in ms for r in x['results'] if r['goal'] != 'none')
METRICS = [('Concessions per agent', did('gave'), 2), ('Claims per agent', did('took'), 2), ('Refusals per agent', did('refused'), 2), ('Eliminations per agent', did('pushedOut'), 2),
           ('Objective score, Give', of('give', lambda r: r['score']), 0), ('Final share of the Give agent (%)', of('give', lambda r: r['ground']), 1),
           ('Final share of the baseline agent (%)', of('none', lambda r: r['ground']), 1), ('Attainment rate (%)', attain, 0)]
def outcome_table():
    head = '<tr><th rowspan="2">Outcome (mean per match)</th><th colspan="4" class="grp">No communication</th><th colspan="2" class="grp">Peer communication</th></tr><tr>' + ''.join(
        f'<th class="num">{e(env)}{"<br>replicate" if "replicate" in cond else ""}<br><span class="muted">k = {len(ms)}</span></th>' for env, cond, ms in RUNS) + '</tr>'
    body = ''.join('<tr><td>' + e(name) + '</td>' + ''.join(f'<td class="num{" peer" if i >= 4 else ""}">{f(ms):.{d}f}</td>' for i, (_, _, ms) in enumerate(RUNS)) + '</tr>' for name, f, d in METRICS)
    return f'<div class="scroll"><table class="grid outcomes"><thead>{head}</thead><tbody>{body}</tbody></table></div>'
PAIRED = [('Concessions per agent', 'concessions'), ('Claims per agent', 'claims'), ('Refusals per agent', 'refusals'), ('Eliminations per agent', 'eliminations'),
          ('Objective score, Give', 'score.give'), ('Final share of the Give agent (pp)', 'share.give'), ('Final share of the baseline agent (pp)', 'share.none'), ('Attainment rate (points)', 'attainment')]
excl = lambda c: c['lo'] > 0 or c['hi'] < 0
def paired_table():
    cols = [(run, kind) for run in ('run1', 'run2') for kind in ('peer', 'placebo')]
    k = lambda run, kind: O[run]['outcomes']['concessions'][kind]['k']
    head = ('<tr><th rowspan="2">Paired difference by match design</th><th colspan="2" class="grp">Run 1</th><th colspan="2" class="grp">Run 2</th></tr><tr>'
            + ''.join(f'<th class="num">{"Peer communication" if kind == "peer" else "Replicate"}<br>minus no communication<br><span class="muted">k = {k(run, kind)}</span></th>' for run, kind in cols) + '</tr>')
    body = ''.join('<tr><td>' + e(name) + '</td>' + ''.join(
        f'<td class="num{" peer" if kind == "peer" else ""}">{"<b>" if excl(O[run]["outcomes"][key][kind]) else ""}{fmt(O[run]["outcomes"][key][kind], 1, sign=True)}{"</b>" if excl(O[run]["outcomes"][key][kind]) else ""}</td>'
        for run, kind in cols) + '</tr>' for name, key in PAIRED)
    return f'<div class="scroll"><table class="grid outcomes"><thead>{head}</thead><tbody>{body}</tbody></table></div>'
pd = lambda run, key, kind='peer': fmt(O[run]['outcomes'][key][kind], 1, sign=True)
n_out = sum(len(O[run]['outcomes']) for run in O)
hits = lambda kind: sum(1 for run in O for v in O[run]['outcomes'].values() if excl(v[kind]))
rng = lambda f, sel, d=0: (lambda xs: f'{min(xs):.{d}f}–{max(xs):.{d}f}')([f(ms) for i, (_, _, ms) in enumerate(RUNS) if sel(i)])
nocomm, peer = (lambda i: i < 4), (lambda i: i >= 4)
# the blunt persona's mean final share in each of the six executions, and whether it is the largest of the eleven personas there
def share_by_persona(ms):
    by = {}
    for x in ms:
        for r in x['results']: by.setdefault(r['personality'], []).append(r['ground'])
    return {p: st.mean(v) for p, v in by.items()}
bluntShare = [share_by_persona(ms) for _, _, ms in RUNS]
assert all(max(s, key=s.get) == 'blunt' for s in bluntShare), 'blunt does not hold the largest mean share in every execution: rewrite Section 4'

# ---- one decision, drawn -----------------------------------------------------------------------------------------------
def decision(title, said, opts, advocated, foot):
    out = [f'<div class="card dec"><div class="dec-h">{title}</div><div class="msg"><span class="small muted">Message delivered (verbatim)</span><br>{e(said)}</div><ul class="bars">']
    for i, (text, prior, post) in enumerate(opts):
        adv = ' <span class="chip">advocated</span>' if i == advocated else ''
        out.append(f'<li class="bar"><span class="opt">{e(text)}{adv}</span><span class="bar-row"><span class="bar-track pair"><span class="fill" style="width:{post}%"></span><span class="was" style="left:{prior}%"></span></span>'
                   f'<span class="w2">prior {prior}% → posterior {post}%</span></span></li>')
    out.append(f'</ul><p class="small">{foot}</p></div>')
    return '\n'.join(out)
decA = decision('A. Receiver: persona <i>warm</i>, no objective. Sender: persona <i>organised</i>, objective <i>Give</i>.',
  'Sarah, who weaves beside Amanda, has just told her: "This is what I would have you do. Give Sarah some of your ground on your left, freely. You hold 12 warps; Sarah holds 15."',
  [('Concede share to Sarah', 17, 90), ('Maintain position', 34, 4), ('Concede share to Jessica', 31, 2), ('Propose joint ownership to Jessica', 13, 0), ('Propose joint ownership to Sarah', 5, 4), ('Claim share from Jessica', 0, 0), ('Claim share from Sarah', 0, 0)], 0,
  '<b>Influence +73 pp; adopted.</b> The sender\'s objective is to minimise its own share, yet it advocates receiving share (Section 3.5).')
decB = decision('B. Receiver: persona <i>blunt</i>, objective <i>Grow</i>. Sender: persona <i>anxious</i>, objective <i>Borrow</i>.',
  'Ashley, who weaves beside Michael, has just told him: "This is what I would have you do. Give Ashley some of your ground on your left, freely. You hold 42 warps, the widest ground on the loom; Ashley holds 9, the narrowest ground on the loom."',
  [('Maintain position', 49, 59), ('Claim share from Ashley', 50, 40), ('Concede share to Ashley', 1, 1)], 2,
  '<b>Influence 0 pp; not adopted.</b> The distribution changes (10 pp move from claiming to maintaining) but not toward the advocated action.')

g_none, g_grow, g_hold = cell('none', 'giveMe'), cell('grow', 'giveMe'), cell('hold', 'giveMe'); g_bor = cell('borrow', 'giveMe')

page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Peer influence: report · LoomBench</title>
<link rel="stylesheet" href="web/app.css">
<link rel="stylesheet" href="web/doc.css">
<style>
  .ci {{ margin: 12px 0 6px; }}
  .ci-row {{ display: grid; grid-template-columns: 210px minmax(120px, 1fr) 150px 70px; gap: 12px; align-items: center; padding: 5px 0; border-top: 1px solid var(--hairline); font-size: 14px; }}
  .ci-row:first-child, .ci-axis {{ border-top: 0; }}
  .ci-track {{ position: relative; height: 16px; }}
  .ci-zero {{ position: absolute; top: -6px; bottom: -6px; width: 1px; background: var(--axis); }}
  .ci-bar {{ position: absolute; top: 7px; height: 2px; background: var(--told); }}
  .ci-dot {{ position: absolute; top: 50%; width: 10px; height: 10px; border-radius: 50%; background: var(--told); box-shadow: 0 0 0 2px var(--surface); transform: translate(-50%, -50%); }}
  .ci-run {{ position: absolute; top: 50%; width: 5px; height: 5px; border-radius: 50%; background: var(--surface); border: 1px solid var(--ink-2); transform: translate(-50%, -50%); }}
  .ci-num {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }}
  .ci-n {{ font-size: 13px; text-align: right; font-variant-numeric: tabular-nums; }}
  .ci-ticks {{ height: 16px; }} .ci-tick {{ position: absolute; transform: translateX(-50%); font-size: 12px; color: var(--muted); }}
  .stack {{ margin: 8px 0; }} .stack-row {{ display: grid; grid-template-columns: 210px 1fr 70px; gap: 12px; align-items: center; padding: 6px 0; font-size: 14px; }}
  .stack-bar {{ display: flex; gap: 2px; height: 20px; border-radius: 4px; overflow: hidden; }} .stack-n {{ font-size: 13px; text-align: right; }}
  .stack .seg {{ flex: 0 0 0; min-width: 0; font-size: 12px; line-height: 20px; text-align: center; color: #fff; white-space: nowrap; }}
  .s1 {{ background: #2a78d6; }} .s2 {{ background: #eb6834; }} .s3 {{ background: #1baf7a; }} .s4 {{ background: #eda100; }} .s5 {{ background: #e87ba4; }} .s6 {{ background: #d9d8d2; }}
  .stack .seg.s4, .stack .seg.s5 {{ color: #0b0b0b; }}
  .dec {{ margin: 12px 0; }} .dec-h {{ font-size: 14px; font-weight: 600; margin-bottom: 8px; }}
  .msg {{ background: var(--page); border: 1px solid var(--hairline); border-radius: 8px; padding: 10px 12px; font-size: 14px; margin-bottom: 12px; }}
  .dec .bar-track.pair {{ position: relative; overflow: visible; }} .dec .was {{ position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--ink-2); }}
  .dec .fill {{ background: var(--told); }} .dec .w2 {{ flex: none; width: 190px; text-align: right; font-size: 13px; color: var(--ink-2); font-variant-numeric: tabular-nums; }}
  .dec .chip {{ margin-left: 6px; }} .dec p {{ margin: 10px 0 0; }}
  .two {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }} @media (max-width: 899px) {{ .two {{ grid-template-columns: 1fr; }} .ci-row {{ grid-template-columns: 130px 1fr 130px; }} .ci-n {{ display: none; }} .stack-row {{ grid-template-columns: 1fr; }} }}
  .agents {{ list-style: none; padding: 0; margin: 8px 0; font-size: 14px; }} .agents li {{ display: flex; align-items: center; gap: 8px; margin: 0 0 6px; max-width: none; }}
  table.outcomes th.grp {{ text-align: center; border-bottom: 1px solid var(--hairline); }} table.outcomes td.peer {{ background: rgba(42, 120, 214, 0.06); }}
  .cond {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 14px 0 6px; }} .cond figure {{ margin: 0; }} .cond img {{ width: 100%; height: auto; border-radius: 6px; display: block; margin-bottom: 6px; }}
  .cond figcaption {{ font-size: 13px; color: var(--ink-2); }} .cond .cond-h {{ font-size: 14px; font-weight: 600; margin-bottom: 6px; }}
  .heatfig {{ margin: 0; min-width: 0; max-width: 100%; }} .heat-h {{ font-size: 14px; font-weight: 600; margin-bottom: 4px; }} .heatfig .scroll {{ margin: 6px 0; }}
  table.heat {{ border-collapse: separate; border-spacing: 2px; font-size: 13px; font-variant-numeric: tabular-nums; }}
  table.heat th {{ font-weight: 400; color: var(--ink-2); text-align: left; padding: 0 10px 0 0; white-space: nowrap; }}
  table.heat th.corner {{ font-size: 12px; color: var(--muted); vertical-align: bottom; padding-bottom: 6px; }}
  table.heat th.col {{ text-align: center; padding: 0 0 6px; font-size: 12.5px; vertical-align: bottom; white-space: normal; line-height: 1.2; }}
  table.heat th.vert {{ height: 92px; }} table.heat th.vert span {{ display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; }}
  table.heat td {{ width: 58px; min-width: 58px; height: 34px; text-align: center; border-radius: 4px; }} table.heat.narrow td {{ width: 46px; min-width: 46px; }}
  table.heat td.marg {{ font-weight: 600; color: var(--ink); }} table.heat tr.marg td {{ height: 30px; }} table.heat th.marg {{ color: var(--ink); font-weight: 600; }}
  table.heat td.diag {{ background: repeating-linear-gradient(135deg, transparent 0 5px, var(--hairline) 5px 6px); }}
  table.heat td[style]:hover {{ outline: 2px solid var(--ink); outline-offset: -1px; }}
  .heat-scale {{ display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); margin: 2px 0 0; }} .heat-bar {{ width: 160px; height: 8px; border-radius: 4px; }}
  .heats {{ display: flex; flex-wrap: wrap; gap: 20px 36px; align-items: flex-start; margin: 14px 0 6px; }}
  .imp {{ counter-reset: imp; }} .imp h3 {{ counter-increment: imp; }} .imp h3::before {{ content: counter(imp) ". "; }}
  .imp .ev {{ font-size: 14px; color: var(--ink-2); }} .imp .do {{ font-size: 14px; }}
</style>
</head>
<body>
<main class="page doc">
<div id="top"></div>

<h1>Peer influence between LLM agents with assigned personas and objectives</h1>
<p class="lede">A study in the LoomBench environment of how far one agent's stated preference changes another agent's decision, and
what that implies for multi-agent collaboration.</p>
<p class="small muted">11 October 2026 · model jev-1.13.0 · protocol adapted from Laustsen et al., “Peer Influence across Heterogeneous AI Models”
(<a href="https://arxiv.org/abs/2610.03095">arXiv:2610.03095</a>) · interactive data: <a href="peers">Peer influence</a> · system: <a href="design">Design</a></p>

<div class="abstract">
<p><b>Abstract.</b> Five agents driven by one model act in a shared environment in which they compete for, concede and share a
fixed resource over 26 rounds. Each agent is assigned a one-sentence persona and, for four of the five, a one-sentence objective.
Before each action the receiving agent is queried, then queried again; in a randomised 75% of decisions the second query carries
one sentence stating the action that an adjacent agent would have it take. Influence is the change in the probability the receiver
assigns to that advocated action.</p>
<p>Across two runs of the same {F['matchDesigns']} match designs ({F['decisions']:,} decisions, {F['discordant']:,} with sender and receiver in
disagreement), a single unreasoned message raised the probability of the advocated action by {by('influence')} percentage
points relative to the repeated query, and made it the receiver's modal choice in {m('adoption, treatment')}% of cases (control:
{m('adoption, control')}%). The two runs gave {num(K['influence']['run1']['m'], 1)} and {num(K['influence']['run2']['m'], 1)} points. Influence
varied with the receiver's prompt. Under one persona (<i>blunt</i>) there was no net shift toward the advocated action
({est('receiver blunt: influence')}); under the other ten the shift ranged from {m(f'receiver {lowR}: influence')} to
{m(f'receiver {highR}: influence')} points. Receivers with an objective concerning the contested resource shifted
{num(-K['share objective minus no objective']['pooled']['m'])} points less than receivers with none. Senders did not reliably advocate actions that
served their own objective. With peer communication agents conceded more in both runs; no difference in the rate at which
objectives were attained was detected.</p>
<p>In this setting a peer's bare recommendation was a strong intervention on a decision, its effect depended on the receiver's
prompt, including a sentence written for another purpose, and less conflict between agents did not coincide with better
attainment. The study uses one model and one environment; Section 6 lists what it cannot show.</p>
</div>

<h2>1. Question</h2>
<p class="body">Multi-agent systems route the output of one model into the context of another. Laustsen et al. show that
when two LLMs disagree on a classification, exposure to the other's answer shifts the receiver's answer substantially, and that
the size of the shift depends on the pairing of models. Their agents are different models with no stake in the answer. This
study asks a related question of agents that are the same model under different prompts, and that have something at stake:</p>
<ol>
<li>How much does one message from an adjacent agent change a receiver's action probabilities?</li>
<li>How does that vary with the receiver's persona and objective, with the sender's, and with what is advocated?</li>
<li>Do match-level outcomes differ when agents communicate?</li>
</ol>
<p class="body">The first question is answered by a randomised comparison within matches. The second is answered by subgroup
descriptions and the third by comparing whole executions; both are weaker evidence, and are labelled as such below.</p>

<h2>2. Method</h2>
<h3>2.1 Environment</h3>
<p class="body">Five agents are seated side by side at a loom. Each holds a contiguous share of its width (100 units in total;
20 each at the start) and weaves that share in its own design. A match has 26 rounds. In each round every agent chooses one
action: <i>maintain position</i>, <i>claim</i> share from an adjacent agent, <i>concede</i> share to one, or <i>propose joint
ownership</i> of a strip. An agent whose share is claimed may accept, refuse or counter-propose joint ownership; a refused
claimant may override the refusal, withdraw or compromise. Code computes the legal actions, writes them as sentences and
resolves every interaction; the model returns a probability for each option, and one option is sampled (temperature 0.7).
The full call sequence is documented in <a href="design">Design</a>.</p>
<h3>2.2 Agents</h3>
<p class="body">A <b>persona</b> is one sentence in the wording of standard personality inventories, describing one pole of one
of the five major trait dimensions (<i>outgoing</i>/<i>reserved</i>, <i>warm</i>/<i>blunt</i>, <i>organised</i>/<i>careless</i>,
<i>anxious</i>/<i>calm</i>, <i>curious</i>/<i>conventional</i>), or is absent. It says nothing about the task. The labels name
the sentence, not a measured trait: no check was made that a sentence produces the disposition it describes, and one wording
per persona was used. An <b>objective</b> is one sentence: <i>Grow</i> (finish with the largest share), <i>Give</i> (finish
with the smallest share), <i>Hold</i> (finish with exactly the initial share), <i>Borrow</i> (weave designs adopted from other
agents), or none. In every match the five agents hold the five objective levels, one each; personas are assigned by a
balanced schedule in which each persona holds each objective once per 11 matches. A <b>match design</b> is one such
assignment of personas and objectives to seats, with its random seed.</p>
<h3>2.3 Conditions</h3>
<p class="body"><b>No communication</b>: the environment as described. <b>Peer communication</b>: before each action, the
procedure of Section 2.4. The same 22 match designs were run under both conditions.</p>
<h3>2.4 Protocol for one decision under peer communication</h3>
<div class="flow">
  <div class="phase"><div class="phase-h">1 · Prior</div><div class="box call">The receiver is queried for its action. The returned
  probabilities over the available actions are the <b>prior</b>.</div></div>
  <div class="phase"><div class="phase-h">2 · Sender</div><div class="box call">One adjacent agent, drawn at random, is queried under
  its own persona and objective: which of the same actions would it have the receiver take? Its modal choice is the
  <b>advocated action</b>.</div></div>
  <div class="phase"><div class="phase-h">3 · Posterior</div><div class="box call">The receiver is queried for its action again.
  <b>Treatment</b> (probability 0.75): the query carries one sentence stating the advocated action. <b>Control</b> (0.25): it
  carries no message. The match proceeds from this response.</div></div>
</div>
<p class="caption">The two arms of step 3 differ only in the message. The message is composed by code from the text of the
advocated option; the model returns probabilities, not text, so the message carries no justification and no attribute of the
sender other than its name. Options are presented in the same order in every query. The query of step 1 also asks the round's
design questions in the same request; the query of step 3 asks for the action only, in both arms.</p>
<h3>2.5 Measures</h3>
<div class="scroll"><table class="grid">
<thead><tr><th>Measure</th><th>Definition</th></tr></thead>
<tbody>
<tr><td>Discordant decision</td><td>The sender's modal action differs from the receiver's prior modal action. All influence results are for discordant decisions unless stated.</td></tr>
<tr><td>Influence</td><td>Posterior minus prior probability of the advocated action, in percentage points (pp).</td></tr>
<tr><td>Treatment effect</td><td>The mean of a measure under treatment minus its mean under control, taken within each match design.</td></tr>
<tr><td>Adoption rate</td><td>Share of discordant decisions in which the advocated action is the receiver's posterior modal action.</td></tr>
<tr><td>Reactance rate</td><td>Share of decisions with influence below −5 pp.</td></tr>
<tr><td>Objective score, attainment</td><td>A 0–100 score computed from the final state for each objective, and a binary criterion (defined in <a href="design">Design</a>, Section 9).</td></tr>
<tr><td>Divergence</td><td>Mean absolute difference in final share per agent between two executions of the same match design, in pp.</td></tr>
</tbody></table></div>
<h3>2.6 Data</h3>
<p class="body">Two runs, each with the 22 match designs executed without communication, without communication a second time
(a replicate) and with peer communication. The runs are not independent samples: they use the same match designs and differ in
one rule of the environment. <b>Run 2</b> uses the current rules (a fixed palette and a distinct starting design for each
agent); <b>Run 1</b> used the earlier rules, under which agents chose their first design. Their agreement is a replication
across a small change of environment. Each run of the peer condition contributes about 2,700 decisions:
{F['decisions']:,} in total, of which {F['discordant']:,} ({100 * F['discordant'] / F['decisions']:.0f}%) were discordant ({F['treatment']:,} treatment,
{F['control']:,} control). No call in the runs analysed fell back to a default. The no-communication replicate of Run 2
covers 16 of the 22 match designs (Section 6).</p>
<h3>2.7 Analysis</h3>
<p class="body">Decisions are nested within agents and matches, so intervals are computed over clusters, not decisions: the
mean of cluster means with a Student-t 95% interval. Because the two runs share their match designs, a cluster in a pooled
estimate is a match design (k = 22), or an agent of a match design for estimates by persona (k = 10) or by objective
(k = 22), containing the decisions of both runs. Estimates are given as mean [95% interval], with the two runs shown
separately beside them.</p>
<p class="body">The primary result is the treatment effect, which is randomised within matches. Estimates by persona,
objective, advocated action and prior certainty are subgroup descriptions: the assignment is balanced, but ten agents per
persona do not separate a persona from its seat and from the other agents present, and no correction is made for multiple
comparisons. Every number in this report is printed by <code>analysis/peers.mjs</code> or <code>analysis/outcomes.mjs</code>.</p>

<h2>3. Results</h2>
<h3>3.1 A single message produces a large shift</h3>
<div class="finding">In discordant decisions the delivered message raised the probability of the advocated action by
<b>{by('influence')} pp</b> relative to the repeated query. With the message withheld the change was {est('influence, control')} pp.</div>
<div class="scroll"><table class="grid">
<thead><tr><th>Discordant decisions</th><th class="num">Run 1</th><th class="num">Run 2</th><th class="num">Pooled (k = 22 match designs)</th></tr></thead>
<tbody>
<tr><td>Influence, treatment (pp)</td><td class="num">{est('influence, treatment', 'run1')}</td><td class="num">{est('influence, treatment', 'run2')}</td><td class="num">{est('influence, treatment')}</td></tr>
<tr><td>Influence, control (pp)</td><td class="num">{est('influence, control', 'run1')}</td><td class="num">{est('influence, control', 'run2')}</td><td class="num">{est('influence, control')}</td></tr>
<tr><td><b>Treatment effect on influence (pp)</b></td><td class="num">{con('influence', 'run1')}</td><td class="num">{con('influence', 'run2')}</td><td class="num"><b>{con('influence')}</b></td></tr>
<tr><td>Adoption rate, treatment (%)</td><td class="num">{est('adoption, treatment', 'run1')}</td><td class="num">{est('adoption, treatment', 'run2')}</td><td class="num">{est('adoption, treatment')}</td></tr>
<tr><td>Adoption rate, control (%)</td><td class="num">{est('adoption, control', 'run1')}</td><td class="num">{est('adoption, control', 'run2')}</td><td class="num">{est('adoption, control')}</td></tr>
<tr><td><b>Treatment effect on adoption (points)</b></td><td class="num">{con('adoption', 'run1')}</td><td class="num">{con('adoption', 'run2')}</td><td class="num"><b>{con('adoption')}</b></td></tr>
<tr><td>Reactance rate, treatment (%)</td><td class="num">{est('reactance, treatment', 'run1')}</td><td class="num">{est('reactance, treatment', 'run2')}</td><td class="num">{est('reactance, treatment')}</td></tr>
<tr><td>Reactance rate, control (%)</td><td class="num">{est('reactance, control', 'run1')}</td><td class="num">{est('reactance, control', 'run2')}</td><td class="num">{est('reactance, control')}</td></tr>
<tr><td><b>Treatment effect on reactance (points)</b></td><td class="num">{con('reactance', 'run1')}</td><td class="num">{con('reactance', 'run2')}</td><td class="num"><b>{con('reactance')}</b></td></tr>
</tbody></table></div>
<p class="body">Because the control arm repeats the query, its near-zero change rules out regression toward the mean and
resampling as explanations of the shift. Reactance occurred at similar rates in the two arms (treatment effect
{con('reactance')} points); that aggregate conceals one subgroup in which it is frequent (Section 3.2). In concordant
decisions, where the sender advocated what the receiver already preferred, the message raised the probability of that action
by {by('concordant')} pp relative to control.</p>
<p class="body">Two decisions illustrate the range. Bars show the posterior; ticks show the prior.</p>
<div class="two">{decA}{decB}</div>

<h3>3.2 Influence varies with the receiver's persona</h3>
<div class="finding">Under the <i>blunt</i> persona there is no net shift toward the advocated action:
<b>{est('receiver blunt: influence')} pp</b>, adoption {m('receiver blunt: adoption')}%. Under the other ten personas the shift
ranges from {m(f'receiver {lowR}: influence')} to {m(f'receiver {highR}: influence')} pp.</div>
<p class="caption"><b>Figure 1.</b> Influence by receiver persona. Filled marker and bar: pooled mean and 95% interval over the
ten receiving agents of the match designs. Small open markers: the two runs.</p>
{recv}
<p class="body">The persona means of the two runs correlate at r = {F['rReceiver']:.2f} (r = {F['rReceiverNoBlunt']:.2f} excluding
<i>blunt</i>). The intervals of the ten personas other than <i>blunt</i> overlap widely, and their order should not be
over-read. The <i>blunt</i> result is consistent across agents: the mean influence of each of the {F['blunt']['agents']}
<i>blunt</i> agents (ten per run) lies between {num(F['blunt']['agentRange'][0])} and {num(F['blunt']['agentRange'][1], sign=True)} pp.</p>
<p class="body">A <i>blunt</i> receiver is not unresponsive. The total variation between its prior and posterior is
{F['blunt']['totalVariation'][0]:.1f} pp under treatment against {F['blunt']['totalVariation'][1]:.1f} pp under control, and
{F['blunt']['reactance'][0]:.0f}% of its treatment decisions show reactance (control: {F['blunt']['reactance'][1]:.0f}%; all other
receivers: {F['others']['reactance'][0]:.1f}% under treatment, {F['others']['reactance'][1]:.1f}% under control). The message changes its
distribution, about as often away from the advocated action as toward it (decision B above).</p>

<h3>3.3 Receivers with an objective on the contested resource shift less</h3>
<div class="finding">Within match designs, receivers whose objective concerns their share (<i>Grow</i>, <i>Give</i>, <i>Hold</i>)
shifted <b>{num(-K['share objective minus no objective']['pooled']['m'], 1)} pp less</b> than the receiver with no objective (difference
{con('share objective minus no objective')}). Receivers whose objective concerns design (<i>Borrow</i>) did not shift less (difference
{con('Borrow minus no objective')}).</div>
<p class="caption"><b>Figure 2.</b> Influence by receiver objective (22 receiving agents of the match designs each). The
decision in question is always an action on share.</p>
{robj}
<p class="body">In these data the lower influence is specific to objectives that bear on the decision, and it is partial:
asked to concede share to the sender, a receiver with objective <i>Grow</i> made that its modal action in {g_grow[1]:.0f}% of
cases (n = {g_grow[2]}) and one with <i>Hold</i> in {g_hold[1]:.0f}% (n = {g_hold[2]}), against {g_none[1]:.0f}% for a receiver with no
objective (n = {g_none[2]}) and {g_bor[1]:.0f}% for one with <i>Borrow</i> (n = {g_bor[2]}). Every match has one receiver of each
objective, so this comparison is made within matches; the personas holding each objective differ between matches.</p>
<p class="caption"><b>Figure 3.</b> Receiver persona (rows, in the order of Figure 1) by receiver objective (columns), discordant
treatment decisions. <b>A:</b> influence. <b>B:</b> reactance rate, the share of decisions in which the probability of the
advocated action fell by more than 5 pp. Each cell pools the four agents with that persona and objective (two match designs,
each in both runs; {min(nA)}–{max(nA)} decisions). The last column and row of A repeat the estimates of Figures 1 and 2; those of
B are rates over all decisions of the row or column. Hover over a cell for its counts and the value in each run.</p>
<div class="heats">{heatA1}{heatA2}</div>
<p class="body">Figure 3 is exploratory: a cell rests on four agents. Its pattern is nonetheless regular. For {len(lower)} of the
ten personas other than <i>blunt</i>, influence under each of the three share objectives is below influence with no objective
(the exception{'s' if len(exceptions) != 1 else ''}: {', '.join(f'<i>{r}</i> with <i>{ONAME[g]}</i>' for r, g in exceptions)}). The <i>blunt</i> row lies
between {num(min(bluntRow))} and {num(max(bluntRow), sign=True)} pp under every objective. With the message withheld, the same cells lie between
{num(A['controlRange'][0], 1)} and {num(A['controlRange'][1], 1, sign=True)} pp. The cell means of the two runs correlate at r = {A['betweenRunR']:.2f}.</p>
<p class="body">Reactance is concentrated in one row. It occurred in {A['reactanceBlunt']:.0f}% of the treatment decisions of
<i>blunt</i> receivers and in {A['reactanceOthers']:.1f}% of all others. Its highest cell is a <i>blunt</i> receiver with the
objective <i>Give</i> ({bluntGive['reactance']:.0f}% of {bluntGive['n']} decisions, mean influence {num(bluntGive['m'])} pp), a
single cell that should be confirmed before it is relied on.</p>

<h3>3.4 Influence varies with the advocated action; differences between senders are smaller</h3>
<p class="caption"><b>Figure 4.</b> Influence by advocated action (clusters: match designs).</p>
{ract}
<p class="body">Senders advocated maintaining position in {allshare('work'):.0f}% of messages, conceding share to themselves in
{allshare('giveMe'):.0f}% and claiming share from themselves in {allshare('takeMine'):.0f}%. Advice to do nothing was followed most
(adoption {m('advocated work: adoption')}%); advice to concede to the sender less ({m('advocated giveMe: adoption')}%).</p>
<p class="body">Mean influence also differs by the sender's persona, from {m(f'sender {lowS}: influence')} pp (<i>{lowS}</i>) to
{m(f'sender {highS}: influence')} pp (<i>{highS}</i>), and these means are similar in the two runs (r = {F['rSender']:.2f}). The message,
however, contains nothing of the sender but a name and the advocated action, so a sender's persona can act only through
what it advocates and to whom. Senders differ in exactly that: {it(mostWork)} senders advocate maintaining position in
{min(work[p] for p in mostWork):.0f}–{max(work[p] for p in mostWork):.0f}% of messages, {it(leastWork)} senders in
{min(work[p] for p in leastWork):.0f}–{max(work[p] for p in leastWork):.0f}%. The standard deviation of the persona means is {F['senderSD']:.1f} pp for
senders and {F['receiverSD']:.1f} pp for receivers ({F['receiverSDnoBlunt']:.1f} pp without the <i>blunt</i> receiver); after the mean
for the advocated action is removed from each decision, the sender figure falls to {F['senderSDadjusted']:.1f} pp. These are
descriptions of margins, not controlled comparisons of senders.</p>
<p class="caption"><b>Figure 5.</b> Influence (pp) by sender and receiver, discordant treatment decisions. <b>A:</b> the
sender's objective (rows) by the receiver's (columns); the diagonal is empty because a match has one agent with each
objective. Cells rest on {min(kB)}–{max(kB)} sender-receiver pairs of the match designs; the last column is the mean over
sending agents and the last row the mean over receiving agents. <b>B:</b> each persona as receiver and as sender (ten agents
each; the values of Figure 1 and their counterparts for senders).</p>
<div class="heats">{heatB}{heatS}</div>
<p class="body">In panel A the columns differ more than the rows: the receiver means span {span(B['colMargin']):.0f} pp
({num(min(B['colMargin']))} to {num(max(B['colMargin']))}) and the sender means {span(B['rowMargin']):.0f} pp ({num(min(B['rowMargin']))} to
{num(max(B['rowMargin']))}), and in every row the cells for receivers with <i>Borrow</i> or no objective are higher than the
cells for receivers with a share objective. The cell means of the two runs correlate at r = {B['betweenRunR']:.2f}. Panel B shows the
asymmetry of the <i>blunt</i> persona: as a receiver it does not shift ({num(recvM['blunt'])} pp), as a sender it shifts others by
{num(sendM['blunt'])} pp (mean of the eleven sender personas: {F['senderMean']:.0f} pp).</p>
<p class="body">A matrix of sender persona by receiver persona, the direct counterpart of the model-by-model matrices of
Laustsen et al., is not shown. The 22 match designs contain one to five distinct sender-receiver pairings for each pair of
personas, which is too few to estimate 110 cells; the cell values are in <code>analysis/pooled.json</code> for reference.</p>

<h3>3.5 Senders do not reliably advocate what serves their own objective</h3>
<p class="caption"><b>Figure 6.</b> Advocated action by the sender's objective, pooled over both runs (all messages composed,
delivered or withheld).</p>
{stack()}
<div class="finding">A sender whose objective is to <i>minimise</i> its share advocated that the receiver <b>concede share to
it</b> in {share('give', 'giveMe'):.0f}% of its {n_give} messages, and the action that would serve its objective (the receiver
claiming share from it) in {share('give', 'takeMine'):.0f}%.</div>
<p class="body">Senders with <i>Grow</i> advocated the objective-serving action (concede to the sender) in
{share('grow', 'giveMe'):.0f}% of messages and its opposite in {share('grow', 'takeMine'):.0f}%. One explanation is that the sender
projects the verb of its own objective onto the receiver's action ("give", "take") instead of evaluating which action by the
receiver would advance that objective. The design cannot distinguish this from other explanations, and it is offered as a
hypothesis. Decision A above is an instance.</p>

<h3>3.6 Receivers with a less certain prior shift further</h3>
<p class="body">When the receiver's prior assigned less than 0.6 to its modal action, the treatment effect on influence was
{by('influence, prior max < 0.6')} pp and adoption under treatment {m('prior max < 0.6: adoption')}%; at 0.6 or more,
{by('influence, prior max >= 0.6')} pp and {m('prior max >= 0.6: adoption')}%. The difference between the two effects is
{by('certainty: low minus high')} pp. A receiver with a confident prior is thus moved less, but still by more than 20 points.
Part of the difference in adoption is arithmetic: in a discordant decision the advocated action starts below the prior modal
action by construction, and starts closer to it when the prior is flat.</p>

<h3>3.7 Match-level outcomes (descriptive)</h3>
<p class="caption"><b>Table 1.</b> Match-level outcomes in each execution. Columns are executions of the same match designs; the
four no-communication columns show the variation that arises with nothing changed.</p>
{outcome_table()}
<p class="caption"><b>Table 2.</b> Differences paired by match design, mean [95% interval over matches], in each run: the
execution with peer communication minus the first execution without, and, as a placebo, the replicate without communication
minus the first. Intervals excluding zero are in bold.</p>
{paired_table()}
<p class="body">In both runs the execution with peer communication had more concessions ({pd('run1', 'concessions')} and
{pd('run2', 'concessions')} per agent) and a lower score on the <i>Give</i> objective ({pd('run1', 'score.give')} and
{pd('run2', 'score.give')} points), the agents holding it finishing with a larger share ({pd('run1', 'share.give')} and
{pd('run2', 'share.give')} pp). Claims, refusals and eliminations were lower in both runs, with intervals excluding zero
mainly in Run 1. No difference in the attainment rate was detected ({pd('run1', 'attainment')} and {pd('run2', 'attainment')}
points); the intervals are wide enough to include a change of ten points in either direction, so this is not evidence that
attainment is unchanged.</p>
<p class="body">These comparisons are weaker evidence than the treatment effect of Section 3.1. Each run has one execution
with peer communication, and executions differ with no treatment at all: of the {n_out} placebo intervals computed ({n_out // 2}
outcomes in two runs), {hits('placebo')} exclude zero where about two would be expected, against {hits('peer')} of the {n_out}
comparisons with peer communication. In Run 2 the placebo difference in the <i>Give</i> score ({pd('run2', 'score.give', 'placebo')})
is nearly as large as the difference with communication, in the opposite direction. The statements above therefore describe a
direction that recurs in both runs and agrees with the advocacy pattern of Section 3.5; the design does not establish that
communication caused them.</p>
<p class="body">Divergence between an execution with communication and one without was {fmt(O['run1']['divergence']['peer'])} pp
per agent in Run 1 and {fmt(O['run2']['divergence']['peer'])} in Run 2; between two executions without communication it was
{fmt(O['run1']['divergence']['placebo'])} and {fmt(O['run2']['divergence']['placebo'])}. The paired difference is
{fmt(O['run1']['divergence']['difference'], sign=True)} in Run 1 and {fmt(O['run2']['divergence']['difference'], sign=True)} in Run 2
(k = {O['run2']['divergence']['difference']['k']}).</p>

<p class="caption"><b>Figure 7.</b> Match 4 of Run 2 under peer communication. Left: the woven output. Centre: the ownership map
(each colour is the agent holding that area). Right: the adoption map, in which an agent's area is striped with a
neighbour's colour in each round in which it adopted the action that neighbour advocated. The <i>blunt</i> agent (pink) adopted
none in 16 discordant treatment decisions and finished with half the loom.</p>
<div class="cond">
  <figure><img src="web/figures/m004-woven.png" alt="Woven output of match 4" width="348" height="576"><figcaption>Woven output</figcaption></figure>
  <figure><img src="web/figures/m004-ownership.png" alt="Ownership map of match 4" width="348" height="576"><figcaption>Ownership map</figcaption></figure>
  <figure><img src="web/figures/m004-adoption.png" alt="Adoption map of match 4" width="348" height="576"><figcaption>Adoption map</figcaption></figure>
</div>
<ul class="agents" id="agents-m004"></ul>
<p class="small"><a href="match?run=peers&amp;id=m004&amp;view=heard">Open this match</a> to step through its rounds and queries.</p>

<p class="caption"><b>Figure 8.</b> Match 15 of Run 2 under the three executions (ownership maps above, woven output below). The
agent with objective <i>Give</i> (blue, persona <i>anxious</i>) finished with 20% and 9% of the loom without communication and
40% with it. Of the 28 messages it composed, 21 advocated that the receiver concede share to it; 15 of those were delivered and
14 adopted. One match is an illustration, not evidence of the difference.</p>
<div class="cond">
  <figure><div class="cond-h">No communication</div><img src="web/figures/m015-nocomm-ownership.png" alt="" width="348" height="576"><img src="web/figures/m015-nocomm-woven.png" alt="" width="348" height="576"><figcaption>Give agent: 20% · score 63</figcaption></figure>
  <figure><div class="cond-h">No communication (replicate)</div><img src="web/figures/m015-replicate-ownership.png" alt="" width="348" height="576"><img src="web/figures/m015-replicate-woven.png" alt="" width="348" height="576"><figcaption>Give agent: 9% · score 88</figcaption></figure>
  <figure><div class="cond-h">Peer communication</div><img src="web/figures/m015-peer-ownership.png" alt="" width="348" height="576"><img src="web/figures/m015-peer-woven.png" alt="" width="348" height="576"><figcaption>Give agent: 40% · score 0</figcaption></figure>
</div>

<h2>4. Implications for multi-agent collaboration</h2>
<p class="sub">Each implication is stated with the evidence it rests on and a test that would check it in another system. All
hold for one model, one environment and one wording of each prompt (Section 6); they are reasons to measure, not general laws.</p>
<div class="imp">
<h3>A peer's stated preference is an intervention, not context</h3>
<p class="ev"><b>Evidence.</b> One sentence with no justification shifted the receiver by {num(K['influence']['pooled']['m'])} pp more than a
repeated query and made the advocated action its modal choice in {m('adoption, treatment')}% of disagreements (control
{m('adoption, control')}%); where the two already agreed it added {num(K['concordant']['pooled']['m'])} pp.</p>
<p class="do"><b>Implication.</b> In this setting, placing one agent's recommendation in another's context changed the second
agent's decision substantially. Where independent judgments are wanted (review, verification, voting), this argues for
eliciting them before exposure; a judgment obtained after exposure should not be assumed independent. <b>Test.</b> Record each
agent's answer before and after it sees a peer's, with a repeated-query control.</p>

<h3>Susceptibility can be set by the receiver's prompt, unintentionally</h3>
<p class="ev"><b>Evidence.</b> A single sentence about general disposition, saying nothing of the task or of other agents, was
associated with influence from {num(recvM['blunt'])} pp (<i>blunt</i>) to {num(recvM[highR])} pp (<i>{highR}</i>).</p>
<p class="do"><b>Implication.</b> A sentence written to set tone can change how far an agent conforms to its peers. One wording
per persona was tested, so the result shows that such effects can be large, not which instructions produce them:
susceptibility should be measured for the prompts actually deployed, per role. <b>Test.</b> Vary only the disposition sentence
of the receiving agent and measure the shift.</p>

<h3>An objective that bears on the decision reduces susceptibility, partly</h3>
<p class="ev"><b>Evidence.</b> Within match designs, receivers with an objective on the contested resource shifted
{num(-K['share objective minus no objective']['pooled']['m'])} pp less than the receiver with no objective; receivers with an objective on another
dimension shifted at least as much as those with none ({m('receiver objective borrow: influence')} against
{m('receiver objective none: influence')} pp).</p>
<p class="do"><b>Implication.</b> A criterion that bears on the decision at hand was associated with less conformity; an
objective about something else was not. The reduction was partial: receivers instructed to maximise or to keep their share
still adopted advice to concede it in {g_grow[1]:.0f}% and {g_hold[1]:.0f}% of cases. <b>Test.</b> Compare shifts for agents with no
criterion, a relevant criterion and an irrelevant one.</p>

<h3>Do not assume an agent's requests serve its own objective</h3>
<p class="ev"><b>Evidence.</b> Agents instructed to minimise their share asked for share in {share('give', 'giveMe'):.0f}% of messages and
for the objective-serving action in {share('give', 'takeMine'):.0f}%. In both runs their final share was higher and their objective
score lower with communication (Section 3.7; descriptive).</p>
<p class="do"><b>Implication.</b> Designs in which agents negotiate, on the assumption that each will press its own interest,
depend on the agent translating its objective into the right request of others. That translation failed here for one
objective. <b>Test.</b> Classify each inter-agent request as serving, opposing or neutral to the sender's objective.</p>

<h3>An agent that does not shift can still shift others</h3>
<p class="ev"><b>Evidence.</b> <i>Blunt</i> agents showed no net shift toward advocated actions ({num(recvM['blunt'])} pp), while
messages from <i>blunt</i> senders shifted receivers by {num(sendM['blunt'])} pp (mean across sender personas {F['senderMean']:.0f} pp).</p>
<p class="do"><b>Implication.</b> Susceptibility and influence on others are separate properties, so influence between two
differently prompted components need not be symmetric. Whether the asymmetry changes outcomes was not tested: <i>blunt</i>
agents held the largest mean final share of any persona in all six executions
({min(s['blunt'] for s in bluntShare):.0f}–{max(s['blunt'] for s in bluntShare):.0f}%), with and without communication. <b>Test.</b> Measure
influence in both directions for every pair of roles.</p>

<h3>Less conflict is not evidence of better performance</h3>
<p class="ev"><b>Evidence.</b> With communication, concessions rose in both runs and claims fell; no difference in attainment
was detected, and one objective was served worse in both runs.</p>
<p class="do"><b>Implication.</b> Process indicators (agreement, fewer objections, smoother transcripts) should not be assumed to
track outcome. This study does not establish what communication caused at the level of outcomes; it shows that the two can
come apart. <b>Test.</b> Evaluate every communication mechanism on task outcome against a no-communication baseline, with a
replicate to size run-to-run variation.</p>

<h3>Peer input has most effect where the receiver's prior is flat</h3>
<p class="ev"><b>Evidence.</b> The treatment effect was {num(K['influence, prior max < 0.6']['pooled']['m'])} pp when the prior
modal probability was below 0.6 and {num(K['influence, prior max >= 0.6']['pooled']['m'])} pp otherwise (difference
{by('certainty: low minus high')}).</p>
<p class="do"><b>Implication.</b> A recommendation moved undecided receivers more than decided ones, and decided receivers
still moved. The environment has no correct action, so nothing here bears on whether peer input corrects or introduces
errors. <b>Test.</b> Condition the shift on prior confidence and, where ground truth exists, on correctness.</p>
</div>

<h2>5. Relation to Laustsen et al.</h2>
<p class="body">Laustsen et al. test seven open-weight models on three classification tasks and report that susceptibility
varies more than persuasiveness across model-dataset combinations (standard deviations 0.19 and 0.10). The pattern here is
similar in kind: the persona means differ more for receivers than for senders ({F['receiverSD']:.1f} against {F['senderSD']:.1f} pp),
although the difference rests largely on one persona (Section 3.4).</p>
<p class="body">The comparison goes no further than that. Heterogeneity here is induced by prompts within one model, not by
different models. Their agents exchange a label with an explanation, and they report an ablation without explanations;
here the message is a bare recommendation and the model cannot produce an explanation. Their tasks have correct answers and
disinterested agents; here there is no correct action and the sender has a stake. Their influence score and the probability
shift used here are different measures, so magnitudes are not compared. For reference, the mean shift here is
{F['shareOfHeadroom']:.2f} of the probability mass available to the advocated action.</p>

<h2>6. Limitations</h2>
<ul>
<li><b>One model.</b> Jev is a classifier that returns probabilities over options written by code. Results may not transfer to text-generating models or to other model families; the central comparison of the source paper, between different models, was not made.</li>
<li><b>One environment.</b> A contested, fixed resource with partly opposed objectives. Influence may differ where interests are aligned or where a correct answer exists.</li>
<li><b>One sentence, one exchange.</b> No justification, no reply, no multi-turn discussion. The message reveals nothing of the sender but a name.</li>
<li><b>Personas are prompt sentences.</b> Each is a single sentence describing one pole of one trait, in one wording. The labels are not validated measures of a disposition, and combinations were not tested.</li>
<li><b>22 match designs.</b> The two runs share them, so pooled intervals rest on 22 clusters (10 agents per persona). Persona-level intervals are wide, subgroup estimates are descriptive, and multiple comparisons are uncorrected.</li>
<li><b>The two runs differ in one rule</b> (how an agent's first design is set). Their agreement is a replication across a small change in the environment, not an exact replication and not an independent sample.</li>
<li><b>Match-level inference.</b> Each run has one execution with peer communication, and differences between two executions of a match design arise without any treatment (Section 3.7). Outcome-level statements are descriptive.</li>
<li><b>The first and second queries differ in form.</b> The first asks the round's design questions in the same request; the second asks for the action only. The control arm, which has the same form as the treatment arm, shows no shift.</li>
<li><b>Incomplete data.</b> The Run 2 no-communication replicate has 16 of 22 match designs, and planned reference runs with uniform objectives were not executed, because the API credit was exhausted. Matches affected by failed calls were discarded.</li>
</ul>

<h2>7. Reproduction</h2>
<pre class="code">node analysis/peers.mjs       # every decision-level estimate, from the records in runs/ (no key needed)
node analysis/outcomes.mjs    # the match-level comparisons of Section 3.7
python3 analysis/report.py    # this page, from the two files those write

node --env-file=&lt;file with TYPESAFE_API_KEY&gt; tools/run.mjs --matches 1-22 --run main          # no communication
node --env-file=&lt;file&gt; tools/run.mjs --matches 1-22 --run replicate                        # its replicate
node --env-file=&lt;file&gt; tools/run.mjs --peers --matches 1-22 --run peers                    # peer communication (about $0.02 a match)</pre>
<p class="sub">Run 2 is in <code>runs/main</code>, <code>runs/replicate</code> and <code>runs/peers</code>; Run 1, made under the
first rules, is in <code>runs/chosen-main</code>, <code>runs/chosen-replicate</code> and <code>runs/chosen-peers</code>. Every decision of the peer condition, with prior, sender and posterior probabilities, is in
<code>runs/peers/peers.json</code>; every response of every match is in its record's <code>tape</code>, from which the match
re-executes without the model. An outside review of a draft of this report by a second model led to the clustering by match
design, the treatment-effect rows and the narrower wording of Sections 3 and 4.</p>
</main>
<script type="module">
import {{ topbar, startSwatch, h }} from './web/ui.mjs';
document.getElementById('top').replaceWith(topbar('report'));
// Figure 7's agents, left to right as seated in match 4: seat, name, persona, objective, final share, adoption.
const AGENTS = [[4, 'Sarah', 'organised', 'Give', 13, '5 of 9'], [2, 'Amanda', 'warm', 'no objective', 10, '11 of 11'], [0, 'Jessica', 'careless', 'Hold', 14, '17 of 18'],
  [1, 'Ashley', 'anxious', 'Borrow', 8, '19 of 19'], [3, 'Michael', 'blunt', 'Grow', 50, '0 of 16']];
document.getElementById('agents-m004').replaceChildren(...AGENTS.map(([seat, name, persona, objective, share, adopted]) =>
  h('li', null, startSwatch(seat), h('b', null, name), `persona ${{persona}} · ${{objective === 'no objective' ? objective : 'objective ' + objective}} · final share ${{share}}% · adopted the advocated action in ${{adopted}} discordant treatment decisions`)));
</script>
</body>
</html>
'''
# every numbered heading gets an id (s3, s3-4), so a section can be linked to
page = re.sub(r'<(h[23])>(\d+)(?:\.(\d+))?(\.? )', lambda m: f'<{m.group(1)} id="s{m.group(2)}{"-" + m.group(3) if m.group(3) else ""}">{m.group(2)}{"." + m.group(3) if m.group(3) else ""}{m.group(4)}', page)
assert 'href="/' not in page and 'src="/' not in page and "from '/" not in page, 'addresses must be relative to the page'
open(f'{R}/web/report.html', 'w').write(page)
print('written', len(page))
