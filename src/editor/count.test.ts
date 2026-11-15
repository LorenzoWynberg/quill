import { describe, expect, it } from 'vitest';
import { markdownToPlainText } from '../preview';
import { countCharacters, countWords, formatCount } from './count';

const words = (md: string): number => countWords(markdownToPlainText(md));

describe('count', () => {
  it('counts words ignoring markdown syntax and link targets', () => {
    expect(words('')).toBe(0);
    expect(words('Hello **bold** world')).toBe(3);
    expect(words('# Title\n\n- a\n- b')).toBe(3);
    expect(words('[text](https://example.com/x)')).toBe(1);
    expect(words('```\ncode here\n```\nafter')).toBe(3);
  });
  it('counts characters by code point', () => {
    expect(countCharacters('a😀')).toBe(2);
  });
  it('formats with singular forms', () => {
    expect(formatCount(1, 1)).toBe('1 word · 1 character');
    expect(formatCount(0, 12)).toBe('0 words · 12 characters');
  });
});
