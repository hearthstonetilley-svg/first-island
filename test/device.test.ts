import { expect, it, vi } from 'vitest';
import { DeviceLostError, DeviceWatch } from '../src/render/device';

const info = { api: 'WebGPU', message: 'driver reset', reason: 'unknown' };

it('interrupts pending initialization or a GPU fence and rejects later draws', async () => {
  const watch = new DeviceWatch();
  const pending = watch.run(() => new Promise<void>(() => {}));
  const failure = expect(pending).rejects.toBeInstanceOf(DeviceLostError);
  watch.notify(info);
  await failure;
  expect(() => watch.assert()).toThrow('driver reset');
});

it('reports a live loss once and delivers a loss that preceded subscription', () => {
  const watch = new DeviceWatch(); const listener = vi.fn();
  watch.notify(info);
  watch.subscribe(listener);
  watch.notify(info);
  expect(listener).toHaveBeenCalledOnce();
});

it('ignores device events from intentional/abandoned disposal', () => {
  const watch = new DeviceWatch(); const listener = vi.fn();
  watch.subscribe(listener); watch.retire(); watch.notify(info);
  expect(listener).not.toHaveBeenCalled();
  expect(watch.error).toBeUndefined();
  expect(() => watch.assert()).toThrow('retired');
});

it('cannot publish async work that completed after retirement', async () => {
  const watch = new DeviceWatch();
  let finish!: () => void;
  const work = watch.run(() => new Promise<void>((resolve) => { finish = resolve; }));
  const rejection = expect(work).rejects.toThrow('retired');
  watch.retire(); finish(); await rejection;
});
