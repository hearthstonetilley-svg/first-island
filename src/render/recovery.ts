/** Own one scene at a time. Startup and live failures share the same one-way
 * WebGL2 rebuild; concurrent/late loss reports cannot create competing scenes. */
export interface RecoverableScene {
  label: string;
  dispose(): void;
  onLost(listener: () => void): () => void;
}

export class SceneRecovery<T extends RecoverableScene> {
  private current: T | undefined;
  private pending: Promise<T> | undefined;
  private unsubscribe: (() => void) | undefined;
  private forceWebGL: boolean;

  constructor(private readonly create: (forceWebGL: boolean) => Promise<T>, forceWebGL: boolean,
    private readonly stopped: () => void, private readonly notice: () => void,
    private readonly ready: (scene: T) => void, private readonly failed: (error: unknown) => void,
  ) { this.forceWebGL = forceWebGL; }

  start(): Promise<T> {
    if (this.pending) return this.pending;
    this.stopped();
    this.pending = this.build().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async build(): Promise<T> {
    let scene: T;
    try { scene = await this.create(this.forceWebGL); }
    catch (error) {
      if (this.forceWebGL) throw error;
      this.forceWebGL = true;
      this.notice();
      scene = await this.create(true);
    }
    this.current = scene;
    this.ready(scene);
    this.unsubscribe = scene.onLost(() => { void this.recover(scene); });
    return scene;
  }

  reportFailure(scene: T, error: unknown): Promise<void> { return this.recover(scene, error); }

  private async recover(scene: T, error?: unknown): Promise<void> {
    if (this.current !== scene) return;
    this.current = undefined;
    this.unsubscribe?.();
    this.stopped();
    scene.dispose();
    if (this.forceWebGL || scene.label !== 'WebGPU') {
      this.failed(error ?? new Error('WebGL2 graphics context was lost. Reload to retry.'));
      return;
    }
    this.forceWebGL = true;
    this.notice();
    // Even a loss delivered synchronously during publication waits for that
    // publication to finish; start() must not return the dying scene's promise.
    await this.pending?.catch(() => {});
    try { await this.start(); } catch (error) { this.failed(error); }
  }
}
