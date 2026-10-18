import { WorldData, WorldProgress } from '../world/generate';
import { Dials, Intervention, RunRecord, Snapshot, Speed } from './types';
export type Request = { type: 'init'; seed: number; dials?: Partial<Dials> }
  | { type: 'running'; value: boolean } | { type: 'speed'; value: Speed } | { type: 'intervene'; change: Intervention }
  | { type: 'record' };
export type Response = { type: 'progress'; progress: WorldProgress }
  | { type: 'ready'; world: WorldData; snapshot: Snapshot }
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'record'; record: RunRecord } | { type: 'error'; message: string };
