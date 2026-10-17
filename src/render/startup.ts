export const RENDERER_INIT_TIMEOUT_MS = 4000;
export type InitOutcome = 'ready' | 'timeout' | 'error';

/** Explicit WebGL2 is the last attempt; only automatic selection may fall back. */
export function rendererStartupDecision(forceWebGL: boolean, outcome: InitOutcome): 'use' | 'fallback' | 'fail' {
  if (outcome === 'ready') return 'use';
  return forceWebGL ? 'fail' : 'fallback';
}

interface InitializableRenderer {
  init(): Promise<unknown>;
  dispose(): void;
}

type InitResult<T> = { outcome: 'ready'; renderer: T } | { outcome: 'timeout' | 'error'; error?: unknown };

function disposeAbandoned(renderer: InitializableRenderer): void {
  try {
    renderer.dispose();
  } catch {
    // Failed initialization can leave Three.js without the resources dispose expects.
  }
}

async function attempt<T extends InitializableRenderer>(
  create: (forceWebGL: boolean) => T, forceWebGL: boolean, timeoutMs: number,
): Promise<InitResult<T>> {
  let renderer: T;
  try {
    renderer = create(forceWebGL);
  } catch (error) {
    return { outcome: 'error', error };
  }

  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<InitResult<T>>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve({ outcome: 'timeout' });
    }, timeoutMs);
  });
  const initialized = Promise.resolve().then(() => renderer.init()).then<InitResult<T>, InitResult<T>>(
    () => {
      // Do not dispose mid-init: Three.js can still create resources afterward.
      // Each attempt owns a separate canvas, so late completion cannot take over.
      if (expired) disposeAbandoned(renderer);
      return { outcome: 'ready', renderer };
    },
    (error: unknown) => {
      disposeAbandoned(renderer);
      return { outcome: 'error', error };
    },
  );
  const result = await Promise.race([initialized, deadline]);
  clearTimeout(timer!);
  return result;
}

/** Bound both attempts, including constructor errors, rejection and late results. */
export async function initializeRenderer<T extends InitializableRenderer>(
  create: (forceWebGL: boolean) => T,
  forceWebGL = false,
  timeoutMs = RENDERER_INIT_TIMEOUT_MS,
): Promise<T> {
  let result = await attempt(create, forceWebGL, timeoutMs);
  if (rendererStartupDecision(forceWebGL, result.outcome) === 'fallback') {
    result = await attempt(create, true, timeoutMs);
  }
  if (result.outcome === 'ready') return result.renderer;
  const reason = result.outcome === 'timeout' ? 'timed out' : 'failed';
  throw new Error(`WebGL2 initialization ${reason}. Enable graphics acceleration and reload.`, { cause: result.error });
}
