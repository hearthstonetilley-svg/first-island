export type TerrainBand = 'beach' | 'grass' | 'rock';
export type TreeKind = 'pine' | 'broadleaf' | 'palm';

export interface TreeData {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  lean: number;
  kind: TreeKind;
  tint: number;
}

export interface WorldData {
  seed: number;
  size: number;
  resolution: number;
  /** Elevation in world units, shared by terrain, water and vegetation. */
  heights: Float32Array;
  bands: TerrainBand[];
  trees: TreeData[];
}

export const SEA_LEVEL = 0;

export function parseSeed(value: string | null): number {
  if (value === null || value.trim() === '') return 1;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 1;
}

class SeededRandom {
  private state: number;
  constructor(seed: number) { this.state = seed | 0; }
  next(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}

function createNoise(random: SeededRandom): (x: number, y: number) => number {
  const values = new Float32Array(256);
  for (let index = 0; index < values.length; index += 1) values[index] = random.next() * 2 - 1;
  const smooth = (value: number) => value * value * (3 - 2 * value);
  const lattice = (x: number, y: number) => values[(Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) & 255];
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const top = lattice(x0, y0) * (1 - tx) + lattice(x0 + 1, y0) * tx;
    const bottom = lattice(x0, y0 + 1) * (1 - tx) + lattice(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

const fbm = (noise: (x: number, y: number) => number, x: number, y: number): number => {
  let sum = 0;
  let amplitude = 0.55;
  let frequency = 1;
  for (let octave = 0; octave < 5; octave += 1) {
    sum += noise(x * frequency, y * frequency) * amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return sum;
};
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smoothstep = (low: number, high: number, value: number) => {
  const t = clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};

/** Bilinear world-space sampling also used to seat trees on the rendered surface. */
export function sampleHeight(world: Pick<WorldData, 'heights' | 'size' | 'resolution'>, x: number, z: number): number {
  const u = clamp(x / world.size + 0.5) * (world.resolution - 1);
  const v = clamp(z / world.size + 0.5) * (world.resolution - 1);
  const column = Math.min(world.resolution - 2, Math.floor(u));
  const row = Math.min(world.resolution - 2, Math.floor(v));
  const tx = u - column;
  const ty = v - row;
  const a = world.heights[row * world.resolution + column];
  const b = world.heights[row * world.resolution + column + 1];
  const c = world.heights[(row + 1) * world.resolution + column];
  const d = world.heights[(row + 1) * world.resolution + column + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

export function sampleSlope(world: Pick<WorldData, 'heights' | 'size' | 'resolution'>, x: number, z: number): number {
  const step = world.size / (world.resolution - 1);
  return Math.hypot(
    sampleHeight(world, x + step, z) - sampleHeight(world, x - step, z),
    sampleHeight(world, x, z + step) - sampleHeight(world, x, z - step),
  ) / (step * 2);
}

export function generateWorld(seed = 1, resolution = 256, size = 64): WorldData {
  const random = new SeededRandom(seed);
  // Layout is chosen before the noise table so one PRNG drives the entire world.
  const layout = Math.floor(random.next() * 4);
  const angle = random.next() * Math.PI * 2;
  const stretch = 0.88 + random.next() * 0.24;
  const peakHeight = 7.6 + random.next() * 2;
  type Blob = { x: number; z: number; rx: number; rz: number };
  let blobs: Blob[];
  if (layout === 0) {
    // Three lobes round an open bay, with a fourth at one tip.
    blobs = [
      { x: -0.3, z: -0.2, rx: 0.3, rz: 0.27 },
      { x: 0.04, z: -0.34, rx: 0.31, rz: 0.24 },
      { x: 0.34, z: -0.12, rx: 0.24, rz: 0.29 },
      { x: -0.38, z: 0.15, rx: 0.2, rz: 0.26 },
    ];
  } else if (layout === 1) {
    blobs = [
      { x: -0.18, z: 0.04, rx: 0.36, rz: 0.49 },
      { x: 0.16, z: -0.19, rx: 0.29, rz: 0.28 },
      { x: 0.49, z: 0.32, rx: 0.12, rz: 0.17 },
    ];
  } else if (layout === 2) {
    // Two mountainous ends linked by a low narrow spit.
    blobs = [
      { x: -0.36, z: -0.09, rx: 0.29, rz: 0.3 },
      { x: 0.32, z: 0.08, rx: 0.26, rz: 0.37 },
      { x: -0.02, z: 0, rx: 0.39, rz: 0.12 },
    ];
  } else {
    blobs = [
      { x: -0.14, z: -0.12, rx: 0.47, rz: 0.28 },
      { x: 0.23, z: 0.17, rx: 0.24, rz: 0.4 },
    ];
  }
  blobs = blobs.map((blob) => ({
    x: blob.x + (random.next() - 0.5) * 0.06,
    z: blob.z + (random.next() - 0.5) * 0.06,
    rx: blob.rx * stretch * (0.88 + random.next() * 0.24),
    rz: blob.rz / stretch * (0.88 + random.next() * 0.24),
  }));
  const noise = createNoise(random);
  const heights = new Float32Array(resolution * resolution);
  const bands: TerrainBand[] = [];

  for (let row = 0; row < resolution; row += 1) {
    for (let column = 0; column < resolution; column += 1) {
      const nx = column / (resolution - 1) * 2 - 1;
      const nz = row / (resolution - 1) * 2 - 1;
      const rx = nx * Math.cos(angle) - nz * Math.sin(angle);
      const rz = nx * Math.sin(angle) + nz * Math.cos(angle);
      const x = rx + fbm(noise, rx * 3 + 19, rz * 3 - 13) * 0.12;
      const z = rz + fbm(noise, rx * 3 - 37, rz * 3 + 29) * 0.12;
      let distance = -Infinity;
      for (const blob of blobs) {
        const d = (1 - Math.hypot((x - blob.x) / blob.rx, (z - blob.z) / blob.rz)) * Math.min(blob.rx, blob.rz);
        // Smooth union keeps the joins organic instead of leaving a ridge at each blob seam.
        const h = Math.max(0.035 - Math.abs(distance - d), 0) / 0.035;
        distance = Math.max(distance, d) + h * h * 0.00875;
      }
      // All land is enclosed by a submerged radial margin, regardless of seed.
      distance = Math.min(distance, (0.89 - Math.hypot(nx, nz)) * 0.8);
      const inland = distance * size * 0.5;
      let height: number;
      if (inland <= 0) {
        const depth = -inland;
        height = -depth * 1.3 - Math.pow(depth, 1.5) * 0.5
          - smoothstep(0.76, 1, Math.hypot(nx, nz)) * smoothstep(0, 2, depth) * 18;
      } else {
        const main = blobs[0];
        const other = blobs[1];
        const ridgeX = x + fbm(noise, x * 7 + 9, z * 7 - 17) * 0.055;
        const ridgeZ = z + fbm(noise, x * 7 - 29, z * 7 + 31) * 0.055;
        const cone = Math.exp(-(((ridgeX - main.x) / (main.rx * 0.66)) ** 2 + ((ridgeZ - main.z) / (main.rz * 0.58)) ** 2) * 1.5);
        const shoulder = Math.exp(-(((x - other.x) / (other.rx * 0.65)) ** 2 + ((z - other.z) / (other.rz * 0.65)) ** 2) * 1.8) * 0.5;
        const ridge = (1 - Math.abs(fbm(noise, x * 13 + 11, z * 13 + 43))) ** 2;
        const detail = fbm(noise, x * 16 - 7, z * 16 + 5);
        height = inland * 0.22 + smoothstep(0.05, 1.8, inland)
          * (0.35 + peakHeight * Math.max(cone, shoulder) * (0.45 + ridge * 0.55) + detail * 0.55);
        if (layout === 2) {
          const spit = (1 - smoothstep(0.1, 0.24, Math.abs(x))) * (1 - smoothstep(0.07, 0.16, Math.abs(z)));
          height *= 1 - spit * 0.94;
        }
      }
      heights[row * resolution + column] = height;
    }
  }

  const world = { seed, size, resolution, heights, bands, trees: [] as TreeData[] };
  for (let row = 0; row < resolution; row += 1) {
    for (let column = 0; column < resolution; column += 1) {
      const height = heights[row * resolution + column];
      const x = (column / (resolution - 1) - 0.5) * size;
      const z = (row / (resolution - 1) - 0.5) * size;
      const slope = sampleSlope(world, x, z);
      bands.push(height < 0.24 ? 'beach' : height > 5.4 || slope > 1.6 ? 'rock' : 'grass');
    }
  }

  const trees = world.trees;
  const occupied = new Set<string>();
  for (let attempt = 0; attempt < 14000; attempt += 1) {
    const x = (random.next() - 0.5) * size * 0.85;
    const z = (random.next() - 0.5) * size * 0.85;
    const y = sampleHeight(world, x, z);
    if (y < 0.28 || y > 5.3) continue;
    const slope = sampleSlope(world, x, z);
    if (slope > 1.4) continue;
    // A separate low-frequency field leaves meadows between uneven, dense groves.
    const grove = fbm(noise, x * 0.33 + 57, z * 0.33 - 31);
    if (grove < 0.025 || random.next() > 0.58 + grove) continue;
    const spacing = 0.28;
    const cx = Math.floor(x / spacing);
    const cz = Math.floor(z / spacing);
    let crowded = false;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (occupied.has(`${cx + dx},${cz + dz}`)) crowded = true;
      }
    }
    if (crowded) continue;
    const kind: TreeKind = y < 0.65 && slope < 0.6 ? 'palm' : y > 2.6 ? 'pine' : 'broadleaf';
    trees.push({ x, y, z, kind, scale: 0.32 + random.next() * 0.22,
      rotation: random.next() * Math.PI * 2, lean: (random.next() - 0.5) * 0.16, tint: random.next() });
    occupied.add(`${cx},${cz}`);
  }
  return world;
}
