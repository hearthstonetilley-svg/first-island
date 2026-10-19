# first-island

A public research experiment: can a society of AI agents, living on a procedurally generated island under laws set by
the island, grow from basic tool use ("chop this tree for wood") to rewriting the world itself ("we can just create the
tree")?

Everything runs in the browser (Three.js, WebGPU with a WebGL2 fallback). The same seed always builds the same world,
so every run can be reproduced exactly.

## Status

v0.9: a living sandbox. Eight agents live on a seeded island, each driven by a small model mind (Haiku or Sonnet
through Claude, Luna or Sol through Codex; the owner sets the mix in the top bar). They gather, combine materials under
real-world chemistry, need an edge to cut a living tree, eat, build shelter, defend against the night boar, name
places, teach facts and skills, test predictions, and call councils when they disagree. Storms bring rain, and the sky
panel shows the day while the sun crosses the sky, with stars and a moon at night. The page draws what they know
as a nucleus.

Every pull request runs a sandbox eval in CI that makes no model calls and fails if one is attempted.

Next: more photorealism (the day cycle is in), boats and other islands, rival societies, and the awakening, where agents
earn the right to rewrite the island's laws.

## How it is built

The project is built in the open by two AI systems with a human owner (decision 51):

- **Claude** (Anthropic) builds every version: eval checks first, then the code, through a pull request on green CI.
- **Codex** (OpenAI, GPT-6-Astra) only reviews. Each version gets one adversarial audit before it leaves draft, and
  the verdict is saved word for word in [docs/reviews](docs/reviews).
- **The owner** sets the direction and makes the calls.

Rounds 1 to 13 (v0.0.1 to v0.4.2) were built the other way round, with Codex writing code from Claude's briefs. Every
version is published, including the ones that failed review: the experiment is as much about how the world gets built
as about the world itself.

## The record

- [Journal](docs/JOURNAL.md): how the idea came about and how it is being built
- [Decisions](docs/DECISIONS.md): every decision and why
- [Design](docs/design/world-and-agents.md): the world and its agents

## Version log

| Version | What happened |
|---|---|
| brief | Milestone 1 brief: ocean, one seeded island, trees ([BRIEF-1.md](docs/briefs/BRIEF-1.md)) |
| v0.0.1 | Round 1, rejected: a square slab of sand, ocean hidden under the land, black void, flat grey plateau ([review](docs/reviews/v0.0.1.md)) |
| v0.0.2 | Round 2, rejected: ocean renders black (GLSL under WebGPU), every seed the same blob ([review](docs/reviews/v0.0.2.md)) |
| v0.1.0 | Round 3, accepted: blue ocean, sky, coastline, deterministic seeds; weak spots noted ([review](docs/reviews/v0.1.0.md)) |
| v0.1.1 | Round 4, rejected: FPS counter added, but a flat toy diorama, same silhouette, ghost slab ([review](docs/reviews/v0.1.1.md)) |
| v0.1.2 | Round 5, changes requested: the big visual leap (peaks, distinct coastlines, foam, sky), but renderer start-up can hang; 21 iteration screenshots in docs/iterations ([review](docs/reviews/v0.1.2.md)) |
| v0.2.0 | Round 6, accepted: start-up can no longer hang (8/8 loads); the round 5 island look ships ([review](docs/reviews/v0.2.0.md)) |
| v0.2.1 | Round 7, accepted: dark volcanic rock with crevices, softer sun glitter, branched canopies ([review](docs/reviews/v0.2.1.md)) |
| v0.3.0 | Round 8, accepted: shaders warmed before the first frame, adaptive quality, staged loading screen; build eval 5/5 on WebGL2, WebGPU device-lost bug outstanding ([review](docs/reviews/v0.3.0.md)) |
| v0.3.1 | Round 9, accepted: a lost WebGPU device now rebuilds on WebGL2 without reloading; build eval 10/10 in both modes ([review](docs/reviews/v0.3.1.md)) |
| v0.3.2 | Round 10, accepted: the loader measures real play frames and quality steps back up; owner confirmed on real WebGPU hardware ([review](docs/reviews/v0.3.2.md)) |
| v0.4.0 | Round 11, accepted: stage 3a, the simulation clock in a worker with an event log and exact replay; deterministic across processes ([review](docs/reviews/v0.4.0.md)) |
| v0.4.1 | Round 12, rejected: the first agents (bodies, traits, display) pass the builder's 90-minute eval but every seed goes extinct on a long run ([review](docs/reviews/v0.4.1.md)) |
| v0.4.2 | Round 13, changes requested: extinction fixed with a measured cause, exact replay across processes and browser, pace at one generation; but only the cap limits the population ([review](docs/reviews/v0.4.2.md)) |
| v0.7.0 | The sandbox: councils, chemistry, skills, the minds mixer, usage meters, the knowledge nucleus, and the restored performance contract ([review](docs/reviews/v0.7.0.md)) |
| v0.7.1 | Survival readable on the page: strength on every box, shelter and food knowledge in the inspector, the survival rules written out |
| v0.8.0 | Places, councils on disagreement, the recitation score, the director, fading strands, tools that matter, the night boar, the sky panel and rain in storms ([audit](docs/reviews/astra-audit-13-2026-10-19.md)) |
| v0.8.1 | A restarted island always waits for Run ([audit](docs/reviews/astra-audit-14-2026-10-19.md)) |
| v0.9.0 | The day cycle: the sun crosses the sky on the island's clock, with sky, stars, moon, water and shadows following it |

## Run it

```
npm install
npm run dev          # http://localhost:5173/?seed=42
npm test
npm run build
npm run eval         # five seeds, three loads each, auto and forced WebGL2
npm run typecheck:server
npm run sandbox      # the agent server; the page connects to it
npm run eval:sandbox # agents, councils, camera and pages, with zero model calls
```

`?seed=N` picks the island. `?renderer=webgl2` forces the WebGL2 path.
`?debug=1` records startup phases and the first 600 frame times in the console and `window.__ISLAND_DEBUG__`.
`?post=0` disables AO and bloom for comparison. Quality adapts after slow two-second windows and is shown beside FPS.
A staged loading screen covers generation, shader compilation and warm-up, then checks completed frame cadence before
fading into the island. Devices below the smoothness target get a performance notice and an explicit entry button.
See [iteration 025](docs/iterations/025.md) for profiling controls and [iteration 026](docs/iterations/026.md) for loading-screen checks.

WebGPU device loss rebuilds the scene on a fresh WebGL2 renderer using the existing world data, with a short recovery
notice and no page reload. See [iteration 027](docs/iterations/027.md) for the device probe, recovery checks and eval results.

## Licence

MIT
