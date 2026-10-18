import { describe, expect, it } from 'vitest';
import { markPrediction, readPrediction } from '../src/sandbox/hypothesis';
import { realWorldChemistry } from '../src/sandbox/realworld';

const names = realWorldChemistry().substances.map(s => s.name);
const mark = (p: unknown, actual: string | null) => markPrediction(readPrediction(p, names), actual);

describe('hypothesis marking', () => {
  it('handles the cases the audit showed were wrong', () => {
    expect(mark('not cord', 'cord')).toBe('incorrect');
    expect(mark('no fire', 'fire')).toBe('incorrect');
    expect(mark('fireproof tool', 'fire')).not.toBe('correct');
    expect(mark('rope', 'cord')).toBe('correct');
    expect(mark('not nothing', null)).toBe('incorrect');
  });
  it('handles the confirmation audit cases', () => {
    expect(mark('no change', null)).toBe('correct');
    expect(mark('no reaction', null)).toBe('correct');
    expect(mark('I expect not cord', 'cord')).toBe('incorrect');
    expect(mark('it will not make fire', 'fire')).toBe('incorrect');
    expect(mark('it will not make fire', null)).toBe('correct');
    expect(mark('fire or cord', 'fire')).toBe('missing');
    expect(mark('either sparks or nothing', null)).toBe('missing');
  });
  it('rejects ambiguous clauses instead of guessing (third audit)', () => {
    expect(mark('cord, not fire', 'cord')).toBe('missing');
    expect(mark('it will do nothing', null)).toBe('correct');
    expect(mark('nothing will happen', null)).toBe('correct');
    expect(mark('cord and sparks', 'cord')).toBe('missing');
  });
  it('marks plain predictions', () => {
    expect(mark('sparks', 'sparks')).toBe('correct');
    expect(mark('a spark', 'sparks')).toBe('correct');
    expect(mark('it will make wet clay', 'wet clay')).toBe('correct');
    expect(mark('nothing', null)).toBe('correct');
    expect(mark('nothing', 'ember')).toBe('incorrect');
    expect(mark('fire', 'ember')).toBe('incorrect');
    expect(mark('not glass', null)).toBe('correct');
  });
  it('keeps a real thing the island has no recipe for as untested, never wrong', () => {
    expect(mark('steel', null)).toBe('untested');
    expect(mark('steel', 'sparks')).toBe('incorrect');
  });
  it('counts a missing, malformed or vague prediction as missing, without crashing', () => {
    expect(mark(undefined, 'cord')).toBe('missing');
    expect(mark({ result: 'cord' }, 'cord')).toBe('missing');
    expect(mark(42, null)).toBe('missing');
    expect(mark('', null)).toBe('missing');
    expect(mark('a tool', 'axe')).toBe('missing');
  });
});
