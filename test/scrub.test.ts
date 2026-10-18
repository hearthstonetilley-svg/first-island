import { describe, expect, it } from 'vitest';
import { makeScrubber } from '../src/sandbox/scrub';

describe('scrubber', () => {
  it('hides listed terms in any case and keeps the rest', () => {
    const scrub = makeScrubber(['Zorblat Quenn', 'zq@example.test', 'ab']);
    expect(scrub('hello ZORBLAT QUENN, mail zq@example.test now')).toBe('hello [hidden], mail [hidden] now');
    expect(scrub('about the cab')).toBe('about the cab');
    expect(makeScrubber(['seek'])('seeking fruit, I seek')).toBe('seeking fruit, I [hidden]');
  });
  it('passes text through when the list is empty', () => {
    expect(makeScrubber([])('anything')).toBe('anything');
  });
});
