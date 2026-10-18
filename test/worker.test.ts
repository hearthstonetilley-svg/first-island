import { afterEach, expect, it, vi } from 'vitest';
import type { Request, Response } from '../src/sim/protocol';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });
it('logs world-changing renderer messages at their fixed tick, excluding playback and reads', async () => {
  const sent: Response[] = [];
  let schedule: () => void = () => {};
  let now = 0;
  vi.stubGlobal('postMessage', (message: Response) => sent.push(structuredClone(message)));
  vi.stubGlobal('onmessage', undefined);
  vi.stubGlobal('setInterval', (callback: () => void) => { schedule = callback; return 1; });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  await import('../src/sim/worker');
  const message = async (data: Request) => {
    await (globalThis as unknown as { onmessage: (event: { data: Request }) => Promise<void> }).onmessage({ data });
  };
  const record = async () => {
    await message({ type: 'record' });
    const result = sent.at(-1)!;
    if (result.type !== 'record') throw new Error('No record response');
    return result.record;
  };
  await message({ type: 'init', seed: 42 });
  const initial = await record();
  await message({ type: 'running', value: true });
  now = 1000; schedule();
  const live = await record();
  expect(live.ticks).toBe(1);
  await message({ type: 'speed', value: 0 });
  now = 3000; schedule();
  expect(await record()).toEqual(live);
  for (const value of [1, 10, 100, 0] as const) await message({ type: 'speed', value });
  await message({ type: 'running', value: false });
  expect(await record()).toEqual(live);
  await message({ type: 'intervene', change: { dials: { foodRegrowth: 0.5 } } });
  const changed = await record();
  expect(changed.events).toHaveLength(live.events.length + 1);
  expect(changed.events.at(-1)).toEqual({ seq: live.events.length, tick: 1, type: 'intervention', data: { dials: { foodRegrowth: 0.5 } } });
  await message({ type: 'intervene', change: { speed: 100 } } as never);
  expect(sent.at(-1)?.type).toBe('error');
  expect(await record()).toEqual(changed);
  await message({ type: 'init', seed: 7 });
  expect(sent.at(-1)).toEqual({ type: 'error', message: 'A worker owns exactly one run' });
  expect(await record()).toEqual(changed);
  expect(initial.ticks).toBe(0);
});
