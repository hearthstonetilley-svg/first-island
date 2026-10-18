# First agents

Current checkpoint: revised **3a**, iteration 034. Existing body/figure code from 030–033 stays working, but Round 12 rejected its long-run viability: all five seeds eventually go extinct. The earlier 5,400-tick observation is insufficient. No reproduction threshold or dial has been changed in this checkpoint. The next bodies work must start with the reviewer's reproduction-condition table before any tuning. No AI calls, chemistry or construction are present.

## Run and observe

Run `npm run dev` and visit the Vite URL to view the existing island app. The default cohort is 20 founding young adults. Select Pause, 1×, 10× or 100× in the bottom HUD. One fixed tick is one simulated second; a default generation interval is 1,800 ticks, so it lasts 30 minutes at 1×. The worker starts advancing after initial entry. After that, rendering, camera movement, tab visibility and renderer recovery do not control simulation progression. The worker catches up delayed scheduling in bounded batches without dropping fixed ticks. Pause and speed are scheduler controls, excluded from world state and the event log.

Click a figure or choose it from **Inspect an agent**. Its panel shows needs, traits, lineage, age, parents and activity. **Follow agent** and **Island view** affect only the camera. Families have consistent torso colours; small overhead dots indicate activity. Trees and terrain can occlude bodies. Follow or orbit/zoom to see individuals closely.

**Dials** exposes generation seconds, food regrowth, mutation rate and starting population. Apply updates the running world and records an intervention; starting population requires **New run**. New-run dials are retained in the URL. `populationCap` is a headless/core dial, default 200, with an absolute accepted ceiling of 1,000; renderer allocation matches that ceiling.

## Ownership and replay

- `src/sim/core.ts`, `bodies.ts`, `navigation.ts` and `random.ts`: plain state and fixed steps. No DOM, wall-clock reads or unseeded randomness. Terrain is generated from the seed; a simulation-owned PRNG supplies ecology, behaviour, inheritance and mutations.
- `worker.ts`: wall-clock scheduling and structured-clone messages. Simulation code never consumes those wall-clock timestamps.
- `client.ts`: worker transport. The renderer receives detached snapshots; `render/snapshots.ts` smooths positions by stable ID, with a one-snapshot delay and no extrapolation. Pause snaps to the authoritative stopped position.
- `render/trees.ts`: persistent instanced geometry reads `snapshot.trees` and joins each tree's `foodId` to `snapshot.plants`. Food quantity controls fruit size; depleted or non-nutritious food disappears and regrowth reappears. Tree instances update from subsequent snapshots, including removal, position and kind changes. The renderer no longer reads startup `world.trees`. Nutrition remains a plant property.
- `render/agents.ts`: shared instanced primitives. Five mesh groups cover up to 1,000 figures; active instances follow the living count. Selection, animation and camera state cannot write into the simulation.

**Export run** saves format version 2, seed, initial dials, exact tick count, the append-only event log and a plain final-state verification checkpoint. The checkpoint includes terrain, trees, food, needs, hidden movement/decision/cooldown state, PRNG state, ID allocation and fractional generation progress. It is a comparison oracle, never loaded as replay state. Births include founders; `offspring = births − startingPopulation`. Each event has `seq`, fixed `tick`, `type` and plain `data`. Events cover birth, reproduction, death with cause, generation milestones, and world interventions (currently live dial changes). Each renderer-originated world change goes through this logged command path at the current fixed tick. Init starts one seed/dial run with a tick-zero generation event; a worker rejects reinitialization. Pause, speed, export, selection and camera messages do not change world state or add events. Parent and family IDs persist in birth events after bodies die.

Replay from the same source version:

```sh
npm run eval:simulation -- --replay /path/to/exported-run.json
```

The runner loads the same TypeScript modules headlessly through installed Vite. It rebuilds the seed/dials, applies interventions at their original ticks, and checks every regenerated event **and the complete rebuilt final state**. Fresh Node-process evals independently SHA-256 hash that state and compare it to the live run. A seed-only negative control must differ for the intervened run, and a further 500 ticks must match after replay. A divergent event log or final-state checkpoint fails instead of being silently accepted. Version-1 exports remain historical artifacts and require their original source version. This stage does not include a browser timeline or a saved-run import UI.

## Body model and limits

Bodies have energy, warmth, rest, health and biological age. Trait lifespan is expressed in generation units. Physical rates scale with the generation-length dial, so a shorter generation speeds the biological model rather than merely renumbering the HUD. Founders enter as staggered young adults; offspring grow into maturity. Needs at zero drain health, and zero health emits a death with starvation, exposure, old age or exhaustion. Health can recover when needs are met.

Food plants have quantity, regrowth and nutrition properties. Some sit at existing trees and others in meadows; no item type determines edibility. A walkable graph checks nodes and edge interiors against the heightmap, restricting agents to connected ground. This stage uses the largest connected habitable land component for the founding society. It does not provide swimming, boats or migration between disconnected islets.

Day/night and seeded rain affect warmth. Resting within tree cover reduces cooling. Weather is currently a simulation field; the v0.3 sky/water art stays unchanged. Full rain/wind obstruction physics and constructed cover belong to the later building/exposure stage.

Simple scripted priorities seek food, rest, tree cover, companions or a wandering destination. Curiosity increases roaming radius; sociability increases grouping; healthy nearby adults reproduce probabilistically with cooldowns. Children inherit parental means with bounded seeded mutations. Population is capped at birth admission. This is an initial ecology, not a claim about long-term demographic equilibrium.

## Evals

```sh
npm test
npm run build
npm run eval
# A separate preview port can be used when another checkout is running an eval:
EVAL_PORT=4182 npm run eval
# Revised 3a checkpoint, separate-process determinism and full-state replay:
npm run eval:core
# Includes historical body observations and cost (not Round 12 acceptance):
npm run eval:simulation
```

The new core eval is in `scripts/eval-sim.mjs`, with fresh Node invocations of `scripts/sim-process.mjs`. It is also called by the existing `eval:simulation` / `npm run eval` path. Two comparison runs use different process IDs and batch sizes (1 versus 37), and a third process uses another seed. A fourth process reconstructs the exported run from its seed, initial dials, tick count and logged interventions, verifies the event sequence and full-state checkpoint, compares final SHA-256 hashes, and checks continued execution. It does not initialize from the checkpoint or repeat the live driver's intervention schedule.

Unit tests additionally exercise the actual worker message handler: world changes log once at the current tick; pause, speed, entry gating and reads do not alter the exported world; a second init cannot replace it. Tree rendering tests consume subsequent snapshots to move/remove trees and shrink/remove/regrow fruit, and check actual agents consume the linked tree food.

The previous body eval still reports its original bounded 5,400-tick observations and the 200-body/10,000-tick cost benchmark (5,000 ms budget, generation length 86,400 so all bodies remain alive). Those observations **do not establish viability**. Round 12 requires at least 21,600 ticks, a nonzero population at every sample, a third-generation birth, and final-third population between 0.5× and 1.5× the starting count in four of five seeds. Implementing and passing that stronger body acceptance follows the revised 3a review checkpoint.

`scripts/eval-build.mjs` is unchanged in iteration 034. New simulation checks live in separate scripts. The core capture check independently verifies figures, pause invariance, ticked live dial changes, consumed tree food, and browser-export replay in a fresh Node process. Its screenshots and the owner's build-eval screenshots are inspected manually per AGENTS.md. Software browser FPS is reported, not treated as physical GPU performance.
