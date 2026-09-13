# five-in-a-fly

A fruit-fly mushroom-body network that sniffs gomoku (five in a row) and plays against a visitor.

The mushroom body is not a policy network. For each empty square it is shown a 9×9 window and reports a valence — WIN, BLOCK, GOOD, or NEUTRAL. We take the best-smelling square. It has no search and no working memory. Training imitated a rule-based teacher, not human games.

The dopamine-gated plasticity rule on Kenyon-cell → MBON synapses is **added by us; it is not in the published Shiu et al. model** (Hige et al. 2015; Handler et al. 2019).

## Run

No build step.

```
npx serve .
```

Then open the printed URL. `node trainer/verify.js` prints the M1 gate. `node trainer/selftest.js` plays 200 games.

## Gate status

**G1 did not pass.** Held-out WIN/BLOCK recall is high; precision at the natural prior is not. The live game therefore takes immediate fives and open fours as gomoku rules, uses radius-2 candidates, and lets the mushroom body rank the rest. Details in `PROGRESS.md`.

## Licence

Our code is MIT. Other work, kept under its own licence:

- Brain model: [philshiu/Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model) (Shiu et al., *Nature* 2024) — MIT
- Connectome: FlyWire v783 (Dorkenwald, Matsliah et al. 2024) — CC-BY 4.0
- Cell-type annotations: Schlegel et al. 2024 — CC-BY 4.0
- Fly body: NeuroMechFly v2 / flygym — Apache-2.0
- three.js — MIT
