import { afterEach, expect, it, vi } from 'vitest';
import { warmRenderer } from '../src/render/warmup';

afterEach(() => vi.useRealTimers());

it('compiles first and fences every hidden graph before it is ready', async () => {
  const calls: string[] = [];
  await warmRenderer({
    compile: async () => { calls.push('compile'); },
    draws: [() => calls.push('low'), () => calls.push('high')],
    waitForGPU: async () => { calls.push('fence'); }, dispose: vi.fn(),
  });
  expect(calls).toEqual(['compile', 'low', 'fence', 'high', 'fence']);
});

it('bounds a stalled compile and skips draws when it eventually finishes', async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const draw = vi.fn(); const dispose = vi.fn();
  const result = warmRenderer({ compile: () => new Promise<void>((resolve) => { finish = resolve; }),
    draws: [draw], waitForGPU: async () => {}, dispose }, 100);
  const rejection = expect(result).rejects.toThrow('warm-up timed out');
  await vi.advanceTimersByTimeAsync(100);
  await rejection;
  expect(dispose).not.toHaveBeenCalled();
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(draw).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
});

it('bounds a stalled GPU fence and never submits another hidden frame', async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const draw = vi.fn(); const dispose = vi.fn();
  const result = warmRenderer({ compile: async () => {}, draws: [draw, draw],
    waitForGPU: () => new Promise<void>((resolve) => { finish = resolve; }), dispose }, 100);
  const rejection = expect(result).rejects.toThrow('warm-up timed out');
  await vi.advanceTimersByTimeAsync(100);
  await rejection;
  expect(draw).toHaveBeenCalledOnce();
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(draw).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
});

it('propagates compile failure and frees the initialized renderer', async () => {
  const dispose = vi.fn(); const draw = vi.fn();
  await expect(warmRenderer({ compile: async () => { throw new Error('compile failed'); },
    draws: [draw], waitForGPU: async () => {}, dispose })).rejects.toThrow('compile failed');
  expect(draw).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
});
