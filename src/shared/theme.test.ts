import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyThemeChoice,
  mountThemeControl,
  readThemeChoice,
} from './theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '';
});
afterEach(() => vi.restoreAllMocks());

describe('readThemeChoice', () => {
  it.each([null, 'blue', '', 'Dark'])('falls back to system for %s', (v) => {
    if (v !== null) localStorage.setItem(THEME_STORAGE_KEY, v);
    expect(readThemeChoice()).toBe('system');
  });
  it('returns light and dark', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readThemeChoice()).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(readThemeChoice()).toBe('light');
  });
  it('falls back to system when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readThemeChoice()).toBe('system');
  });
});

describe('applyThemeChoice', () => {
  it('sets and clears attribute and storage', () => {
    applyThemeChoice('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    applyThemeChoice('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyThemeChoice('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
  it('still applies when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => applyThemeChoice('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(() => applyThemeChoice('system')).not.toThrow();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
  it('leaves notes keys untouched', () => {
    const keys = ['quill:v1', 'quill:v1:selected', 'quill:v1:backup:x'];
    keys.forEach((k) => localStorage.setItem(k, k));
    applyThemeChoice('dark');
    applyThemeChoice('light');
    applyThemeChoice('system');
    keys.forEach((k) => expect(localStorage.getItem(k)).toBe(k));
  });
});

describe('mountThemeControl', () => {
  function radios(): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>('input')];
  }
  function choose(value: string): void {
    const input = radios().find((r) => r.value === value)!;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  it('renders a labelled radio group with system checked by default', () => {
    mountThemeControl(document.body);
    expect(document.querySelectorAll('fieldset')).toHaveLength(1);
    expect(document.querySelector('legend')?.textContent).toBe('Theme');
    expect(radios().map((r) => r.value)).toEqual(['light', 'dark', 'system']);
    expect(new Set(radios().map((r) => r.name)).size).toBe(1);
    expect(
      [...document.querySelectorAll('label')].map((l) => l.textContent),
    ).toEqual(['Light', 'Dark', 'System']);
    expect(document.querySelector('svg, img')).toBeNull();
    expect(radios().find((r) => r.checked)?.value).toBe('system');
  });
  it('pre-checks the stored choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    mountThemeControl(document.body);
    expect(radios().find((r) => r.checked)?.value).toBe('dark');
  });
  it('applies on change', () => {
    mountThemeControl(document.body);
    choose('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    choose('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
