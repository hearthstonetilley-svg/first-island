export interface Dials {
  generationSeconds: number;
  foodRegrowth: number;
  mutationRate: number;
  startingPopulation: number;
  populationCap: number;
}
export const DEFAULT_DIALS: Readonly<Dials> = Object.freeze({
  generationSeconds: 1800, foodRegrowth: 1, mutationRate: 0.04,
  startingPopulation: 20, populationCap: 200,
});
export type Speed = 0 | 1 | 10 | 100;
export type Intervention = { speed: Speed } | { dials: Partial<Dials> };
export interface SimEvent {
  seq: number;
  tick: number;
  type: 'generation' | 'intervention' | 'birth' | 'reproduction' | 'death';
  data: Record<string, unknown>;
}
export interface Snapshot {
  tick: number;
  seconds: number;
  generation: number;
  speed: Speed;
  dials: Dials;
  eventCount: number;
  agents: Agent[];
  plants: Plant[];
  environment: Environment;
  stats: PopulationStats;
}
export interface RunRecord {
  version: 1;
  seed: number;
  initialDials: Dials;
  ticks: number;
  events: SimEvent[];
}
export function resolveDials(patch: Partial<Dials> = {}): Dials {
  const dials = { ...DEFAULT_DIALS, ...patch };
  const ranges: Record<keyof Dials, [number, number]> = {
    generationSeconds: [60, 86400], foodRegrowth: [0, 10], mutationRate: [0, 0.5],
    startingPopulation: [0, 500], populationCap: [1, 1000],
  };
  for (const key of Object.keys(dials) as Array<keyof Dials>) {
    if (!(key in ranges)) throw new Error(`Unknown dial: ${key}`);
    const value = dials[key];
    const [min, max] = ranges[key];
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${key}: ${value}`);
  }
  if (!Number.isInteger(dials.startingPopulation) || !Number.isInteger(dials.populationCap)
    || dials.startingPopulation > dials.populationCap) throw new Error('Population dials must be whole numbers within the cap');
  return dials;
}

export type Activity = 'wandering' | 'seeking food' | 'eating' | 'resting' | 'seeking cover' | 'socialising';
export type DeathCause = 'starvation' | 'exposure' | 'old age' | 'exhaustion';
export interface Traits {
  speed: number; strength: number; perception: number; curiosity: number;
  sociability: number; fertility: number; lifespan: number;
}
export interface Agent {
  id: number; family: number; parents: number[]; generation: number; bornTick: number;
  age: number; biologicalAge: number; x: number; y: number; z: number;
  energy: number; warmth: number; rest: number; health: number;
  activity: Activity; traits: Traits;
}
export interface Plant {
  id: number; x: number; y: number; z: number; nutrition: number;
  quantity: number; capacity: number; regrowth: number; tree: boolean;
}
export interface Environment { daylight: number; rain: number; temperature: number }
export interface PopulationStats { population: number; births: number; deaths: number; deathsByCause: Record<DeathCause, number> }
