// Shared client side of the sandbox stream.
export interface LiveAgent {
  id: number; name: string; x: number; y: number; z: number; activity: string;
  thought: string; said: string; saidAt: number; thinking: boolean; inventory: string[]; known: string[]; facts: number; knownIds: number[];
  council: number | null; doing: string; outcome: string; skills: string[]; runningSkill: string;
  hyp: { tried: number; right: number; missing: number; untested: number };
  energy: number; sheltered: boolean; collapsed: boolean;
}
export interface LiveState {
  tick: number; running: boolean; mindMode: string; mix: string[]; backends: string[];
  world: { daylight: number; night: boolean; storm: boolean; boar?: { x: number; y: number; z: number } | null; simMs?: number; dayMs?: number; stormIn?: number | null; stormLeft?: number | null }; calls: number; failed: number; perMin: number; cap: number;
  progress: { elements: number; makeable: number; found: number; structures: number; built: number; councils: number; skills: number; recall: Record<string, { first: number; right: number }>; regions: number; explored: number; named: number; hypotheses: number; hypothesesRight: number; hypothesesMissing: number; ideas: number; chemistry: string };
  agents: LiveAgent[]; councilCalls: number; facts: number; mindError: string;
  councils: Array<{ id: number; chair: number; members: number[]; problem: string; mode: string; open: boolean; winner: number | null }>;
}
export interface FeedEvent { seq: number; t: number; type: string; agent?: number; text: string; to?: number[]; data?: Record<string, unknown> }
export interface Hello { seed: number; names: string[]; history: FeedEvent[]; islet?: { x: number; z: number; radius: number } }
export const LEARN = '#5cffc1';
export const GOLD = '#ffd34d';

export function connect(handlers: { hello(h: Hello): void; state(s: LiveState): void; event(e: FeedEvent): void; down(): void }): EventSource {
  const source = new EventSource(new URLSearchParams(location.search).get('silent') === '1' ? '/api/events?silent=1' : '/api/events');
  source.addEventListener('hello', e => handlers.hello(JSON.parse((e as MessageEvent).data)));
  source.addEventListener('state', e => handlers.state(JSON.parse((e as MessageEvent).data)));
  source.addEventListener('event', e => handlers.event(JSON.parse((e as MessageEvent).data)));
  source.onerror = () => handlers.down();
  return source;
}
export const control = (body: Record<string, string | string[]>) =>
  fetch('/api/control', { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
export const COLOURS = ['#ff8a5c', '#ffd35c', '#8be07a', '#5cd6ff', '#9d8bff', '#ff7ac8', '#f2f2f2', '#5cffc1'];
export interface Usage {
  codex: { usedPercent: number; windowMinutes: number; resetsAt: number; plan: string } | null;
  claude: { fiveHourPercent?: number; fiveHourResetsAt?: number; sevenDayPercent?: number; sevenDayResetsAt?: number; asOf: number } | null;
  island: { byBackend: Record<string, number>; calls: number; failed: number; costUsd: number; inputTokens: number; outputTokens: number; perMinute: number; cap: number };
}
export const usage = (): Promise<Usage> => fetch('/api/usage').then(r => r.json());
export const factTexts = (): Promise<string[]> => fetch('/api/facts').then(r => r.json());
export const MIND_LABELS: Record<string, string> = { scripted: 'Scripted', haiku: 'Haiku', sonnet: 'Sonnet', luna: 'Luna', sol: 'Sol' };
export const MIND_COLOURS: Record<string, string> = { scripted: '#55636d', haiku: '#d9a066', sonnet: '#e0785a', luna: '#7cc4e8', sol: '#f2c14e' };
export const MIND_PLAN: Record<string, string> = { scripted: 'no model', haiku: 'Claude', sonnet: 'Claude', luna: 'Codex', sol: 'Codex' };
export const SKILL = '#c49bff';
export interface Places { grid: number; size: number; regions: Array<{ id: number; x: number; y: number; z: number; soil: string; name: string | null; by: number | null; explored: boolean }> }
export const places = (): Promise<Places> => fetch('/api/places').then(r => r.json());
