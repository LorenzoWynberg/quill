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

  it('keeps pending edits through a failed write and a storage event', () => {
    const note = store.create();
    const pend = vi.spyOn(store, 'setPendingLocalEdits');
    const ta = mount();
    type(ta, 'mine');
    const realSet = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    });
    pend.mockClear();
    vi.advanceTimersByTime(300);
    expect(store.getState().writeError).toBe('quota');
    expect(pend).not.toHaveBeenCalledWith(false);
    realSet(
      'quill:v1',
      JSON.stringify([
        { ...note, body: 'theirs', updatedAt: note.updatedAt + 5 },
      ]),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
    expect(ta.value).toBe('mine');
  });

  it('does not flush on visibilitychange while visible', () => {
    store.create();
    const upd = vi.spyOn(store, 'update');
    const pend = vi.spyOn(store, 'setPendingLocalEdits');
    const ta = mount();
    type(ta, 'x');
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(upd).not.toHaveBeenCalled();
    expect(pend).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(300);
    expect(upd).toHaveBeenCalledTimes(1);
  });

  it('cancels the debounce timer after a flush', () => {
    store.create();
    const upd = vi.spyOn(store, 'update');
    const ta = mount();
    type(ta, 'x');
    window.dispatchEvent(new Event('beforeunload'));
    expect(upd).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(upd).toHaveBeenCalledTimes(1);
  });

  it('updates preview and clamps the caret on an external change', () => {
    const note = store.create();
    store.update(note.id, 'one');
    const ta = mount();
    ta.setSelectionRange(1, 1);
    const other = createNotesStore(storage);
    other.update(note.id, 'two-longer');
    window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
    expect(ta.value).toBe('two-longer');
    expect(preview.innerHTML).toBe(renderMarkdown('two-longer'));
    expect(ta.selectionStart).toBe(1);
    ta.setSelectionRange(8, 8);
    const sel = vi.spyOn(ta, 'setSelectionRange');
    other.update(note.id, 'hi');
    window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
    expect(ta.value).toBe('hi');
    expect(ta.selectionStart).toBe(2);
    expect(ta.selectionEnd).toBe(2);
    expect(sel).toHaveBeenCalledWith(2, 2);
  });

  it('returns to the edit pane when Edit is clicked after Preview', () => {
    mount();
    const [edit, prev] = [
      ...(main.querySelector('[role="group"]')?.querySelectorAll('button') ??
        []),
    ];
    prev?.click();
    edit?.click();
    expect(main.dataset.pane).toBe('edit');
    expect(edit?.getAttribute('aria-pressed')).toBe('true');
    expect(prev?.getAttribute('aria-pressed')).toBe('false');
  });

  it('imports only exportNote and types from ../notes, nothing from ../preview', () => {
    const src = readFileSync('src/editor/index.ts', 'utf8');
    const imports = src.match(/^import .*$/gm) ?? [];
    expect(imports).toEqual([
      "import { exportNote, normaliseTag, normaliseTags } from '../notes';",
      "import type { NotesStore } from '../notes';",
    ]);
  });

  it('Export flushes the pending edit and downloads the typed text', async () => {
    store.create();
    let blob: Blob | undefined;
    const order: string[] = [];
    const realUpdate = store.update.bind(store);
    vi.spyOn(store, 'update').mockImplementation((id, body) => {
      order.push('update');
      realUpdate(id, body);
    });
    vi.stubGlobal('URL', {
      createObjectURL: (b: Blob) => {
        order.push('download');
        blob = b;
        return 'blob:x';
      },
      revokeObjectURL: () => {},
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const ta = mount();
    const btn = root.querySelector('button.editor-export') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-label')).toBe('Export note as Markdown');
    type(ta, '# typed');
    vi.advanceTimersByTime(100);
    btn.click();
    expect(order).toEqual(['update', 'download']);
    expect(await blob?.text()).toBe('# typed');
    vi.unstubAllGlobals();
  });

  it('Export is disabled with no note', () => {
    mount();
    expect(
      (root.querySelector('button.editor-export') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('returns a handle whose flush writes a pending edit now', () => {
    const note = store.create();
    const spy = vi.spyOn(store, 'update');
    const handle = mountEditor(root, {
      store,
      render: renderMarkdown,
      previewEl: preview,
    });
    type(root.querySelector('textarea') as HTMLTextAreaElement, 'quick');
    handle.flush();
    expect(spy).toHaveBeenCalledWith(note.id, 'quick');
  });

  it('shows the restored body when an import replaces the open note', () => {
    const note = store.create();
    store.update(note.id, 'old');
    const ta = mount();
    const text = JSON.stringify({
      app: 'quill',
      format: 1,
      notes: [{ id: note.id, body: 'restored', createdAt: 1, updatedAt: 9e15 }],
    });
    expect(store.importBackup(text)).toMatchObject({ ok: true, updated: 1 });
    expect(ta.value).toBe('restored');
  });
});

describe('tag chip field', () => {
  const input = (): HTMLInputElement =>
    root.querySelector('#tag-input') as HTMLInputElement;
  const msgText = (): string =>
    root.querySelector('#tag-msg')?.textContent ?? '';
  const chipTexts = (): string[] =>
    [...root.querySelectorAll('.tag-chip > span')].map(
      (e) => e.textContent ?? '',
    );
  const key = (k: string): KeyboardEvent => {
    const ev = new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
    });
    input().dispatchEvent(ev);
    return ev;
  };
  const typeTag = (v: string): void => type(input() as never, v);
  const tagsOf = (id: string): readonly string[] =>
    store.getState().notes.find((n) => n.id === id)?.tags ?? [];

  it('renders a labelled group after the textarea with chips and input', () => {
    const n = store.create();
    store.setTags(n.id, ['a', 'b']);
    const ta = mount();
    const group = root.querySelector('[role="group"][aria-labelledby]');
    expect(ta.nextElementSibling).toBe(group);
    expect(
      root.querySelector('#' + group?.getAttribute('aria-labelledby'))
        ?.textContent,
    ).toBe('Tags');
    expect(chipTexts()).toEqual(['a', 'b']);
    expect(input().getAttribute('aria-label')).toBe('Add tag');
    expect(input().getAttribute('aria-describedby')).toBe('tag-msg');
    const btn = root.querySelector('.tag-remove') as HTMLElement;
    expect(btn.textContent).toBe('Remove');
    expect(btn.getAttribute('aria-label')).toBe('Remove tag "a"');
  });

  it('commits on Enter without touching the textarea or preview', () => {
    const n = store.create();
    store.update(n.id, '# Hi');
    const ta = mount();
    const before = preview.innerHTML;
    const spy = vi.spyOn(store, 'setTags');
    typeTag('work');
    const ev = key('Enter');
    expect(ev.defaultPrevented).toBe(true);
    expect(spy).toHaveBeenCalledWith(n.id, ['work']);
    expect(chipTexts()).toEqual(['work']);
    expect(input().value).toBe('');
    expect(ta.value).toBe('# Hi');
    expect(preview.innerHTML).toBe(before);
  });

  it('commits on comma, including pasted lists', () => {
    const n = store.create();
    mount();
    typeTag('home,');
    expect(tagsOf(n.id)).toEqual(['home']);
    expect(input().value).toBe('');
    typeTag('a, b');
    expect(tagsOf(n.id)).toEqual(['home', 'a', 'b']);
    expect(input().value).toBe('');
  });

  it('rejects a duplicate and announces it', () => {
    const n = store.create();
    store.setTags(n.id, ['work']);
    mount();
    typeTag(' Work ');
    key('Enter');
    expect(tagsOf(n.id)).toEqual(['work']);
    expect(chipTexts()).toEqual(['work']);
    expect(msgText()).toBe('Already tagged.');
    key('x');
    expect(msgText()).toBe('');
  });

  it('keeps over-long text and ignores whitespace', () => {
    const n = store.create();
    mount();
    typeTag('x'.repeat(33));
    key('Enter');
    expect(tagsOf(n.id)).toEqual([]);
    expect(input().value).toBe('x'.repeat(33));
    expect(msgText()).toBe('Tags can be up to 32 characters.');
    typeTag('   ');
    key('Enter');
    expect(tagsOf(n.id)).toEqual([]);
    expect(msgText()).toBe('');
  });

  it('removes a chip pressed while text is pending without losing the click', () => {
    const n = store.create();
    store.setTags(n.id, ['a', 'b']);
    mount();
    typeTag('pending');
    const spy = vi.spyOn(store, 'setTags');
    const btn = root.querySelector('.tag-remove') as HTMLButtonElement;
    btn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    btn.dispatchEvent(md);
    expect(md.defaultPrevented).toBe(true);
    input().dispatchEvent(new Event('blur'));
    expect(btn.isConnected).toBe(true);
    btn.click();
    expect(tagsOf(n.id)).toEqual(['b']);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(input().value).toBe('pending');
  });

  it('keeps valid pasted parts and leaves the over-long one in the input', () => {
    const n = store.create();
    mount();
    const long = 'x'.repeat(40);
    typeTag('a, b, ' + long);
    expect(tagsOf(n.id)).toEqual(['a', 'b']);
    expect(input().value).toBe(long);
    expect(msgText()).toBe('Tags can be up to 32 characters.');
    key('x');
    expect(msgText()).toBe('');
  });

  describe.each(['quota', 'unavailable'] as const)(
    'failed write (%s)',
    (kind) => {
      it('reverts the chip, keeps the text and announces, then clears', () => {
        const n = store.create();
        mount();
        const orig = storage.setItem.bind(storage);
        let fail = true;
        vi.spyOn(storage, 'setItem').mockImplementation((k, v) => {
          if (fail) {
            throw kind === 'quota'
              ? new DOMException('full', 'QuotaExceededError')
              : new Error('no');
          }
          orig(k, v);
        });
        typeTag('work');
        key('Enter');
        expect(store.getState().writeError).toBe(kind);
        expect(tagsOf(n.id)).toEqual([]);
        expect(chipTexts()).toEqual([]);
        expect(input().value).toBe('work');
        expect(msgText()).toBe(
          'Tag not saved: storage is unavailable or full.',
        );
        fail = false;
        store.update(n.id, 'body');
        expect(msgText()).toBe('');
      });
    },
  );

  it('removes a chip and moves focus to the next Remove, else the input', () => {
    const n = store.create();
    store.setTags(n.id, ['a', 'b']);
    mount();
    (root.querySelectorAll('.tag-remove')[0] as HTMLElement).click();
    expect(tagsOf(n.id)).toEqual(['b']);
    expect(document.activeElement).toBe(root.querySelector('.tag-remove'));
    (root.querySelector('.tag-remove') as HTMLElement).click();
    expect(tagsOf(n.id)).toEqual([]);
    expect(document.activeElement).toBe(input());
  });

  it('Backspace removes the last chip only on an empty input', () => {
    const n = store.create();
    store.setTags(n.id, ['a', 'b']);
    mount();
    typeTag('z');
    key('Backspace');
    expect(tagsOf(n.id)).toEqual(['a', 'b']);
    typeTag('');
    key('Backspace');
    expect(tagsOf(n.id)).toEqual(['a']);
  });

  it('is hidden with no note and follows selection and external changes', () => {
    mount();
    const group = root.querySelector('.tag-field') as HTMLElement;
    expect(group.hidden).toBe(true);
    const a = store.create();
    store.setTags(a.id, ['one']);
    expect(group.hidden).toBe(false);
    typeTag('draft');
    const b = store.create();
    expect(chipTexts()).toEqual([]);
    expect(input().value).toBe('');
    store.select(a.id);
    expect(chipTexts()).toEqual(['one']);
    store.setTags(a.id, ['one', 'two']);
    expect(chipTexts()).toEqual(['one', 'two']);
    expect(b.id).not.toBe(a.id);
  });

  it('commits typed text on blur', () => {
    const n = store.create();
    mount();
    typeTag('later');
    input().dispatchEvent(new Event('blur'));
    expect(tagsOf(n.id)).toEqual(['later']);
  });

  it('styles focus with tokens and no colour literals', () => {
    const css = readFileSync('src/editor/editor.css', 'utf8');
    expect(css).toMatch(/\.tag-field[^{]*:focus-visible/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|oklch\(/i);
  });
});
