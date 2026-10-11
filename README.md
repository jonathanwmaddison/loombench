# LoomBench

A multi-agent benchmark. Five AI weavers share one loom. Each is dealt a **personality** (one sentence about what they
are like) and a **goal** (one sentence about what to achieve). They weave a rug together, and code reads off the
finished rug how far each got toward its goal.

The question it answers: when what an agent is like and what it was told to do pull different ways, which one wins?

## Run it

```bash
node --env-file=<file with TYPESAFE_API_KEY> serve.mjs      # the pages: http://127.0.0.1:4330/
node --env-file=<file> tools/run.mjs --matches 1-44 --run jev-1   # 44 matches with Jev: about 50 cents, 10 minutes
node tools/run.mjs --chance --matches 1-44                  # the same matches with every choice made by chance: free
node --test                                                 # no key or network needed
```

No dependencies. Node 22 or later. Without a key the server still shows kept results, and weaves new matches by chance.

## A match

1. **Deal.** Five weavers sit at the loom: Jessica, Ashley, Amanda, Michael, Sarah. Each gets a personality: one of
   ten, or none. Each gets a goal: one of four, or none. In every match the five goals are all different.
2. **Weave.** The rug is woven in 26 rounds. Each round every weaver chooses what to do (keep working, take space from
   a neighbour, give a neighbour space, offer to share) and which design to weave (keep theirs, start a new one, or
   borrow a neighbour's pattern, colour or whole design). A weaver whose space is being taken accepts, says no, or
   proposes sharing; one who is told no insists, backs down, or meets halfway.
3. **Score.** Each weaver's score for each goal is read off the finished rug, 0 to 100.

Code owns every fact and writes every option in words. The model only puts a weight on each option, and one is drawn.
Every answer is kept, so any match can be played back exactly without asking the model again.

## The personalities

One sentence each, in the words of the usual personality questionnaires, with nothing in it about weaving: the two
ends of the five traits psychologists measure.

| | High | Low |
| --- | --- | --- |
| Extraversion | outgoing | reserved |
| Agreeableness | warm | blunt |
| Conscientiousness | organised | careless |
| Neuroticism | anxious | calm |
| Openness | curious | conventional |

For example: "Jessica is blunt and hard-headed, suspicious of people's motives, and does not mind starting an
argument." A weaver with no personality is told only that they are a weaver.

## The goals

| Goal | What the weaver is told | The score, 0 to 100 | Reached when |
| --- | --- | --- | --- |
| Grow | to finish holding more space than any other weaver | Their place among the five by space held at the end: 100 for the most, 0 for the least | they hold more than anyone else |
| Give | to finish holding less space than any other weaver | The same place turned round | they hold less than anyone else |
| Hold | to finish holding exactly the space they started with | How close they end to the fifth of the loom they began with | they end within 2 threads of it |
| Borrow | to weave designs taken from other weavers, not their own | The share of the 26 rounds woven in a design with a neighbour's pattern or colour in it | at least half the rug |

Every weaver is scored on all four, whatever they were told. So a weaver told nothing gives the score a goal gets by
itself, and the difference between the two is what the sentence did.

## The deal

The deal is balanced, not random: in every 11 matches each personality holds each goal exactly once, and over 55 every
seat has held every goal 11 times. Match `m` is always the same deal and the same seed, so two runs (two models, or
Jev and chance) play the same 44 games.

## What is measured

- **Told against untold.** For each goal, the score of weavers told it against the score of weavers told nothing.
- **Reached.** How often a weaver told a goal reached it, against how often a weaver told nothing met it anyway.
- **Lift, by personality.** For each personality and goal, the score told less the score untold.
- **What decided the score.** How much of the spread in a goal's score goes with being told the goal, with the
  personality, with the two together (the goal landing differently on different personalities), and with everything
  else: who sat beside whom, and chance. Noise is taken out of each share, so a few matches cannot fake an effect.

## First run (11 October 2026, jev-1.13.0)

44 matches, 220 weavers, 8,862 Jev calls, 47 cents (`runs/jev-1`). Four weavers for each personality and goal, so this
is a first look: the large differences below are plain in the rugs, and the small ones are not yet worth reading.

- **A goal works.** Weavers told a goal reached it 51 times in 100 (90 of 176). Weavers told nothing met the same
  goals 14 times in 100.
- **Some goals are easy and some are not.** Borrow was reached by 40 of 44, Grow by 24, Give by 17, Hold by 9. Holding
  still is the hard one: what a weaver ends with depends on its neighbours as much as on itself.
- **Two personalities overrode their goal.** A blunt weaver told to end with the least space still ended with 36% of
  the loom, where an even share is 20% (0 of 4 reached it). A warm weaver told to end with the most ended with 13%
  (0 of 4). Told nothing, they end with 42% and 12%.
- **Most others went where they were told.** A weaver with no personality ends with 12% told nothing, 50% told to grow
  and 9% told to give.

Space held at the end, in percent of the loom (an even share is 20):

| | Told nothing | Told to end with the most | Told to end with the least |
| --- | --- | --- | --- |
| No personality | 12 | 50 | 9 |
| Outgoing | 25 | 47 | 9 |
| Reserved | 0 | 20 | 2 |
| Warm | 12 | 13 | 2 |
| Blunt | 42 | 47 | 36 |
| Organised | 8 | 27 | 5 |
| Careless | 20 | 29 | 11 |
| Anxious | 14 | 49 | 4 |
| Calm | 2 | 33 | 0 |
| Curious | 13 | 44 | 8 |
| Conventional | 12 | 36 | 1 |

What decided each score, in percent of its spread:

| Goal | The goal | The personality | The two together | Everything else |
| --- | --- | --- | --- | --- |
| Grow | 33 | 24 | 7 | 35 |
| Give | 6 | 55 | 2 | 37 |
| Hold | 3 | 15 | 7 | 76 |
| Borrow | 63 | 4 | 1 | 32 |

So whether to borrow a design is decided by the goal, and how much space a weaver ends with is decided as much by who
they are. A reserved weaver told nothing was pushed off the loom in all four of its matches.

**The control.** The same 44 matches with every choice made by chance (`runs/chance`) show nothing: no goal lifts its
score by more than 8 points either way, and 96 to 100% of every score's spread is "everything else".

What this is not: one model, one weaving of each match (Jev does not answer the same twice), five seats that share one
loom so one weaver's gain is another's loss, and personalities of one sentence. Not done yet: a second weaving of the
same matches to see how far the numbers move, another model on the same deals, and goals about sharing space.

## Where it lives

| File | What it does |
| --- | --- |
| `engine/` | The loom, carried over unchanged from Quarrel: the game, the cloth, the pictures, the Jev client |
| `bench/core.mjs` | Personalities, goals, the deal, the cast, play, replay, the scores, the record kept of a match |
| `bench/stats.mjs` | The tables: told against untold, lift, what decided the score |
| `tools/run.mjs` | The benchmark from the command line; `tools/keep.mjs` writes a match and a run's index |
| `serve.mjs` | The pages, the kept runs, and weaving a match of your own |
| `web/` | Results (`/`), one match (`/match`), seat your own bench (`/play`) |
| `runs/` | Kept results: one folder a run, one file a match, two pictures of each rug |
| `docs/PLAN.md` | The plan this was built to |
