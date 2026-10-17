# Milestone 1: ocean, one island, trees

Working name "island" (final name not chosen yet). Local only. Do not create any remote or push anything.

## Goal
Open http://localhost:5173 and see a calm ocean with one island on it, covered in trees.
The same seed always makes the same island.

## Stack
- Vite + TypeScript
- Three.js with WebGPURenderer (TSL for shaders), falling back to WebGL2 automatically when WebGPU is missing
- No other runtime dependencies unless truly needed (a small seeded noise library is fine)

## Must have
1. Seeded generation. Seed from the URL (?seed=1234), default 1. Same seed = identical island, trees included.
   Use one seeded random generator for everything; never Math.random.
2. Island terrain: layered noise heightmap times a radial falloff, so land always fades to sea at the edges.
   Beach, grass and rock bands by height. Roughly one island, no stray specks of land far out.
3. Ocean: a large plane with gentle animated waves and a colour shift with depth (shallow near the shore, deep further out).
4. Trees: placed only on grass, not on beach, rock or steep slopes. Simple low-poly shapes (trunk + canopy), instanced.
5. Camera: orbit around the island, zoom, sensible starting view.
6. A small on-screen label showing the seed and the renderer in use (WebGPU or WebGL2).
7. Keep world generation pure and separate from rendering (e.g. src/world/ produces data, src/render/ draws it),
   because agents will later read and edit the world data.

## Not now
No agents, no UI beyond the label, no saving, no AI calls.

## Done means
- npm run dev serves it; npm run build passes with no TypeScript errors.
- A tiny test (vitest is fine) proves the same seed gives identical heightmap and tree positions, and a different seed differs.
- Commit locally with a clear message when it works.
