import { Agent, Snapshot } from '../sim/types';

/** One-snapshot interpolation delay; never extrapolate, advance needs, or mutate
 * simulation data. Pausing displays the exact stopped snapshot immediately. */
export class SnapshotBuffer {
  private previous: Snapshot | undefined;
  private current: Snapshot | undefined;
  private receivedAt = 0;
  private durationMs = 1000;
  receive(snapshot: Snapshot, timestamp: number): void {
    this.previous = this.current;
    this.current = snapshot;
    this.receivedAt = timestamp;
    const ticks = this.previous ? snapshot.tick - this.previous.tick : 0;
    this.durationMs = ticks > 0 ? Math.max(1, ticks * 1000 / Math.max(1, snapshot.speed)) : 1;
  }
  sample(timestamp: number): Agent[] {
    if (!this.current) return [];
    const amount = this.current.speed === 0 ? 1 : Math.max(0, Math.min(1, (timestamp - this.receivedAt) / this.durationMs));
    const old = new Map(this.previous?.agents.map(agent => [agent.id, agent]));
    return this.current.agents.map(agent => {
      const before = old.get(agent.id) ?? agent;
      return { ...agent, x: before.x + (agent.x - before.x) * amount,
        y: before.y + (agent.y - before.y) * amount, z: before.z + (agent.z - before.z) * amount };
    });
  }
}
