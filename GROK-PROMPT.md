You are building a complete project called **five-in-a-fly**: a static web app where a fruit-fly mushroom-body network, wired like the FlyWire connectome, learns to play gomoku (five in a row) and plays against the visitor. The fly is rendered in 3D on the board, places stones with a front leg, and its brain activity is displayed live while it thinks.

Read this entire brief before writing any code. Build in the milestone order at the end. Do not skip ahead.

## 1. Hard constraints

- **Fully static.** Deploys to GitHub Pages. No backend, no database, no runtime API calls. Everything ships as files.
- **Initial load under 2 MB** including all assets. GitHub Pages has a 100 GB/month bandwidth soft cap.
- **No `SharedArrayBuffer`, no multithreaded WASM.** GitHub Pages cannot send COOP/COEP headers. Single-threaded only. Do not add `coi-serviceworker`.
- **No Git LFS.** GitHub Pages does not resolve LFS pointers.
- **Relative paths everywhere.** Served from `username.github.io/five-in-a-fly/`, not a domain root. Never write `/assets/...`.
- Include an empty `.nojekyll` file at the publish root.
- `npx serve .` at the repo root must produce a working site with no build step. A bundler may be used for the offline trainer only.
- All brain simulation runs in a Web Worker. Never block the main thread.
- Target 60 fps on a 2020-era phone. Mobile-first.
- Zero npm dependencies for the trainer. Node built-ins only.

## 2. The core architecture — read carefully, this is the part that gets built wrong

The mushroom body is not a policy network. It is a sparse random expansion feeding a shallow linear readout — biologically it maps an odour onto an approach/avoid valence. **A 225-way "choose a square" output does not fit this architecture and will not train. Do not build one.** If you find yourself designing a move classifier, stop and re-read this section.

**The fly does not choose a move. The fly sniffs every empty square and says how good it smells. We take the best-smelling square.**

This is the actual function of the real circuit, and it buys three things: translation invariance (a live three is the same pattern anywhere on the board), a tiny output space, and a board-size-independent input.

### Input encoding

For one candidate empty square:

- Take the **9×9 window centred on it**. Radius 4 covers the entire region that can affect a five-in-a-row through that point.
- Two planes: `my stones`, `opponent stones`. 81 × 2 = 162 binary cells.
- **Off-board cells are encoded as a distinct third state, not as empty.** The edge is real information in gomoku.
- Assign **4 projection neurons per cell** → 648 PNs, leaving headroom inside the real PN population of 685. Off-board cells get their own dedicated PN subset.
- Active cells drive their PNs with Poisson input up to 270 Hz; inactive cells sit at a ~20 Hz background rate.

### Expansion

Random sparse projection from 648 PNs to **5177 Kenyon cells**, approximately **7 PN inputs per KC**, drawn once from a seeded RNG so it is reproducible. Tune the KC firing threshold so **5–10% of KCs fire** on a typical input. This sparsity is the single most important hyperparameter — check it every run.

### Readout

**96 MBONs dealt into 4 compartments of 24**, one compartment per valence class:

| Class | Meaning |
|---|---|
| `WIN` | playing here makes five |
| `BLOCK` | opponent plays here and makes five, or an open four |
| `GOOD` | builds or blocks a three or four; a genuinely useful shape |
| `NEUTRAL` | everything else |

Following the biology, **the answer is the compartment whose MBONs are driven *least*** — learning depresses KC→MBON synapses for the correct class, so low drive means "this pattern has been associated with this valence."

Balance KC→MBON fan-in across the four compartments so no class starts with an advantage.

### Move selection

1. Enumerate empty squares, optionally only those within radius 2 of an existing stone (speed optimisation; note it in the UI).
2. Run the brain once per candidate. Record per-class drive.
3. Score: `WIN` ≫ `BLOCK` ≫ `GOOD` ≫ `NEUTRAL`, weighted by margin of confidence.
4. Play the argmax. Ties broken by proximity to board centre.

Illegal moves are structurally impossible — only empty squares are ever candidates.

## 3. Learning rule

Dopamine-gated plasticity on KC→MBON synapses. **This is added by us; it is not in the published Shiu et al. model.** Say so in the README and on the page.

- The fly answers first. A correct answer changes nothing.
- On a wrong answer, hold the stimulus and deliver 300 ms of dopamine:
  - **Correct class's compartment**: normal dopamine → synapses from currently-firing KCs are **depressed** (Hige et al. 2015).
  - **The class the fly wrongly picked**: reversed timing → the same synapses are **potentiated** (Handler et al. 2019: dopamine before odour gives potentiation).
- Clamp weights to `[0, w_max]`. Log the fraction of saturated synapses; above ~5% means the learning rate is too high.

### Teacher

A rule-based gomoku evaluator — threat-space search is plenty, roughly 200 lines — labels every empty square of a generated position with one of the four classes. Positions come from teacher self-play with random exploration noise, random openings, and **all 8 dihedral symmetries of every position** for free 8× augmentation.

Use **supervised imitation of the teacher. Do not attempt self-play reinforcement learning.** The plasticity rule is an immediate right/wrong signal with no credit assignment across a game; RL noise will swamp it.

## 4. File layout

```
five-in-a-fly/
├── index.html            # the whole app, one page
├── .nojekyll
├── app/
│   ├── board.js          # gomoku rules, win detection, move history
│   ├── encode.js         # board + candidate square → PN drive vector
│   ├── worker.js         # owns the brain, answers "score these candidates"
│   ├── view-board.js     # board rendering, heatmap overlay, input
│   ├── view-brain.js     # KC raster, compartment bars, spike timeline
│   └── view-fly.js       # three.js fly, IK stone placement
├── brain/
│   ├── brain.c           # LIF core → WASM  (milestone 3)
│   ├── brain.wasm
│   ├── brain.js          # JS wrapper, same API as the JS reference impl
│   └── connectome.bin.gz # PN→KC sparse edge list, mushroom body only
├── weights/
│   ├── kc2mbon.i8.gz     # trained readout, int8 quantised
│   └── meta.json         # scale factors, training stats, version
├── trainer/
│   ├── teacher.js        # rule-based gomoku evaluator
│   ├── generate.js       # position generator + symmetry augmentation
│   ├── brain-ref.js      # pure-JS reference brain (milestone 1)
│   ├── train.js          # offline training loop, Node, no deps
│   └── verify.js         # prints the metrics below
└── .github/workflows/pages.yml
```

### Data budget

Ship only the mushroom body, not the 139k-neuron whole brain. PN→KC sparse edges: a few hundred KB gzipped. KC→MBON weights, 5177 × 96 int8 plus per-column scales: about 500 KB. KC soma positions for the raster, 2D projection, int16: about 20 KB.

Decompress in the browser with `DecompressionStream('gzip')` — GitHub Pages cannot set `Content-Encoding`, so gzip must be handled client-side. Cache decoded blobs in Cache Storage keyed by `meta.json.version`; Pages' cache headers are short and not configurable.

## 5. What the visitor sees

Single page, no routing. Stacked on mobile, two columns on desktop.

**The board.** 15×15, visitor moves first, standard gomoku, no forbidden-move rules.

**The heatmap — the single most important visual.** When it is the fly's turn, overlay every empty square with its valence score: a warm glow for squares the fly finds urgent, nothing for neutral ones. Animate it in as the fly evaluates. The moment the visitor completes an open three and watches one square ignite, they understand the entire project. **Do not bury this behind a toggle.** Let the visitor hover (long-press on mobile) any square to see its four class drives as bars.

**The fly.** A 3D fly on the board, three.js. Idle: grooming, small steps, occasional wing flick. Thinking: walks over the board as it evaluates, antennae active. Deciding: walks to the chosen square and places a stone with a front leg via inverse kinematics. On winning: feeds from a drop of sugar. On losing: a brief grooming sulk, then reset. Body geometry modelled on NeuroMechFly v2 (flygym, Apache-2.0). flygym has no flight animation — hand-animate any flying.

**The brain panel.** Three linked views driven by the same worker messages:

1. **KC raster** — 5177 dots at KC soma positions. Firing KCs light up. Show live sparsity ("312 of 5177 firing").
2. **Compartment bars** — the four classes; bar length is how much *less* drive that compartment receives relative to baseline. Lowest bar wins. Label the winner.
3. **Spike timeline** — PN / KC / MBON population traces over the ~400 ms evaluation, scrolling at roughly 1/3 real speed, one tick = 25 ms.

Draggable floating window on desktop, collapsible section on mobile.

**Explanation section**, below the fold, plain language, with the honest limits stated: what the mushroom body is and why sniffing squares is the right framing; the learning rule with both citations; and this, plainly — **it has no search and no working memory, it is purely reactive, it knows what a live three looks like but cannot read three moves ahead, it will beat a beginner and lose to anyone playing seriously.** The honesty is part of the appeal; overselling it will get the project picked apart. Also note that only the mushroom body is simulated and that training used a rule-based teacher, not human games.

## 6. Visual design

Aim for the aesthetic of a well-made scientific instrument, not a SaaS landing page.

- **Dark by default.** Near-black background, one warm accent (amber/orange) for activity and heat, one cool accent (cyan) for structure. Neural activity should be the only genuinely bright thing on the page.
- **Restraint.** No gradient hero, no glassmorphism, no floating blurred blobs, no emoji as section headers, no drop shadows on everything.
- Real typography. A grotesque for UI, tabular monospace numerals for every live figure. Numbers must not jitter as they update.
- Motion is meaningful only. Things move because the fly moved or a neuron fired. Nothing decorative animates on scroll.
- The board is the one bright surface: warm wood or bone, dark stones, high contrast.
- Respect `prefers-reduced-motion`: keep the heatmap and numbers, drop camera work and walking animation.
- Fully playable one-handed on a 380 px viewport with the brain panel collapsed.

## 7. Milestones — build in this order

**M1 — Prove the representation works. No WASM, no connectome, no 3D, no UI.**
Plain JS in `trainer/`: random sparse PN→KC projection, rate-coded KCs (no LIF yet), the four-class readout, the plasticity rule, the teacher, the generator. `node trainer/verify.js` must print **exactly these six lines and nothing else**:

```
held-out WIN accuracy: __%
held-out BLOCK accuracy: __%
open-four blocks missed out of 1000: __
KC sparsity (mean % firing): __%
saturated synapses: __%
samples trained: __
```

**Pass criteria: WIN and BLOCK both ≥95%, open-four blocks missed = 0, KC sparsity between 5% and 10%, saturated synapses under 5%.** If a number misses, diagnose and fix it yourself, then re-run and re-print. **Do not proceed to M2 until all six pass** — if this fails, nothing downstream matters.

**M2 — Playable web version.** Board UI, heatmap, worker, the M1 brain. Fully playable and deployed to Pages. This is already a shippable project.

**M3 — Real biology.** Swap in a FlyWire-derived PN→KC subgraph and a LIF core compiled to WASM (C via Zig's bundled clang; reference: philshiu/Drosophila_brain_model, Shiu et al., *Nature* 2024, MIT). Write a determinism test asserting the WASM core is spike-for-spike identical to the JS reference with plasticity off. **Report how much accuracy dropped versus M1 in the README** — that delta is the scientifically interesting number.

**M4 — The fly and the brain panel.** three.js, IK stone placement, KC raster, compartment bars, spike timeline.

**M5 — Optional: continuous training via GitHub Actions.** Public repo, standard runners, free and unlimited. A single job caps at 6 hours, so use a cron-triggered relay: pull previous weights, train ~5.5 hours with a self-imposed timeout, push to an orphan `state` branch force-pushed to a single commit. Note that pushes made with the default `GITHUB_TOKEN` do not trigger further workflows — use `schedule`, never self-triggering. A matrix of parallel seeds with weight averaging at the end works well for this readout. Surface cumulative game count and win rate on the page.

## 8. Licensing — get this right from the first commit

Our own code: MIT. Everything else keeps its own licence, credited in the README and in a visible section of the page:

- Brain model: philshiu/Drosophila_brain_model (Shiu et al., *Nature* 2024) — MIT
- Connectome: FlyWire v783 (Dorkenwald, Matsliah et al. 2024) — CC-BY 4.0
- Cell-type annotations: Schlegel et al. 2024 — CC-BY 4.0
- Fly body: NeuroMechFly v2 / flygym — Apache-2.0
- three.js — MIT

## 9. Do not

- Do not build a 225-way move classifier.
- Do not use self-play RL.
- Do not add a backend, an analytics script, or a cookie banner.
- Do not use `SharedArrayBuffer`, Git LFS, or absolute paths.
- Do not ship the whole-brain connectome.
- Do not claim the fly is intelligent, conscious, thinking, or playing "like a human". Describe the mechanism and let it be impressive on its own terms.
- Do not skip M1.

**Start now with M1 only. Implement `trainer/teacher.js`, `trainer/generate.js`, `trainer/brain-ref.js`, `trainer/train.js`, `trainer/verify.js`. Print the six lines when done, and stop there for my review.**
