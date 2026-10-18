// Shared client side of the sandbox stream.
export interface LiveAgent {
  id: number; name: string; x: number; y: number; z: number; activity: string;
  thought: string; said: string; thinking: boolean; inventory: string[]; known: string[];
}
export interface LiveState {
  tick: number; running: boolean; mindMode: string; calls: number; failed: number; perMin: number; cap: number;
  agents: LiveAgent[];
}
export interface FeedEvent { seq: number; t: number; type: string; agent?: number; text: string; to?: number[] }
export interface Hello { seed: number; names: string[]; history: FeedEvent[] }

export function connect(handlers: { hello(h: Hello): void; state(s: LiveState): void; event(e: FeedEvent): void; down(): void }): EventSource {
  const source = new EventSource('/api/events');
  source.addEventListener('hello', e => handlers.hello(JSON.parse((e as MessageEvent).data)));
  source.addEventListener('state', e => handlers.state(JSON.parse((e as MessageEvent).data)));
  source.addEventListener('event', e => handlers.event(JSON.parse((e as MessageEvent).data)));
  source.onerror = () => handlers.down();
  return source;
}
export const control = (body: Record<string, string>) =>
  fetch('/api/control', { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
export const COLOURS = ['#ff8a5c', '#ffd35c', '#8be07a', '#5cd6ff', '#9d8bff', '#ff7ac8', '#f2f2f2', '#5cffc1'];
