# Brief 3: the simulation clock and the first agents (design stages 2a and 2b)

Read docs/design/world-and-agents.md first, especially sections 2, 5.1, 6, 9, 10 and 13. This brief builds bodies
only: no AI minds, no chemistry, no building yet. Work on branch `stage-2`. Commit every iteration per AGENTS.md.

## 3a. Simulation core
- The simulation runs in a Web Worker on a fixed tick, independent of frame rate. The renderer only reads snapshots
  or diffs and smooths between ticks. The simulation code must also run headless in Node (same module, no DOM).
- World state is plain data derived from the seed. All randomness comes from seeded generators owned by the
  simulation; never Math.random, never wall-clock time inside the simulation.
- An append-only **event log** (birth, death with cause, reproduction, generation milestones, interventions).
- **Replay:** seed + dials + event log reproduce a run exactly. Determinism is a hard requirement.
- **Time controls** in the UI: pause, 1x, 10x, 100x. At 1x one generation is about 30 minutes (owner decision 4);
  generation length is a dial.

## 3b. Bodies
- Agents with needs (energy, warmth, rest, health), age, a life cycle (born, grow, reproduce, die) and inherited
  traits (speed, strength, perception range, curiosity, sociability, fertility, lifespan) with small seeded mutations.
- Unmet needs drain health; health at zero is death, logged with its cause (starvation, exposure, old age).
- Food for now: fruiting plants on the island's existing trees and meadows that regrow at a dial rate. Define food by
  a nutrition property on the plant, not by an item type, so stage 2c chemistry can replace it cleanly.
- Warmth: a simple day/night and weather cycle; cold nights and rain drain warmth, resting near trees reduces it
  (the full exposure physics comes in 2d).
- Behaviour is scripted, not AI: seek food when hungry, rest when tired, shelter under trees when cold, wander and
  socialise otherwise, reproduce when healthy and near a partner. Keep it simple and readable; curiosity raises
  wandering, sociability raises grouping.
- Starting population: about 20 agents. Dials: food regrowth rate, mutation rate, starting population, generation length.

## 3c. Seeing them
- Agents rendered as small, clearly readable figures (instanced; hundreds must be cheap), coloured by family line,
  with a subtle cue for their current activity (eating, resting, wandering, seeking).
- Click an agent: a panel with its needs, traits, age, parents and current activity. Option to follow it with the camera.
- A compact HUD: population, births, deaths, current generation, simulated time, speed control.
- The world look from v0.3 stays; do not spend effort on visual polish.

## 3d. Evals (all required, added to npm test or npm run eval)
- Determinism: same seed and dials, headless, N ticks gives an identical event-log hash; a different seed differs.
- Viability: with default dials, headless, the population survives at least 3 generations in at least 4 of 5 seeds,
  and does not explode past a cap. Report births, deaths by cause and population over time.
- Simulation cost: 200 agents for 10,000 ticks headless within a stated time budget (measure it and set the budget).
- The build eval must still pass in both modes, and its screenshots must show agents on the island.

Never push. Report what you measured, not what you hope.

## Reviewer additions (apply from iteration 034)

1. New evals belong in separate scripts, for example `scripts/eval-sim.mjs`. Do not edit `scripts/eval-build.mjs`.
2. The two determinism comparison runs must use separate Node processes. Replay must rebuild state from seed plus
   event log and compare the final state hash with the live run, not merely compare logs from seed.
3. Every renderer message that changes simulation state is a logged event at its tick. Pause and speed changes are excluded.
4. The simulation owns trees and food. The renderer reads trees from snapshots, with consumed fruit visible; food must
   remain replaceable by stage 2c chemistry.
5. Stop and commit at the end of revised 3a as its own review point before further 3b work, and report that 3a is done.

Round 12's body rejection and replacement viability criteria remain pending for the next bodies iteration. Instrument
all reproduction conditions for all five seeds before changing any threshold or dial. The revised 3a checkpoint must
not claim that the existing three-generation observation establishes long-run viability.
