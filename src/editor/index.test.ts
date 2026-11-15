import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '../preview';
import { createNotesStore } from '../notes';
import type { NotesStore } from '../notes';
import { mountEditor } from './index';

function mem(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

let main: HTMLElement;
let root: HTMLElement;
let preview: HTMLElement;
let store: NotesStore;
let storage: Storage;

function mount(s: NotesStore = store): HTMLTextAreaElement {
  mountEditor(root, { store: s, render: renderMarkdown, previewEl: preview });
  return root.querySelector('textarea') as HTMLTextAreaElement;
}

function type(ta: HTMLTextAreaElement, value: string): void {
  ta.value = value;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `<main data-pane="edit"><section id="editor" tabindex="-1"></section><section aria-label="Preview"></section></main>`;
  main = document.querySelector('main') as HTMLElement;
  root = document.querySelector('#editor') as HTMLElement;
  preview = document.querySelector('[aria-label="Preview"]') as HTMLElement;
  storage = mem();
  store = createNotesStore(storage);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('editor', () => {
  it('debounces updates to one write of the latest body at 300ms', () => {
    const note = store.create();
    const spy = vi.spyOn(store, 'update');
    const pend = vi.spyOn(store, 'setPendingLocalEdits');
    const ta = mount();
    type(ta, 'a');
    vi.advanceTimersByTime(200);
    type(ta, 'ab');
    vi.advanceTimersByTime(200);
    expect(spy).not.toHaveBeenCalled();
    expect(pend).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(note.id, 'ab');
    expect(pend).toHaveBeenLastCalledWith(false);
  });

  it('renders the preview immediately on input', () => {
    store.create();
    const ta = mount();
    type(ta, '# Hi');
    expect(preview.innerHTML).toBe(renderMarkdown('# Hi'));
  });

  it('flushes a pending edit to the old note when the selection changes', () => {
    const a = store.create();
    const b = store.create();
    store.select(a.id);
    const ta = mount();
    type(ta, 'for a');
    store.select(b.id);
    expect(store.getState().notes.find((n) => n.id === a.id)?.body).toBe(
      'for a',
    );
    expect(ta.value).toBe('');
    vi.advanceTimersByTime(500);
    expect(store.getState().notes.find((n) => n.id === b.id)?.body).toBe('');
  });

  it('flushes on visibilitychange hidden and beforeunload', () => {
    const note = store.create();
    const ta = mount();
    type(ta, 'x');
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.getState().notes[0]?.body).toBe('x');
    type(ta, 'xy');
    window.dispatchEvent(new Event('beforeunload'));
    expect(store.getState().notes.find((n) => n.id === note.id)?.body).toBe(
      'xy',
    );
  });

  it('has no Save button and labels the textarea "Note"', () => {
    store.create();
    const ta = mount();
    const names = [...document.querySelectorAll('button')].map(
      (b) => b.textContent,
    );
    expect(names.some((n) => /save/i.test(n ?? ''))).toBe(false);
    expect(root.querySelector('label[for="editor-input"]')?.textContent).toBe(
      'Note',
    );
    expect(ta.id).toBe('editor-input');
  });

  it('shows a prompt and hides the textarea with no note, then reveals it', () => {
    const ta = mount();
    expect(ta.hidden).toBe(true);
    expect(root.querySelector('.editor-empty')?.hasAttribute('hidden')).toBe(
      false,
    );
    store.create();
    expect(ta.hidden).toBe(false);
    expect(root.querySelector('.editor-empty')?.hasAttribute('hidden')).toBe(
      true,
    );
  });

  it('applies external changes only when nothing is pending', () => {
    const note = store.create();
    store.update(note.id, 'one');
    const ta = mount();
    expect(ta.value).toBe('one');
    const other = createNotesStore(storage);
    other.update(note.id, 'two');
    window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
    expect(ta.value).toBe('two');
    type(ta, 'mine');
    other.update(note.id, 'three');
    window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
    expect(ta.value).toBe('mine');
  });

  it('keeps the textarea value when the write fails', () => {
    store.create();
    const ta = mount();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    type(ta, 'keep me');
    vi.advanceTimersByTime(300);
    expect(store.getState().writeError).toBe('quota');
    expect(ta.value).toBe('keep me');
  });

  it('toggles panes with aria-pressed', () => {
    mount();
    const group = main.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('View');
    const [edit, prev] = [...(group?.querySelectorAll('button') ?? [])];
    expect(edit?.getAttribute('aria-pressed')).toBe('true');
    prev?.click();
    expect(main.dataset.pane).toBe('preview');
    expect(prev?.getAttribute('aria-pressed')).toBe('true');
    expect(edit?.getAttribute('aria-pressed')).toBe('false');
  });

  it('skip link switches to the edit pane and focuses the textarea', () => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<a class="skip-link" href="#editor">Skip</a>',
    );
    store.create();
    const ta = mount();
    main.dataset.pane = 'preview';
    (document.querySelector('a.skip-link') as HTMLElement).click();
    expect(main.dataset.pane).toBe('edit');
    expect(document.activeElement).toBe(ta);
  });

  it('imports only types from ../notes and nothing from ../preview', () => {
    const src = readFileSync('src/editor/index.ts', 'utf8');
    const imports = src.match(/^import .*$/gm) ?? [];
    expect(imports).toEqual(["import type { NotesStore } from '../notes';"]);
  });
});
