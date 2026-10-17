interface WarmupSteps {
  compile: (isExpired: () => boolean) => Promise<unknown>;
  draws: Array<() => void>;
  waitForGPU: () => Promise<unknown>;
  dispose: () => void;
}

/** Never reveal a canvas while its compile/fence is pending. A stalled async
 * driver gets an error instead of an endless loading label. As with renderer
 * init, release abandoned resources only once the pending operation settles. */
export async function warmRenderer(steps: WarmupSteps, timeoutMs = 30000): Promise<void> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new Error('Renderer warm-up timed out. Reload to retry.'));
    }, timeoutMs);
  });
  const work = (async () => {
    await steps.compile(() => expired);
    for (const draw of steps.draws) {
      if (expired) return;
      draw();
      await steps.waitForGPU();
    }
  })().then(() => { if (expired) steps.dispose(); }, (error: unknown) => {
    steps.dispose();
    throw error;
  });
  try { await Promise.race([work, deadline]); }
  finally { clearTimeout(timer!); }
}
