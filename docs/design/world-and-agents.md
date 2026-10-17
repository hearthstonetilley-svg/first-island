# Design: the world and its agents

Status: draft 1, 18 Oct 2026. This is the design the stage 2 briefs are cut from. Open questions are listed at the end.

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

## 11. Build order

- **2a: simulation core.** Worker with a fixed clock, world state, event log, replay from seed. Renderer reads state.
- **2b: bodies.** Agents with needs, traits, life cycle and the verb set, driven by simple scripted behaviour (no AI
  model). Survival, death, reproduction and inheritance working and visible.
- **2c: chemistry v1.** Six elements, materials, a handful of reactions, strike and combine giving real results.
- **2d: building and exposure.** Build layer, support rules, weather and the exposure check. Shelters can now be found.
- **2e: minds.** The AI model tier, with the senses-only view and a budget.
- **2f: knowledge.** Teaching, forgetting at death, records, the idea web.
- Later: boats and other islands, rivals, the director, and the layer 4 gate.

## 12. Open questions for the owner

1. **The awakening gate.** What does it take to reach layer 4: a discovery (an instrument that reveals definitions),
   a threshold of understanding, or never by default? What does editing cost?
2. **Laws or state.** If they reach layer 4, may they change the laws, or only the world state?
3. **Language.** Do agents speak in natural language (readable, but it imports Earth concepts) or in invented tokens
   (pure, but we need to translate)?
4. **Death and pace.** How long is a generation in real time? This sets how fast evolution can be watched.
5. **Our interventions.** May we (the owner, the director) change the world during a run, and is every intervention
   logged as an event?
