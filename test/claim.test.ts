import { describe, expect, it } from 'vitest';
import { readClaim } from '../src/sandbox/claim';

const names = new Set(['flint', 'pyrite', 'sparks', 'fire', 'wood', 'driftwood', 'ember', 'dry grass']);
describe('reading a spoken recipe claim', () => {
  it('reads plain claims, either order, with an article', () => {
    expect(readClaim('flint and pyrite make sparks', names)).toEqual({ pair: 'flint + pyrite', product: 'sparks' });
    expect(readClaim('Pyrite + flint makes a sparks.', names)).toEqual({ pair: 'flint + pyrite', product: 'sparks' });
    expect(readClaim('ember with dry grass makes nothing', names)).toEqual({ pair: 'dry grass + ember', product: 'nothing' });
  });
  it('rejects negation instead of reading it as the affirmative', () => {
    expect(readClaim('flint and pyrite makes no sparks', names)).toBeUndefined();
    expect(readClaim('flint and pyrite makes not sparks', names)).toBeUndefined();
    expect(readClaim('flint and pyrite does not make sparks', names)).toBeUndefined();
  });
  it('rejects alternatives', () => {
    expect(readClaim('flint and pyrite makes fire or sparks', names)).toBeUndefined();
    expect(readClaim('flint and pyrite makes fire and sparks', names)).toBeUndefined();
  });
  it('needs whole material names', () => {
    expect(readClaim('ember and driftwood makes fire', names)).toEqual({ pair: 'driftwood + ember', product: 'fire' });
    expect(readClaim('ember and redwood makes fire', names)).toBeUndefined();
    expect(readClaim('flint and pyrite makes sparkses', names)).toBeUndefined();
  });
});
