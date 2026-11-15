import { describe, expect, it } from 'vitest';
import { countCharacters, countWords, formatCount } from './count';

describe('countWords', () => {
  it('is 0 for empty, whitespace and markdown-only bodies', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t ')).toBe(0);
    expect(countWords('# \n\n---\n\n- \n> ')).toBe(0);
  });
  it('ignores inline markers, list bullets and quote markers', () => {
    expect(countWords('# Hello **bold** _it_ ~~gone~~')).toBe(4);
    expect(countWords('- one\n- two\n1. three\n> four')).toBe(4);
  });
  it('does not split words at inline markup or trailing punctuation', () => {
    expect(countWords('This is **important**.')).toBe(3);
    expect(countWords('un**believ**able')).toBe(1);
    expect(countWords('[link](http://x), next')).toBe(2);
  });
  it('keeps link and image text but drops the URL', () => {
    expect(countWords('[click here](https://example.com/a/b)')).toBe(2);
    expect(countWords('![a cat](cat.png)')).toBe(2);
  });
  it('counts code but not fences', () => {
    expect(countWords('```ts\nconst x = 1\n```')).toBe(4);
    expect(countWords('use `npm install` now')).toBe(4);
  });
  it('never fuses adjacent blocks', () => {
    expect(countWords('one\n\ntwo')).toBe(2);
    expect(countWords('a\nb')).toBe(2);
  });
  it('splits on whitespace', () => {
    expect(countWords('a b c')).toBe(3);
  });
});

describe('countCharacters', () => {
  it('counts the raw source by code point', () => {
    expect(countCharacters('😀')).toBe(1);
    expect(countCharacters('# Hi')).toBe(4);
    expect(countCharacters('')).toBe(0);
  });
});

describe('formatCount', () => {
  it('handles singular and plural', () => {
    expect(formatCount('hi')).toBe('1 word · 2 characters');
    expect(formatCount('a')).toBe('1 word · 1 character');
    expect(formatCount('')).toBe('0 words · 0 characters');
  });
});
