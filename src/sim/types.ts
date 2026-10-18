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
