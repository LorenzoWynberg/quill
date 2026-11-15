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

  it.each([
    ['\n', 'LF'],
    ['\r', 'CR'],
    ['\u2028', 'U+2028'],
    ['\u2029', 'U+2029'],
    ['\u0000', 'NUL'],
    ['\u001b', 'ESC'],
    ['\u007f', 'DEL'],
    ['\u0085', 'NEL'],
  ])('rejects a tag holding %j (%s)', (ch) => {
    expect(normaliseTag(`x${ch}y`)).toBeNull();
  });

  it('keeps non-ASCII text and emoji', () => {
    expect(normaliseTag('café')).toBe('café');
    expect(normaliseTag('🚀 go')).toBe('🚀 go');
  });

  it('de-duplicates case-insensitively keeping the first spelling', () => {
    expect(normaliseTags(['Work', 'home', 'work', ' ', 'HOME'])).toEqual([
      'Work',
      'home',
    ]);
    expect(sameTag('A', 'a')).toBe(true);
  });
});
