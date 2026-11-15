import { describe, expect, it } from 'vitest';
import { normaliseTag, normaliseTags, sameTag } from './tags';

describe('tags', () => {
  it('trims and rejects empty, comma and over-long tags', () => {
    expect(normaliseTag('  a ')).toBe('a');
    expect(normaliseTag('   ')).toBeNull();
    expect(normaliseTag('a,b')).toBeNull();
    expect(normaliseTag('x'.repeat(33))).toBeNull();
    expect(normaliseTag('x'.repeat(32))).toBe('x'.repeat(32));
  });

  it('de-duplicates case-insensitively keeping the first spelling', () => {
    expect(normaliseTags(['Work', 'home', 'work', ' ', 'HOME'])).toEqual([
      'Work',
      'home',
    ]);
    expect(sameTag('A', 'a')).toBe(true);
  });
});
