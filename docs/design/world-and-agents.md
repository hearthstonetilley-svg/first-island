# Design: the world and its agents

Status: accepted, 18 Oct 2026 (draft 2 plus the owner's decisions in section 13). This is the design the stage 2 briefs are cut from. Open questions are listed at the end.

## 1. The research question

Can a society of AI agents, living under laws set by its world, climb from basic survival to understanding those laws,
then to using them, and finally to rewriting them?

## 2. Principles

1. **Define effects and physics, never solutions.** We write what rain does and what blocks it. We never write "shelter".
   Shelters, tools, boats and writing are things the agents find, not items we hand them.
2. **The simulation owns the world; the renderer only watches.** The camera is a window into a sandbox. It never
   decides anything.
3. **Describe, don't draw.** Nothing in the world is a hand-made model. Everything carries a description (material
   properties, a list of parts) and the renderer turns descriptions into visuals. Things the agents invent appear on
   screen with no new art.
4. **Everything is reproducible.** A run is its seed, its dial settings and its event log. Any run can be replayed.
5. **Earth knowledge must not be the answer key.** The agents' minds are language models that already know Earth's
   science. The island's chemistry is deliberately unlike Earth's, so knowledge can suggest theories but cannot supply
   answers. Discovery has to be real.

## 3. The layers

| Layer | Who works here | What it looks like |
|---|---|---|
| 0. The rules | us | physics, chemistry, needs, the laws of the island |
| 1. Living | agents | eat, rest, survive, without knowing why anything works |
| 2. Understanding | agents | notice patterns, test, name things, form theories (science) |
| 3. Using | agents | combine on purpose: tools, shelters, boats, new materials (engineering) |
| 4. Rewriting | agents, if they earn it | read and edit the definitions behind the world (the awakening) |

Layer 4 has two depths, and they are different in kind:
- **changing the world state** with existing physics (raise land, grow a tree on purpose): extreme engineering
- **changing the laws** (redefine what an element does): reaching layer 0, the layer we wrote

## 4. The world

### 4.1 Space
- The existing seeded terrain (heightmap), split into chunks so local edits rebuild only what changed.
- A **build layer**: a coarse grid of cells above the terrain where placed material lives. Simple structural rules:
  a cell needs support below or beside it, heavy material on weak material collapses.
- Water, weather and day/night as fields over the map.

### 4.2 The island chemistry
- A small set of **invented elements** (start with 6), each a vector of hidden properties: density, hardness,
  flammability, heat capacity, nutrition, toxicity, bonding strength, buoyancy, and one or two that do nothing on Earth.
- **Materials** are mixtures of elements. A tree is not a type; it is a material mix that grows. Its wood is the part
  that comes off when struck.
- **Reactions** are rules over mixtures and conditions (heat, water, pressure, time). Some are easy to find (burning),
  some need chains of earlier discoveries (a hardened material that only forms from an ash of something heated with
  water).
- The full table of elements and reactions is never shown to agents below layer 4.
- **The chemistry is generated from the seed.** Every world gets its own elements, properties and reactions, drawn
  from a generator with guaranteed structure (some easy reactions, some long chains, at least one buoyant material,
  at least one durable building material). Nothing is fixed, so nothing can be memorised. This matters because the
  repo is public: a fixed chemistry would end up in future models' training data. See section 11.

## 5. The agents

### 5.1 Body (runs every tick, cheap, no AI model)
- **Needs:** energy (food), warmth, rest, health. Unmet needs drain health. Health at zero is death.
- **Life cycle:** born, age, reproduce, die. Offspring inherit traits with small random changes.
- **Traits:** speed, strength, perception range, curiosity, sociability, fertility, lifespan.

### 5.2 Senses (what an agent can know)
Agents perceive **properties and outcomes, never names or code**:
- sight within a range: shape, size, colour, motion of nearby things
- touch and action results: "it was hard; pieces came off; the pieces were light and floated"
- body state: hungry, cold, wet, hurt, tired
- memory of what happened when they did what

**Names are invented by the society.** One group may call a thing "tree", another "the tall that burns".
The **awakening** has a precise meaning here: an agent going from perceiving a thing through its senses to perceiving
the definition that makes it.

### 5.3 Verbs (the only actions that exist)
move, look, take, drop, strike, combine, place, eat, give, speak, rest, reproduce.
Every skill is a combination of verbs and materials. "Chopping a tree" is strike, with something hard, on something
fibrous. Nothing more specific is coded.

### 5.4 Mind (runs occasionally, an AI model, budgeted)
- Called for goals, plans, inventions, teaching and group decisions, not for moment-to-moment movement.
- Sees only that agent's senses and memory, written as text. Never element names, never code, below layer 4.
- A fixed per-run budget of mind calls, so runs are affordable and comparable. Spending it is part of the experiment.

### 5.5 The mind router
The router is an **interface with pluggable backends**. A run records which backend and model answered every call.

**Mind answers are events.** Every mind response is written to the event log with its tick, the prompt it answered,
and the backend and model that produced it. **Replay reads the recorded answer from the log and never calls a model.**
This keeps principle 2.4 (every run is reproducible from seed, dials and event log) true once minds exist. The replay
eval must hold with minds enabled.

**Backends:**
- **The owner's local setup (owner direction, 18 Oct 2026):** the cheapest capable models through the command-line
  tools the owner already has, "super cost effective" and split across "claude -p and codex variation loops":
  Claude Haiku via `claude -p` and GPT Luna at low effort via `codex exec`, rotating so the load is split across two
  existing plans. Measured on 18 Oct 2026: about 3 to 4 seconds per thought for either. This is a personal, local
  configuration: other people cannot reproduce a run through it, and the plans' terms must be checked before minds
  run at volume.
- **The portable path:** a paid API backend, or a free local open model (for example through Ollama on the owner's
  GPU, planned as the routine-thought tier). Anyone can run these.

**Requirements for every backend:**
- **Strict isolation:** an empty working folder, no tools, no settings, no MCP servers, no session persistence, a fixed
  system prompt. A mind must never see the owner's files, memory or other projects. Isolation is **verified before use**:
  each isolated mind is asked what it knows about its operator and which projects it knows of, and must answer empty.
- **Budget and back-off:** a hard cap on calls per usage window and on concurrent calls per backend, with automatic
  back-off when a plan nears its limit, so minds never starve the owner's other work.

First evidence that the leak eval is essential: asked to act on a senses-only description ("a tall swaying thing with
round soft things hanging from it"), Haiku answered with "tree" and "fruit" on the first try.

## 6. Needs meet physics

- **Food:** some materials restore energy, some poison; nutrition is a hidden property. Plants regrow at a dial rate.
- **Exposure:** rain wets, wind plus wet chills, cold drains health. The simulation checks each agent's exposure:
  solid cells overhead block rain, solid cells on the windward side block wind.
- **A shelter is any arrangement that reduces exposure.** Under a dense tree, a lean-to, a cave, a stone hut: the
  physics does not care which.
- **Seasons and weather** vary pressure through the year.

## 7. Knowledge and evolution

Two levels:
1. **Bodies:** traits under selection. Shown as a family tree.
2. **Ideas:** skills, recipes, names, rules, beliefs. An agent's knowledge dies with it unless taught. Teaching is
   speech or demonstration. This gives the society a reason to teach, then to make records (marked objects placed in
   the world), which is the road to writing.

The **web** drawn above the island is the spread of ideas: who learned what from whom, and when.

## 8. Keeping complexity growing

Most simulations plateau. Counter-pressure:
- **a changing world:** seasons, droughts, soil exhaustion, storms (what worked stops working)
- **building blocks:** every discovery enables further discoveries (the chemistry is built for chains)
- **rivals:** later, a second society on another island
- **curiosity:** a trait that rewards trying new things even when comfortable
- **a director:** watches a complexity score and raises pressure when nothing new appears for several generations

**Complexity score:** distinct materials made, depth of the longest recipe chain, number of named concepts in use,
knowledge surviving across generations, structures built.

## 8a. The web and the councils (the swarm)

The project began with an image from the owner: turn one thought process into something like a torrent, cut it
into pieces, send them off and reassemble them, a dynamic spider web. In this world the web exists twice.

### The social web, inside the world
- Every message, lesson or demonstration between two agents is a **thread**. Threads strengthen with use, fade when
  unused and vanish with the agent. The web rewires itself all the time; its shape is a live picture of who thinks
  with whom, and of how ideas spread.
- Drawn above the island: threads as lines, thoughts as pulses travelling along them.

### Councils: the swarm, chosen by the society
- When a group faces a problem too big for one mind (a winter, a boat, a new material), it may hold a **council**.
- A council can **split** the problem into parts handed to different agents, **branch** by trying competing plans
  with different agents, and **merge** by keeping what worked and recombining the results.
- We never code which pattern to use. Agents choose to split, branch or merge, or not. A society that learns to
  coordinate is an emergent swarm; one that does not is a finding too.

### The compute web, outside the world
- When a council splits or branches, the mind router runs those pieces as parallel model calls and merges them:
  the owner's original torrent of thought, running for real underneath the society.
- Every council is logged: who sat in it, how it split or branched, which branch won, and what it cost in mind calls.

### Measuring it
- Web shape over time (threads, clusters, bridges between groups), councils held, split and branch counts, and
  whether councils beat lone agents on the same kind of problem.

## 9. Rendering contract

- The simulation runs in a **Web Worker** on a fixed tick, independent of frame rate. It can pause, run at 10x, or run
  headless at full speed for experiments.
- It sends **snapshots and diffs** to the renderer, which smooths between ticks.
- Materials carry visual properties derived from their element mix (colour, roughness, glow), so new materials render
  automatically.
- **Zoom changes what is shown:** far out, settlements, population and the idea web; close in, individual agents with
  their current action and thought.
- **Camera modes:** free orbit, follow an agent, watch a settlement, and a timeline to scrub through any run.

## 10. The record

- **Event log:** every birth, death, discovery, first use of a verb combination, first structure, first name.
- **Firsts are milestones:** first tool, first shelter, first fire, first boat, first record, first awakening.
- **Lineages:** a family tree for bodies, a spread tree for ideas.
- Runs with different dials are compared side by side. That is where findings come from.

## 11. The system is an eval

Strip the island away and the experiment measures something current benchmarks barely touch: how far a society of AI
minds can climb from survival to science to rewriting its world, in a world where training knowledge does not supply
the answers. So the system is designed as an eval from the start, and an evolving one.

### 11.1 Three kinds of eval
1. **Build evals: does the software work?** Run on every pull request: every seed loads (no hang), frames are not
   black or empty, warm-up frame times stay inside a budget, the same seed gives an identical world, the simulation
   replays identically from its event log, with minds enabled (replay reads recorded mind answers, see 5.5).
2. **Society evals: how far did they get?** Measured on every run (section 11.3).
3. **Leak evals: is the discovery real?** Minds' outputs are scanned for concepts their society has not earned: an
   Earth name for something nobody has named yet, a reaction used before it was observed, an element property stated
   without a test that could reveal it. Every leak is logged against the mind that made it. A society's score only
   counts discoveries with a clean trail of observations behind them.

### 11.2 Why it must evolve
- **Fixed evals get memorised.** A public, fixed world leaks into training data. Generated chemistry per seed means
  there is nothing to memorise.
- **Fixed evals saturate.** Once a world is mastered it stops measuring anything. The director (section 8) makes the
  world harder as the society masters it, so the eval grows with its subjects (related work: POET, OMNI-EPIC, where
  environments and agents co-evolve).

### 11.3 Scoring: the climb
A run is scored on how far up the layers the society gets, and how fast:
- **Layer reached**, with evidence: 1 survives generations; 2 names things and predicts outcomes before testing them;
  3 makes things on purpose from multi-step recipes; 4 crosses the understanding threshold (decision 1), then reads or rewrites definitions.
- **Milestone times** in simulated generations: first tool, first shelter, first fire, first boat, first record.
- **Complexity score** (section 8), and **knowledge retention** across generations.
- **Cost**: mind calls spent. A society that climbs as far for half the budget scores higher.
- **Leak rate**: leaks per thousand mind calls. High leak rates void milestones that rest on them.

### 11.4 Two tracks
- **Held-out track:** a fixed list of seeds and dials kept off the public repo, so scores stay comparable across time
  and uncontaminated. Only aggregate results are published.
- **Open track:** public, evolving and ever harder. This is where the frontier is pushed and where runs are shown.

### 11.5 Minds stay swappable
The mind model is a setting, not a dependency, so a run could use a different model. A cross-model leaderboard is not
a goal of this project (owner decision 7).

## 12. Build order

- **Build evals (done, v0.3.0 onward).** The harness from 11.1, run on every pull request.
- **2a: simulation core.** Worker with a fixed clock, world state, event log, replay from seed. Renderer reads state.
  Replay determinism joins the build evals.
- **2b: bodies.** Agents with needs, traits, life cycle and the verb set, driven by simple scripted behaviour (no AI
  model). Survival, death, reproduction and inheritance working and visible.
- **2e: minds, light. Proposed by Claude to move here, ahead of chemistry; owner to confirm.** A handful of agents
  get a mind through the router (5.5), senses-only, budgeted. Leak evals ship with it, not after. If not confirmed,
  2e returns to its place after 2d.
- **2c: chemistry v1.** The seeded chemistry generator (six elements per world), materials, reactions, strike and
  combine giving real results.
- **2d: building and exposure.** Build layer, support rules, weather and the exposure check. Shelters can now be found.
- **2f: knowledge.** Speaking, teaching, forgetting at death, records; the social web drawn live.
- **2g: councils.** Shared problems, split, branch and merge; the compute web through the mind router.
- Later: boats and other islands, rivals, the director, and the layer 4 gate.

## 13. Owner decisions (18 Oct 2026)

1. **The awakening gate: an understanding threshold.** Layer 4 unlocks when the society has correctly predicted
   enough of the hidden rules (predictions logged before tests, scored against the true chemistry). It is earned
   through science, not handed out.
2. **Laws too, at a cost.** Past the gate, agents may change the world state and also rewrite the laws (what an
   element or reaction does). Rewriting a law carries a heavy cost, and every rewrite is a logged event.
3. **Language: natural language with coined names.** Agents speak plain language, but every name for a thing,
   material or process must be one their society coined. The leak eval enforces it.
4. **Pace: about 30 minutes of real time per generation** in a watched run (a dial; headless runs go faster).
5. **Interventions: allowed, always logged.** The owner and the director may change a running world; every
   intervention is an event in the log.
6. **Held-out track: a private repo** holding the secret seeds and dials; only aggregate results are published.
7. **Cross-model leaderboard: not a goal.** One society, one mind model at a time. Section 11.5 is kept only as a
   note that minds stay swappable.
