export interface DeviceLossInfo { api: string; message: string; reason?: string | null }

export class DeviceLostError extends Error {
  constructor(readonly info: DeviceLossInfo) { super(`${info.api} device lost: ${info.message}`); }
}

/** Installed before init. A loss interrupts pending work and also stops a live
 * frame loop; intentional disposal silences only this renderer's late events. */
export class DeviceWatch {
  error: DeviceLostError | undefined;
  private retired = false;
  private rejectLoss!: (error: DeviceLostError) => void;
  private readonly lost = new Promise<never>((_, reject) => { this.rejectLoss = reject; });
  private listener: (() => void) | undefined;

  constructor() { void this.lost.catch(() => {}); }

  notify(info: DeviceLossInfo): void {
    if (this.retired || this.error) return;
    this.error = new DeviceLostError(info);
    this.rejectLoss(this.error);
    this.listener?.();
  }

  subscribe(listener: () => void): () => void {
    this.listener = listener;
    if (this.error) listener();
    return () => { if (this.listener === listener) this.listener = undefined; };
  }

  assert(): void {
    if (this.error) throw this.error;
    if (this.retired) throw new Error('Renderer retired');
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.assert();
    const result = await Promise.race([work(), this.lost]);
    this.assert();
    return result;
  }

  retire(): void { this.retired = true; this.listener = undefined; }
}
