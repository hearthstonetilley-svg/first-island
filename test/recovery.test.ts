import { expect, it, vi } from 'vitest';
import { SceneRecovery } from '../src/render/recovery';

function scene(label = 'WebGPU') {
  let loss: (() => void) | undefined;
  return { label, dispose: vi.fn(), lose: () => loss?.(),
    onLost: (listener: () => void) => { loss = listener; return () => { loss = undefined; }; } };
}
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

it('retries startup failure on fresh WebGL2 with the same captured world', async () => {
  const world = { seed: 42 }; const worlds: object[] = [];
  const fallback = scene('WebGL2'); const notice = vi.fn(); const ready = vi.fn();
  const create = vi.fn(async (webgl: boolean) => { worlds.push(world); if (!webgl) throw new Error('lost during warmup'); return fallback; });
  const owner = new SceneRecovery(create, false, vi.fn(), notice, ready, vi.fn());
  expect(await owner.start()).toBe(fallback);
  expect(create.mock.calls).toEqual([[false], [true]]);
  expect(worlds).toEqual([world, world]);
  expect(notice).toHaveBeenCalledOnce(); expect(ready).toHaveBeenCalledExactlyOnceWith(fallback);
});

it('stops and disposes a live WebGPU scene before publishing its replacement', async () => {
  const preferred = scene(); const fallback = scene('WebGL2'); const calls: string[] = [];
  preferred.dispose.mockImplementation(() => { calls.push('dispose'); });
  const create = vi.fn(async (gl: boolean) => { calls.push(gl ? 'create GL' : 'create GPU'); return gl ? fallback : preferred; });
  const owner = new SceneRecovery(create, false, () => { calls.push('stop'); }, vi.fn(), s => { calls.push(`ready ${s.label}`); }, vi.fn());
  await owner.start(); preferred.lose(); preferred.lose(); await flush();
  expect(calls).toEqual(['stop','create GPU','ready WebGPU','stop','dispose','stop','create GL','ready WebGL2']);
  expect(create).toHaveBeenCalledTimes(2); expect(preferred.dispose).toHaveBeenCalledOnce();
});

it('handles loss delivered synchronously while the scene is being published', async () => {
  const preferred = scene(); const fallback = scene('WebGL2');
  preferred.onLost = (listener) => { listener(); return () => {}; };
  const ready = vi.fn();
  const owner = new SceneRecovery(async gl => gl ? fallback : preferred, false, vi.fn(), vi.fn(), ready, vi.fn());
  await owner.start(); await flush();
  expect(ready.mock.calls.map(([s]) => s.label)).toEqual(['WebGPU','WebGL2']);
});

it('deduplicates simultaneous frame failure and device-loss notifications', async () => {
  const preferred = scene(); const fallback = scene('WebGL2');
  const create = vi.fn(async gl => gl ? fallback : preferred);
  const owner = new SceneRecovery(create, false, vi.fn(), vi.fn(), vi.fn(), vi.fn());
  await owner.start(); preferred.lose();
  await owner.reportFailure(preferred, new Error('lost fence')); await flush();
  expect(create).toHaveBeenCalledTimes(2);
  await owner.reportFailure(preferred, new Error('late callback'));
  expect(create).toHaveBeenCalledTimes(2);
});

it('surfaces fallback failure without entering a retry loop', async () => {
  const preferred = scene(); const failed = vi.fn();
  const create = vi.fn(async (gl: boolean) => { if (gl) throw new Error('no WebGL context'); return preferred; });
  const owner = new SceneRecovery(create, false, vi.fn(), vi.fn(), vi.fn(), failed);
  await owner.start(); preferred.lose(); await flush();
  expect(failed).toHaveBeenCalledOnce(); expect(create).toHaveBeenCalledTimes(2);
});

it('does not retry an explicitly selected WebGL2 failure', async () => {
  const create = vi.fn(async () => { throw new Error('WebGL unavailable'); });
  const owner = new SceneRecovery(create, true, vi.fn(), vi.fn(), vi.fn(), vi.fn());
  await expect(owner.start()).rejects.toThrow('WebGL unavailable');
  expect(create).toHaveBeenCalledExactlyOnceWith(true);
});
