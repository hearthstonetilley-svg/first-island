import { WorldData, WorldProgress } from '../world/generate';
import { Request, Response } from './protocol';
import { Intervention, RunRecord, Snapshot } from './types';

export class SimulationClient {
  private readonly worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  snapshot: Snapshot | undefined;
  onSnapshot: ((snapshot: Snapshot) => void) | undefined;
  onError: ((message: string) => void) | undefined;
  private recordRequest: ((record: RunRecord) => void) | undefined;
  private send(message: Request): void { this.worker.postMessage(message); }

  initialize(seed: number, onProgress: (progress: WorldProgress) => void): Promise<WorldData> {
    return new Promise((resolve, reject) => {
      this.worker.onerror = (error) => { reject(new Error(error.message)); this.onError?.(error.message); };
      this.worker.onmessage = ({ data }: MessageEvent<Response>) => {
        if (data.type === 'progress') onProgress(data.progress);
        if (data.type === 'ready' || data.type === 'snapshot') {
          this.snapshot = data.snapshot;
          this.onSnapshot?.(data.snapshot);
          if (data.type === 'ready') resolve(data.world);
        }
        if (data.type === 'record') { this.recordRequest?.(data.record); this.recordRequest = undefined; }
        if (data.type === 'error') { reject(new Error(data.message)); this.onError?.(data.message); }
      };
      this.send({ type: 'init', seed });
    });
  }
  running(value: boolean): void { this.send({ type: 'running', value }); }
  intervene(change: Intervention): void { this.send({ type: 'intervene', change }); }
  record(): Promise<RunRecord> {
    return new Promise((resolve, reject) => {
      if (this.recordRequest) { reject(new Error('A run export is already pending')); return; }
      this.recordRequest = resolve;
      this.send({ type: 'record' });
    });
  }
  dispose(): void { this.worker.terminate(); }
}
