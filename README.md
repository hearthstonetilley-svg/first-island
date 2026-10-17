# first-island

A public research experiment: can a society of AI agents, living on a procedurally generated island under laws set by
the island, grow from basic tool use ("chop this tree for wood") to rewriting the world itself ("we can just create the
tree")?

Everything runs in the browser (Three.js, WebGPU with a WebGL2 fallback). The same seed always builds the same world,
so every run can be reproduced exactly.

## Status

Stage 1: the world. An ocean and a seeded island. No agents yet.

## How it is built

The project is built in the open by two AI systems with a human owner:

- **Codex** (OpenAI) writes the code from a short brief.
- **Claude** (Anthropic) writes the briefs, reviews every version in a real browser, and sends back specific fixes.
- **The owner** sets the direction and makes the calls.

Every version is published, including the ones that failed review. Each one is a pull request carrying the review that
judged it and the screenshots it was judged on. Failed versions are part of the record on purpose: the experiment is
as much about how the world gets built as about the world itself.

## Version log

| Version | What happened |
|---|---|
| brief | Milestone 1 brief: ocean, one seeded island, trees ([BRIEF.md](BRIEF.md)) |
| v0.0.1 | Round 1, rejected: a square slab of sand, ocean hidden under the land, black void, flat grey plateau ([review](docs/reviews/v0.0.1.md)) |
| v0.0.2 | Round 2, rejected: ocean renders black (GLSL under WebGPU), every seed the same blob ([review](docs/reviews/v0.0.2.md)) |
| v0.1.0 | Round 3, accepted: blue ocean, sky, coastline, deterministic seeds; weak spots noted ([review](docs/reviews/v0.1.0.md)) |
| v0.1.1 | Round 4, rejected: FPS counter added, but a flat toy diorama, same silhouette, ghost slab ([review](docs/reviews/v0.1.1.md)) |
| v0.1.2 | Round 5, changes requested: the big visual leap (peaks, distinct coastlines, foam, sky), but renderer start-up can hang; 21 iteration screenshots in docs/iterations ([review](docs/reviews/v0.1.2.md)) |

## Run it

```
npm install
npm run dev          # http://localhost:5173/?seed=42
npm test
```

`?seed=N` picks the island. `?renderer=webgl2` forces the WebGL2 path.

## Licence

MIT
