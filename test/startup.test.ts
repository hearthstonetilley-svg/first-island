import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeRenderer, rendererStartupDecision } from '../src/render/startup';

const renderer = (init = vi.fn(async () => {})) => ({ init, dispose: vi.fn() });

afterEach(() => vi.useRealTimers());

describe('renderer startup decision (pure)', () => {
  it.each([
    [false, 'ready', 'use'], [false, 'timeout', 'fallback'], [false, 'error', 'fallback'],
    [true, 'ready', 'use'], [true, 'timeout', 'fail'], [true, 'error', 'fail'],
  ] as const)('forceWebGL=%s, outcome=%s -> %s', (forceWebGL, outcome, decision) => {
    expect(rendererStartupDecision(forceWebGL, outcome)).toBe(decision);
  });
});

describe('bounded renderer initialization', () => {
  it('keeps a working preferred renderer and cancels its deadline', async () => {
    vi.useFakeTimers();
    const preferred = renderer();
    const create = vi.fn(() => preferred);
    expect(await initializeRenderer(create)).toBe(preferred);
    expect(create).toHaveBeenCalledExactlyOnceWith(false);
    expect(preferred.dispose).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a rejection with a fresh forced-WebGL2 renderer', async () => {
    const preferred = renderer(vi.fn(async () => { throw new Error('adapter rejected'); }));
    const fallback = renderer();
    const create = vi.fn((forceWebGL: boolean) => forceWebGL ? fallback : preferred);
    expect(await initializeRenderer(create)).toBe(fallback);
    expect(create.mock.calls).toEqual([[false], [true]]);
    expect(preferred.dispose).toHaveBeenCalledOnce();
    expect(fallback.dispose).not.toHaveBeenCalled();
  });

  it('falls back after four seconds and safely disposes late WebGPU success', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const preferred = renderer(vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })));
    const fallback = renderer();
    const create = vi.fn((forceWebGL: boolean) => forceWebGL ? fallback : preferred);
    const startup = initializeRenderer(create);
    await vi.advanceTimersByTimeAsync(3999);
    expect(create).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await startup).toBe(fallback);
    expect(create.mock.calls).toEqual([[false], [true]]);
    expect(preferred.dispose).not.toHaveBeenCalled();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(preferred.dispose).toHaveBeenCalledOnce();
    expect(fallback.dispose).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('handles a late rejection without an unhandled promise or harming fallback', async () => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    const preferred = renderer(vi.fn(() => new Promise<void>((_, fail) => { reject = fail; })));
    const fallback = renderer();
    const startup = initializeRenderer((forceWebGL) => forceWebGL ? fallback : preferred);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await startup).toBe(fallback);
    reject(new Error('late adapter failure'));
    await vi.advanceTimersByTimeAsync(0);
    expect(preferred.dispose).toHaveBeenCalledOnce();
    expect(fallback.dispose).not.toHaveBeenCalled();
  });

  it('bounds a hanging fallback as well as a hanging preferred renderer', async () => {
    vi.useFakeTimers();
    const create = vi.fn(() => renderer(vi.fn(() => new Promise<void>(() => {}))));
    const startup = initializeRenderer(create);
    const failure = expect(startup).rejects.toThrow('WebGL2 initialization timed out');
    await vi.advanceTimersByTimeAsync(8000);
    await failure;
    expect(create.mock.calls).toEqual([[false], [true]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry explicit WebGL2, and reports failure for the UI', async () => {
    const create = vi.fn(() => renderer(vi.fn(async () => { throw new Error('no context'); })));
    await expect(initializeRenderer(create, true)).rejects.toThrow('WebGL2 initialization failed');
    expect(create).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('falls back even when constructing the preferred renderer throws', async () => {
    const fallback = renderer();
    expect(await initializeRenderer((forceWebGL) => {
      if (!forceWebGL) throw new Error('construction failed');
      return fallback;
    })).toBe(fallback);
  });
});
