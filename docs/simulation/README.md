# First agents

Implements Brief 3 on `stage-2`: a deterministic body simulation, with scripted behaviour. No AI calls, chemistry or construction are present.

## Run and observe

`npm run dev` opens the existing island app. The default cohort is 20 founding young adults. Select Pause, 1×, 10× or 100× in the bottom HUD. One fixed tick is one simulated second; a default generation interval is 1,800 ticks, so it lasts 30 minutes at 1×. The worker starts advancing after initial entry. After that, rendering, camera movement, tab visibility and renderer recovery do not control simulation progression. The worker catches up delayed scheduling in bounded batches without dropping fixed ticks. Pause is explicit and logged.

Click a figure or choose it from **Inspect an agent**. Its panel shows needs, traits, lineage, age, parents and activity. **Follow agent** and **Island view** affect only the camera. Families have consistent torso colours; small overhead dots indicate activity. Trees and terrain can occlude bodies. Follow or orbit/zoom to see individuals closely.

**Dials** exposes generation seconds, food regrowth, mutation rate and starting population. Apply updates the running world and records an intervention; starting population requires **New run**. New-run dials are retained in the URL. `populationCap` is a headless/core dial, default 200, with an absolute accepted ceiling of 1,000; renderer allocation matches that ceiling.

## Ownership and replay

- `src/sim/core.ts`, `bodies.ts`, `navigation.ts` and `random.ts`: plain state and fixed steps. No DOM, wall-clock reads or unseeded randomness. Terrain is generated from the seed; a simulation-owned PRNG supplies ecology, behaviour, inheritance and mutations.
- `worker.ts`: wall-clock scheduling and structured-clone messages. Simulation code never consumes those wall-clock timestamps.
- `client.ts`: worker transport. The renderer receives detached snapshots; `render/snapshots.ts` smooths positions by stable ID, with a one-snapshot delay and no extrapolation. Pause snaps to the authoritative stopped position.
- `render/agents.ts`: shared instanced primitives. Five mesh groups cover up to 1,000 figures; active instances follow the living count. Selection, animation and camera state cannot write into the simulation.

**Export run** saves version, seed, initial dials, exact tick count and the complete append-only event log. Births include founders; `offspring = births − startingPopulation`. Each event has `seq`, fixed `tick`, `type` and plain `data`. Events cover birth, reproduction, death with cause, generation milestones, and speed/dial interventions. Parent and family IDs persist in birth events after bodies die.

Replay from the same source version:

```sh
npm run eval:simulation -- --replay /path/to/exported-run.json
```

The runner loads the same TypeScript modules headlessly through installed Vite. It rebuilds the seed/dials, applies interventions at their original ticks, and checks every regenerated event. A divergent or edited event log fails instead of being silently accepted. Camera/selection changes are absent from run logs. This stage does not include a browser timeline or a saved-run import UI.

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
# Headless checks only:
npm run eval:simulation
```

The normal tests and eval run the same simulation checks:

1. SHA-256 event hashes match across repeated runs and different stepping batches; a different seed differs. Replay reproduces snapshots and continues identically beyond the replay boundary.
2. Five public seeds (1, 7, 42, 99, 2026), default dials, 5,400 ticks. At least four must retain two living agents after three generation intervals. Every birth/death event is checked against the cap; population, births and deaths by cause are sampled every 300 ticks.
3. 200 bodies for 10,000 ticks within 5,000 ms, including initialization. Benchmark generation length is 86,400 seconds so all 200 remain alive throughout; the benchmark cannot pass by losing most of its workload. Actual timings are reported. This measures that persistent workload, not every possible dial combination.

The browser build eval retains its startup, pixel, error and repeated-load checks in auto and forced WebGL2, and now requires a nonzero rendered-agent count. Screenshots are also inspected manually per AGENTS.md; the count check alone cannot establish visual readability. Software browser FPS is reported, not treated as physical GPU performance.
