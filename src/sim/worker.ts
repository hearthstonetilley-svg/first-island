import { generateWorldAsync } from '../world/generate';
import { Simulation } from './core';
import { Request, Response } from './protocol';

const send = (message: Response) => postMessage(message);
let simulation: Simulation | undefined;
let running = false;
let accumulatedMs = 0;
let previous = performance.now();
let publishedTick = -1;
const publish = () => {
  if (!simulation) return;
  const snapshot = simulation.snapshot();
  send({ type: 'snapshot', snapshot });
  publishedTick = snapshot.tick;
};
onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === 'init') {
      const world = await generateWorldAsync(data.seed, 256, 64, async (progress) => {
        send({ type: 'progress', progress });
      });
      simulation = new Simulation(data.seed, data.dials, world);
      send({ type: 'ready', world, snapshot: simulation.snapshot() });
    } else if (data.type === 'running') {
      running = data.value;
      previous = performance.now();
    } else if (data.type === 'intervene' && simulation) {
      simulation.intervene(data.change);
      // Pace changes apply prospectively; discard any fractional old-speed tick.
      accumulatedMs = 0;
      previous = performance.now();
      publish();
    } else if (data.type === 'record' && simulation) send({ type: 'record', record: simulation.record() });
  } catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
};
// Only the scheduler reads wall time. Each core step remains exactly one second.
// Catch up in bounded batches without discarding fixed ticks or blocking controls.
setInterval(() => {
  const now = performance.now();
  if (simulation && running) {
    accumulatedMs += (now - previous) * simulation.playbackSpeed;
    const ticks = Math.min(100, Math.floor(accumulatedMs / 1000));
    if (ticks > 0) { simulation.step(ticks); accumulatedMs -= ticks * 1000; }
    if (ticks > 0 || publishedTick < 0) publish();
  }
  previous = now;
}, 50);
