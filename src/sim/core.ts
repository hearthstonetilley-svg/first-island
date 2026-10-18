import { generateWorld, WorldData } from '../world/generate';
import { Bodies } from './bodies';
import { Dials, Intervention, resolveDials, RunRecord, SimEvent, Snapshot, Speed } from './types';

/** One tick = one simulated second. No timers, DOM, unseeded random or render state. */
export class Simulation {
  readonly world: WorldData;
  readonly initialDials: Dials;
  protected dials: Dials;
  protected tick = 0;
  protected generation = 1;
  protected generationProgress = 0;
  private readonly log: SimEvent[] = [];
  private readonly bodies: Bodies;

  constructor(readonly seed: number, dials: Partial<Dials> = {}, world?: WorldData) {
    this.initialDials = Object.freeze(resolveDials(dials));
    this.dials = { ...this.initialDials };
    this.world = world ?? generateWorld(seed);
    if (this.world.seed !== seed) throw new Error('World seed mismatch');
    this.emit('generation', { generation: 1, seed });
    this.bodies = new Bodies(this.world, this.dials, (type, data) => this.emit(type, data));
  }

  protected emit(type: SimEvent['type'], data: SimEvent['data']): void {
    this.log.push({ seq: this.log.length, tick: this.tick, type, data: structuredClone(data) });
  }

  step(ticks = 1): void {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error('Ticks must be a non-negative integer');
    for (let i = 0; i < ticks; i++) {
      this.tick++;
      this.bodies.step(this.dials, this.tick);
      this.generationProgress += 1 / this.dials.generationSeconds;
      if (this.generationProgress + 1e-10 >= 1) {
        this.generationProgress = Math.max(0, this.generationProgress - 1);
        this.generation++;
        this.emit('generation', { generation: this.generation });
      }
    }
  }

  intervene(change: Intervention): void {
    if (!change || Object.keys(change).length !== 1 || !('dials' in change)
      || !change.dials || typeof change.dials !== 'object') throw new Error('Unknown world intervention');
    if ('startingPopulation' in change.dials) throw new Error('Starting population is a new-run dial');
    this.dials = resolveDials({ ...this.dials, ...change.dials });
    this.emit('intervention', change);
  }

  snapshot(speed: Speed = 1): Snapshot {
    return { tick: this.tick, seconds: this.tick, generation: this.generation,
      speed, dials: { ...this.dials }, eventCount: this.log.length, agents: this.bodies.snapshotAgents(),
      trees: this.bodies.trees.map(tree => ({ ...tree })),
      plants: this.bodies.plants.map(plant => ({ ...plant })), environment: { ...this.bodies.environment },
      stats: structuredClone(this.bodies.stats) };
  }

  /** Canonical plain state for verification, not the lossy rendering snapshot.
   * Static navigation is derived from terrain; all mutable future-affecting body data is included. */
  state(): Record<string, unknown> {
    return { seed: this.seed, initialDials: { ...this.initialDials }, dials: { ...this.dials },
      tick: this.tick, generation: this.generation, generationProgress: this.generationProgress,
      terrain: { size: this.world.size, resolution: this.world.resolution,
        heights: Array.from(this.world.heights), bands: [...this.world.bands] }, bodies: this.bodies.state() };
  }

  record(): RunRecord {
    return { version: 2, seed: this.seed, initialDials: { ...this.initialDials }, ticks: this.tick,
      events: structuredClone(this.log), finalState: this.state() };
  }
}

/** Replay external interventions at their original tick; regenerate and verify every outcome. */
export function replay(record: RunRecord): Simulation {
  if (record.version !== 2 || !Number.isSafeInteger(record.ticks) || record.ticks < 0) throw new Error('Unsupported run');
  const simulation = new Simulation(record.seed, record.initialDials);
  for (let i = 0; i < record.events.length; i++) {
    const event = record.events[i];
    if (event.seq !== i || !Number.isSafeInteger(event.tick) || event.tick < 0 || event.tick > record.ticks
      || (i > 0 && event.tick < record.events[i - 1].tick)) throw new Error('Replay diverged: invalid event order');
  }
  let tick = 0;
  for (const event of record.events) {
    if (event.type !== 'intervention') continue;
    if (!Number.isSafeInteger(event.tick) || event.tick < tick || event.tick > record.ticks) throw new Error('Invalid intervention order');
    simulation.step(event.tick - tick);
    simulation.intervene(event.data as Intervention);
    tick = event.tick;
  }
  simulation.step(record.ticks - tick);
  if (JSON.stringify(simulation.record().events) !== JSON.stringify(record.events)) throw new Error('Replay diverged from event log');
  if (JSON.stringify(simulation.state()) !== JSON.stringify(record.finalState)) throw new Error('Replay state diverged');
  return simulation;
}
