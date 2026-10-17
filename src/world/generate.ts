export type TerrainBand = 'beach' | 'grass' | 'rock';

export interface TreeData {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
}

export interface WorldData {
  seed: number;
  size: number;
  resolution: number;
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

  constructor(seed: number) {
    this.state = (seed | 0) || 1;
  }

  next(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}

function createNoise(seed: number): (x: number, y: number) => number {
  const random = new SeededRandom(seed ^ 0x51ed270b);
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
  let amplitudeTotal = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += noise(x * frequency, y * frequency) * amplitude;
    amplitudeTotal += amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  return sum / amplitudeTotal;
};

export function generateWorld(seed = 1, resolution = 80, size = 24): WorldData {
  const random = new SeededRandom(seed);
  const noise = createNoise(seed);
  const heights = new Float32Array(resolution * resolution);
  const bands: TerrainBand[] = [];
  const step = size / (resolution - 1);

  for (let row = 0; row < resolution; row += 1) {
    for (let column = 0; column < resolution; column += 1) {
      const nx = column / (resolution - 1) * 2 - 1;
      const nz = row / (resolution - 1) * 2 - 1;
      const radius = Math.hypot(nx, nz);
      const coastWarp = fbm(noise, nx * 2.1 + 19, nz * 2.1 - 13) * 0.18;
      const radial = 1 - Math.pow((radius + coastWarp + 0.06) / 0.84, 2.2);
      const broad = fbm(noise, nx * 1.25 + 7, nz * 1.25 - 3) * 0.5 + 0.5;
      const relief = fbm(noise, nx * 2.2 + 31, nz * 2.2 - 29);
      const height = radial * (0.42 + broad * 0.14 + Math.max(0, relief) * 0.32) - 0.08;
      const index = row * resolution + column;
      heights[index] = height;
      bands.push(height < 0.08 ? 'beach' : height > 0.62 ? 'rock' : 'grass');
    }
  }

  const trees: TreeData[] = [];
  const worldHeight = (x: number, z: number) => {
    const column = Math.round((x / size + 0.5) * (resolution - 1));
    const row = Math.round((z / size + 0.5) * (resolution - 1));
    if (column < 0 || column >= resolution || row < 0 || row >= resolution) return 0;
    return heights[row * resolution + column];
  };

  for (let attempt = 0; attempt < 900; attempt += 1) {
    const x = (random.next() - 0.5) * size * 0.9;
    const z = (random.next() - 0.5) * size * 0.9;
    const y = worldHeight(x, z);
    if (y < 0.1 || y > 0.62) continue;
    const slope = Math.abs(worldHeight(x + step, z) - worldHeight(x - step, z)) + Math.abs(worldHeight(x, z + step) - worldHeight(x, z - step));
    if (slope > 0.16) continue;
    const spacing = trees.every((tree) => Math.hypot(tree.x - x, tree.z - z) > 0.7);
    if (!spacing) continue;
    trees.push({ x, y, z, scale: 0.75 + random.next() * 0.55, rotation: random.next() * Math.PI * 2 });
  }

  return { seed, size, resolution, heights, bands, trees };
}
