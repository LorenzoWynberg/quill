import { describe, expect, it } from 'vitest';
import { matchesQuery } from './search';

describe('matchesQuery', () => {
  it('matches everything for empty or whitespace queries', () => {
    expect(matchesQuery('anything', '')).toBe(true);
    expect(matchesQuery('anything', '   ')).toBe(true);
  });
  it('is case-insensitive', () => {
    expect(matchesQuery('Hello World', 'world')).toBe(true);
  });
  it('trims the query', () => {
    expect(matchesQuery('Hello', '  hello ')).toBe(true);
  });
  it('matches the derived title for empty and blank-first-line bodies', () => {
    expect(matchesQuery('', 'untitled')).toBe(true);
    expect(matchesQuery('\n\nbody text', 'untitled')).toBe(true);
  });
  it('does not match text found in neither body nor title', () => {
    expect(matchesQuery('Hello', 'zzz')).toBe(false);
  });
});
