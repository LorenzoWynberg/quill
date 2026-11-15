import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from './theme';

const html = readFileSync('index.html', 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');
const script = [...doc.head.querySelectorAll('script')].find(
  (s) => !s.hasAttribute('type') && !s.hasAttribute('src'),
);

function run(): void {
  new Function(script!.textContent ?? '')();
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => vi.restoreAllMocks());

describe('pre-paint theme script', () => {
  it('is a classic inline script before any stylesheet or module script', () => {
    expect(script).toBeDefined();
    const blockers = doc.querySelectorAll(
      'head link, head style, head script[src], head script[type]',
    );
    blockers.forEach((el) =>
      expect(
        script!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy(),
    );
    expect(doc.querySelector('script[type=module]')).not.toBeNull();
  });
  it.each(['dark', 'light'])('applies stored %s', (v) => {
    localStorage.setItem(THEME_STORAGE_KEY, v);
    run();
    expect(document.documentElement.dataset.theme).toBe(v);
  });
  it.each([null, 'blue'])('leaves attribute off for %s', (v) => {
    if (v) localStorage.setItem(THEME_STORAGE_KEY, v);
    run();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
  it('does not throw when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(run).not.toThrow();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
