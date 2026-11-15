import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const doc = new DOMParser().parseFromString(
  readFileSync('index.html', 'utf8'),
  'text/html',
);
const content = (sel: string): string | null =>
  doc.querySelector(sel)?.getAttribute('content') ?? null;

describe('index.html metadata', () => {
  it('has a descriptive title', () => {
    expect(doc.title.startsWith('Quill')).toBe(true);
    expect(doc.title.length).toBeGreaterThan('Quill'.length);
  });

  it('has a description and social tags', () => {
    for (const sel of [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]',
    ]) {
      expect(content(sel), sel).toBeTruthy();
    }
    expect(content('meta[property="og:type"]')).toBe('website');
    expect(content('meta[name="twitter:card"]')).toBe('summary');
  });

  it('states no URL or image the repo cannot back', () => {
    expect(doc.querySelector('meta[property="og:url"]')).toBeNull();
    expect(doc.querySelector('meta[property="og:image"]')).toBeNull();
  });
});
