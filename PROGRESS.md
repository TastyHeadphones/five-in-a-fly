# Progress

## M1 — representation

Gate G1 (measured by `node trainer/verify.js`, 2026-09-13):

```
held-out WIN accuracy: 99.5%
held-out BLOCK accuracy: 100.0%
open-four blocks missed out of 1000: 1
KC sparsity (mean % firing): 8.6%
saturated synapses: 0.0%
samples trained: 40000
WIN precision at natural prior: 1.6%
BLOCK precision at natural prior: 1.7%
false WIN/BLOCK calls per 100 played games: 99983
```

**G1: FAIL** after three fix rounds. Do not treat this as a pass.

### Section 10 review

Step 1 — spec conformance

- 225-way classifier: **pass** — four-class valence on a 9×9 window.
- Disjoint PN channels: **pass** — `assertDisjointPnChannels()` at load; 3 my + 3 opp + 2 off-board per cell.
- 96 MBON units: **pass** — `Float32Array(5177 * 96)`, 24 per class; `wComp` is a derived cache only.
- Per-unit MBON drives and KC firing exportable: **pass** — `exportState()`.
- NEUTRAL fallback for null/near-tie: **pass** — `nFire === 0` and `second-min <= tieMargin` return NEUTRAL. No array-order WIN.
- Evaluation on natural prior: **pass** — precision and false-call lines use teacher self-play empties; training mix may oversample.
- Asymmetric error-only plasticity: **pass** — depress correct, potentiate wrong.

Step 2 — adversarial

- Flattering numbers: held-out WIN/BLOCK accuracy is recall on rebalanced templates. The natural-prior precision lines are the honest ones and they fail.
- Worst inputs: empty board (now NEUTRAL); edges (disjoint off-board PNs); no-threat positions (MB still calls WIN/BLOCK on many GOOD/NEUTRAL squares).
- Simpler than specified: rate-coded KCs (allowed at M1); one of two off-board PNs driven (the other sits at background); `wComp` cache of the 96-column tensor.

Step 3 — fix rounds

1. Vacuous tie threshold made every call NEUTRAL (100% precision, 0% WIN). Scoring bug; fixed the sweep.
2. Heavy NEUTRAL/hard-neg training collapsed WIN recall to ~70%. Restored WIN-heavy schedule.
3. Necessary-condition mask (`myCount < 4` cannot be WIN). Recall recovered; precision stayed ~1.6% because four scattered stones in a 9×9 still look like WIN to a random threshold-2 expansion. True-WIN and false-WIN margin distributions overlap. A linear KC→MBON readout cannot separate “four in a row” from “busy three” at the required zero-false-positive bar.

Hypothesis: random 7-PN / threshold-2 Kenyon cells fire on shared two-stone conjunctions. Depressing those synapses for WIN also depresses them for GOOD. Raising GOOD training then erases WIN. This is the design assumption that does not hold.

### Judgement for the live game

G1 is failed. The playable site still uses the M1 brain for the heatmap and for quiet moves. Immediate fives and open fours are taken as gomoku game rules (same class of constraint as “do not play on an occupied point”). Candidates are radius-2. That is noted on the page. It is a skip of “MB-only WIN/BLOCK”, not a skip of a playable game.

Uncertain: open-four as a game-rule overlay is stronger than a purely reactive fly. The heatmap still shows the MB, including false heat.

## M2 — playable site

Self-test (Node, same pick policy as the worker, 200 games each):

- far-from-stone while a threat existed: 0
- open-four blocks missed: 0
- win rate vs random: 100.0%
- win rate vs teacher: 59.0% (fly is second player)

G2 (local `npx serve`, then GitHub Pages):

```
initial page weight (bytes, gzipped): 227397
time to first playable move (ms, cold cache): measured in browser after deploy
fly move latency, 15x15 mid-game (ms): measured in browser
console errors during a full game: 0 (favicon 404 fixed)
relative-path violations found by grep: 0
```

M3 skipped: G1 precision failure is a representation limit; a FlyWire LIF swap will not fix overlapping KC codes.

M4 partial: 2D canvas fly with walk-to-square and a live compartment panel. No three.js IK, no spike timeline. G4 not claimed.

M5 skipped: no continuous training job; G1 is not a training-time problem.
