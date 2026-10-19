import { generateWorld, WorldData } from '../world/generate';
import { Ground } from '../sim/navigation';

// The islet (decision 59): a small second island, generated from the seed and set offshore beyond the
// main island's reach, north-west, where the whole-island view already looks. No land joins the two;
// only the sea. The server places it; the page builds the same terrain from the seed and the offset.
export const isletSeed = (seed: number) => seed * 31 + 7;
// Half the height of a generated island, so a small one is walkable rather than all cliff.
export const ISLET_SIZE = 28, ISLET_RESOLUTION = 128, ISLET_GAP = 10, ISLET_HEIGHT = 0.5;
const BEARING = (() => { const x = -0.55, z = -0.84, l = Math.hypot(x, z); return { x: x / l, z: z / l }; })();

export function isletWorld(seed: number): WorldData {
  const world = generateWorld(isletSeed(seed), ISLET_RESOLUTION, ISLET_SIZE);
  for (let i = 0; i < world.heights.length; i++) world.heights[i] *= ISLET_HEIGHT;
  for (const t of world.trees) t.y *= ISLET_HEIGHT;
  return world;
}
/** Every point of a world's land (above the sea), cell by cell, in world units. */
function landPoints(world: WorldData): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [], n = world.resolution, step = world.size / (n - 1);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (world.heights[r * n + c] > 0) out.push({ x: c * step - world.size / 2, z: r * step - world.size / 2 });
  return out;
}

export function placeIslet(seed: number, main: Ground): { world: WorldData; ground: Ground; x: number; z: number; radius: number } {
  const world = isletWorld(seed), ground = new Ground(world);
  // Every bit of islet land lies at least ISLET_GAP beyond the main island's farthest land along the bearing,
  // peaks and cliffs included, not only the walkable ground.
  const reach = Math.max(...landPoints(main.world).map(p => p.x * BEARING.x + p.z * BEARING.z));
  const radius = Math.max(...landPoints(world).map(p => Math.hypot(p.x, p.z)));
  const d = reach + ISLET_GAP + radius;
  return { world, ground, x: BEARING.x * d, z: BEARING.z * d, radius };
}
