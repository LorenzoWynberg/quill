import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { changedArchiveIds, mountNoteList } from './list';
import * as exportModule from './export';
import { createNotesStore } from './store';
import type { Note, NotesState, NotesStore } from './store';

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

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement('nav');
  document.body.append(root);
});
afterEach(() => {
  root.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('note list', () => {
  it('shows the empty state, then New note creates and selects one', () => {
    const storage = mem();
    const store = createNotesStore(storage);
    mountNoteList(root, store);
    expect(root.querySelectorAll('li')).toHaveLength(0);
    expect(root.textContent).toContain('No notes yet');
    root.querySelector<HTMLButtonElement>('.notes-new')?.click();
    expect(root.querySelectorAll('li')).toHaveLength(1);
    expect(root.querySelector('[aria-current="true"]')?.textContent).toBe(
      'Untitled',
    );
    const reloaded = createNotesStore(storage);
    expect(reloaded.getState().notes).toHaveLength(1);
    expect(reloaded.getState().selectedId).toBe(
      reloaded.getState().notes[0]?.id,
    );
  });

  it('uses native buttons and a descriptive Delete name', () => {
    const store = createNotesStore(mem());
    const note = store.create();
    store.update(note.id, '# Hello');
    mountNoteList(root, store);
    const del = root.querySelector('li .notes-delete');
    expect(del?.tagName).toBe('BUTTON');
    expect(del?.getAttribute('aria-label')).toBe('Delete "Hello"');
    expect(root.querySelector('li .notes-item')?.tagName).toBe('BUTTON');
  });

  it('deletes only when confirmed, with no undo control', () => {
    const storage = mem();
    const store = createNotesStore(storage);
    store.create();
    mountNoteList(root, store);
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    window.confirm = confirm;
    root.querySelector<HTMLButtonElement>('.notes-delete')?.click();
    expect(root.querySelectorAll('li')).toHaveLength(1);
    confirm.mockReturnValue(true);
    root.querySelector<HTMLButtonElement>('.notes-delete')?.click();
    expect(root.querySelectorAll('li')).toHaveLength(0);
    expect(root.textContent?.toLowerCase()).not.toMatch(/undo|trash/);
    expect(createNotesStore(storage).getState().notes).toEqual([]);
  });

  it('shows an alert only while a write error is set', () => {
    const storage = mem();
    const store = createNotesStore(storage);
    mountNoteList(root, store);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('');
    expect(root.querySelector<HTMLElement>('[role="alert"]')?.hidden).toBe(
      true,
    );
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    });
    store.create();
    expect(root.querySelector('[role="alert"]')?.textContent).toMatch(/full/i);
    expect(root.querySelector<HTMLElement>('[role="alert"]')?.hidden).toBe(
      false,
    );
  });

  it('keeps one alert node and its text across updates while an error is set', () => {
    const storage = mem();
    const store = createNotesStore(storage);
    mountNoteList(root, store);
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    });
    const note = store.create();
    const alert = root.querySelector('[role="alert"]');
    const text = alert?.textContent;
    expect(text).toMatch(/full/i);
    for (const body of ['a', 'ab', 'abc']) store.update(note.id, body);
    expect(root.querySelector('[role="alert"]')).toBe(alert);
    expect(alert?.textContent).toBe(text);
  });

  it('keeps focus on the same control across re-renders', () => {
    const store = createNotesStore(mem());
    store.create();
    mountNoteList(root, store);
    const btn = root.querySelector<HTMLButtonElement>('.notes-item');
    btn?.focus();
    btn?.click();
    expect(document.activeElement?.className).toBe('notes-item');
  });

  it('Export all is disabled with no notes, then flushes and downloads a zip', () => {
    const store = createNotesStore(mem());
    const before = vi.fn();
    const names: string[] = [];
    const order: string[] = [];
    before.mockImplementation(() => order.push('before'));
    vi.stubGlobal('URL', {
      createObjectURL: () => {
        order.push('download');
        return 'blob:x';
      },
      revokeObjectURL: () => {},
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    mountNoteList(root, store, { beforeExport: before });
    const btn = (): HTMLButtonElement =>
      root.querySelector('.notes-export') as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    expect(btn().getAttribute('aria-label')).toBe('Export all notes as .zip');
    store.create();
    expect(btn().disabled).toBe(false);
    btn().focus();
    const other = store.create();
    store.update(other.id, 'changed elsewhere');
    expect(document.activeElement).toBe(btn());
    btn().click();
    expect(order).toEqual(['before', 'download']);
    expect(names[0]).toMatch(/^quill-notes-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(document.activeElement).toBe(btn());
  });

  describe('backup and restore', () => {
    const backupFile = (notes: unknown[]) =>
      new File([JSON.stringify({ app: 'quill', format: 1, notes })], 'b.json');
    const choose = async (file: File): Promise<HTMLInputElement> => {
      const input = root.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: [file],
        configurable: true,
      });
      input.dispatchEvent(new Event('change'));
      await vi.waitFor(() =>
        expect(root.querySelector('[role="status"]')?.textContent).not.toBe(''),
      );
      return input;
    };

    it('renders native buttons in order and keeps focus', () => {
      const store = createNotesStore(mem());
      mountNoteList(root, store);
      const labels = [...root.querySelectorAll('.notes-actions button')].map(
        (b) => [b.tagName, b.getAttribute('type'), b.textContent],
      );
      expect(labels).toEqual([
        ['BUTTON', 'button', 'New note'],
        ['BUTTON', 'button', 'Export all'],
        ['BUTTON', 'button', 'Backup'],
        ['BUTTON', 'button', 'Restore'],
      ]);
      root.querySelector<HTMLElement>('[data-focus="backup"]')?.focus();
      store.create();
      expect((document.activeElement as HTMLElement).dataset.focus).toBe(
        'backup',
      );
    });

    it('downloads a dated JSON blob and revokes the URL', () => {
      const store = createNotesStore(mem());
      store.create();
      const create = vi.fn(() => 'blob:x');
      const revoke = vi.fn();
      vi.stubGlobal('URL', {
        createObjectURL: create,
        revokeObjectURL: revoke,
      });
      let name = '';
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
        function (this: HTMLAnchorElement) {
          name = this.download;
        },
      );
      const confirm = vi.fn(() => true);
      window.confirm = confirm;
      mountNoteList(root, store);
      root.querySelector<HTMLElement>('[data-focus="backup"]')?.click();
      const blob = (create.mock.calls[0] as unknown as [Blob])[0];
      expect(blob.type).toBe('application/json');
      expect(name).toMatch(/^quill-backup-\d{4}-\d{2}-\d{2}\.json$/);
      expect(revoke).toHaveBeenCalledWith('blob:x');
      expect(confirm).not.toHaveBeenCalled();
    });

    it('restores with counts, calling beforeRestore first', async () => {
      const store = createNotesStore(mem());
      const order: string[] = [];
      const orig = store.importBackup;
      store.importBackup = (t) => {
        order.push('import');
        return orig(t);
      };
      mountNoteList(root, store, { beforeRestore: () => order.push('before') });
      const input = await choose(
        backupFile([{ id: 'a', body: '# Hi', createdAt: 1, updatedAt: 2 }]),
      );
      expect(root.querySelector('[role="status"]')?.textContent).toBe(
        'Restore complete: added 1, updated 0, unchanged 0.',
      );
      expect(order).toEqual(['before', 'import']);
      expect(root.querySelectorAll('li')).toHaveLength(1);
      expect(input.value).toBe('');
    });

    it('reports an invalid file and changes nothing', async () => {
      const store = createNotesStore(mem());
      store.create();
      const before = store.getState();
      mountNoteList(root, store);
      await choose(new File(['nope'], 'b.json'));
      expect(root.querySelector('[role="status"]')?.textContent).toBe(
        'Restore failed: this is not a valid Quill backup. Nothing was changed.',
      );
      expect(store.getState().notes).toEqual(before.notes);
      expect(store.getState().selectedId).toBe(before.selectedId);
    });

    it('reports a write failure from the store', async () => {
      const store = createNotesStore(mem());
      store.importBackup = () => ({ ok: false, reason: 'write' });
      mountNoteList(root, store);
      await choose(backupFile([]));
      expect(root.querySelector('[role="status"]')?.textContent).toBe(
        'Restore failed: notes could not be saved. Nothing was changed.',
      );
    });

    it('reports an unreadable file without calling the store', async () => {
      const store = createNotesStore(mem());
      const spy = vi.spyOn(store, 'importBackup');
      mountNoteList(root, store);
      const file = new File(['x'], 'b.json');
      Object.defineProperty(file, 'text', {
        value: () => Promise.reject(new Error('read')),
      });
      await choose(file);
      expect(root.querySelector('[role="status"]')?.textContent).toBe(
        'Restore failed: the file could not be read. Nothing was changed.',
      );
      expect(spy).not.toHaveBeenCalled();
    });

    it('aborts and says so when beforeRestore throws', async () => {
      const store = createNotesStore(mem());
      const spy = vi.spyOn(store, 'importBackup');
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      mountNoteList(root, store, {
        beforeRestore: () => {
          throw new Error('flush');
        },
      });
      await choose(backupFile([]));
      expect(root.querySelector('[role="status"]')?.textContent).toBe(
        'Restore cancelled: your open note could not be saved first. Nothing was changed.',
      );
      expect(spy).not.toHaveBeenCalled();
      expect(err).toHaveBeenCalled();
    });

    it('does not claim nothing changed when the store throws', async () => {
      const store = createNotesStore(mem());
      store.importBackup = () => {
        throw new Error('boom');
      };
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      mountNoteList(root, store);
      await choose(backupFile([]));
      expect(root.querySelector('[role="status"]')?.textContent).toBe(
        'Restore failed unexpectedly. Check your notes before trying again.',
      );
      expect(err).toHaveBeenCalled();
    });
  });

  describe('search', () => {
    const type = (value: string) => {
      const i = root.querySelector<HTMLInputElement>('.notes-search-input')!;
      i.value = value;
      i.dispatchEvent(new Event('input'));
      return i;
    };
    const titles = () =>
      [...root.querySelectorAll('.notes-item')].map((b) => b.textContent);
    const seed = () => {
      const store = createNotesStore(mem());
      for (const body of ['# Apple', '# Banana', 'misc\napple pie']) {
        store.update(store.create().id, body);
      }
      return store;
    };

    it('has an accessible input between actions and the list', () => {
      mountNoteList(root, seed());
      const i = root.querySelector('.notes-search-input')!;
      expect(i.getAttribute('aria-label')).toBe('Search notes');
      expect(
        root.querySelector('.notes-actions')!.compareDocumentPosition(i) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        i.compareDocumentPosition(root.querySelector('.notes-list')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('filters by title or body, case-insensitively and trimmed', () => {
      mountNoteList(root, seed());
      type('  APPLE ');
      expect(titles()).toHaveLength(2);
      type('banana');
      expect(titles()).toEqual(['Banana']);
    });

    it('keeps the input node, focus and filter across emits', () => {
      const store = seed();
      mountNoteList(root, store);
      const i = type('apple');
      i.focus();
      store.update(store.getState().notes[0]!.id, '# Apple 2');
      expect(root.querySelector('.notes-search-input')).toBe(i);
      expect(document.activeElement).toBe(i);
      expect(i.value).toBe('apple');
      expect(titles()).toHaveLength(2);
    });

    it('keeps the input node, focus and filter across external emits', () => {
      const storage = mem();
      const store = createNotesStore(storage);
      store.update(store.create().id, '# Apple');
      mountNoteList(root, store);
      const i = type('apple');
      i.focus();
      const note = (id: string, body: string) => ({
        id,
        body,
        createdAt: 1,
        updatedAt: 99,
      });
      storage.setItem(
        'quill:v1',
        JSON.stringify([note('a', 'Apple external'), note('b', 'Banana')]),
      );
      window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
      expect(root.querySelector('.notes-search-input')).toBe(i);
      expect(document.activeElement).toBe(i);
      expect(i.value).toBe('apple');
      expect(titles()).toEqual(['Apple external']);
    });

    it('drops a hidden query when the last note is deleted', () => {
      const store = createNotesStore(mem());
      store.update(store.create().id, '# Apple');
      mountNoteList(root, store);
      type('zzz');
      store.remove(store.getState().notes[0]!.id);
      expect(root.querySelector('.notes-no-match')).toBeNull();
      expect(root.textContent).toContain('No notes yet');
    });

    it('Clear is hidden until a query exists, then restores the list', () => {
      mountNoteList(root, seed());
      const clear = root.querySelector<HTMLButtonElement>(
        '.notes-search-clear',
      )!;
      expect(clear.hidden).toBe(true);
      const i = type('banana');
      expect(clear.hidden).toBe(false);
      clear.click();
      expect(i.value).toBe('');
      expect(titles()).toHaveLength(3);
      expect(document.activeElement).toBe(i);
    });

    it('Escape clears the query', () => {
      mountNoteList(root, seed());
      const i = type('banana');
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(i.value).toBe('');
      expect(titles()).toHaveLength(3);
    });

    it('shows a status line on no match, not the first-run text', () => {
      mountNoteList(root, seed());
      type(' zzz ');
      expect(root.querySelector('.notes-list')).toBeNull();
      expect(root.querySelector('.notes-no-match')?.textContent).toBe(
        'No notes match "zzz"',
      );
      expect(
        root
          .querySelector('.notes-no-match')
          ?.parentElement?.getAttribute('role'),
      ).toBe('status');
      expect(root.textContent).not.toContain('No notes yet');
    });

    it('announces the result count while a query is active', () => {
      mountNoteList(root, seed());
      const status = () =>
        root.querySelector('.notes-search-status')?.textContent;
      expect(status()).toBe('');
      const i = type('banana');
      expect(status()).toBe('1 note matches "banana"');
      type('apple');
      expect(status()).toBe('2 notes match "apple"');
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(status()).toBe('');
      type('   ');
      expect(status()).toBe('');
    });

    it('announces the trimmed query and recovers from a no-match line', () => {
      mountNoteList(root, seed());
      const status = () =>
        root.querySelector('.notes-search-status')?.textContent;
      type('  apple ');
      expect(status()).toBe('2 notes match "apple"');
      type('zzz');
      expect(status()).toContain('No notes match "zzz"');
      type('banana');
      expect(status()).toBe('1 note matches "banana"');
    });

    it('drops the no-match line when the query matches again, is cleared or escaped', () => {
      mountNoteList(root, seed());
      const noMatch = () => root.querySelector('.notes-no-match');
      const i = type('zzz');
      expect(noMatch()).not.toBeNull();
      type('banana');
      expect(noMatch()).toBeNull();
      expect(titles().length).toBeGreaterThan(0);
      type('zzz');
      root.querySelector<HTMLButtonElement>('.notes-search-clear')!.click();
      expect(noMatch()).toBeNull();
      expect(titles()).toHaveLength(3);
      type('zzz');
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(noMatch()).toBeNull();
      expect(titles()).toHaveLength(3);
    });

    it('hides search with zero notes and keeps first-run text', () => {
      mountNoteList(root, createNotesStore(mem()));
      expect(root.querySelector<HTMLElement>('.notes-search')!.hidden).toBe(
        true,
      );
      expect(root.textContent).toContain('No notes yet');
      expect(root.querySelector('.notes-no-match')).toBeNull();
    });

    it('New note clears the query and selects the new note', () => {
      const store = seed();
      mountNoteList(root, store);
      const i = type('banana');
      root.querySelector<HTMLButtonElement>('.notes-new')!.click();
      expect(i.value).toBe('');
      expect(root.querySelector('[aria-current="true"]')?.textContent).toBe(
        'Untitled',
      );
    });

    it('filtering does not change the selection, and Export gets all notes', () => {
      const store = seed();
      const selected = store.getState().selectedId;
      const spy = vi.spyOn(exportModule, 'exportAllNotes').mockReturnValue();
      mountNoteList(root, store);
      type('banana');
      expect(store.getState().selectedId).toBe(selected);
      const btn = root.querySelector<HTMLButtonElement>('.notes-export')!;
      expect(btn.disabled).toBe(false);
      btn.click();
      expect(spy.mock.calls[0]![0]).toHaveLength(3);
    });
  });

  describe('star toggle', () => {
    it('renders an accessible toggle, reorders on click and keeps focus', () => {
      const storage = mem();
      const store = createNotesStore(storage);
      const a = store.create();
      store.update(a.id, '# Alpha');
      const b = store.create();
      store.update(b.id, '# Beta');
      mountNoteList(root, store);
      const items = () =>
        [...root.querySelectorAll('li .notes-item')].map((e) => e.textContent);
      expect(items()).toEqual(['Beta', 'Alpha']);
      const star =
        root.querySelectorAll<HTMLButtonElement>('li .notes-star')[1]!;
      expect(star.type).toBe('button');
      expect(star.getAttribute('aria-pressed')).toBe('false');
      expect(star.getAttribute('aria-label')).toBe('Star "Alpha"');
      expect(star.querySelector('span')?.getAttribute('aria-hidden')).toBe(
        'true',
      );
      expect(star.textContent).toBe('☆');
      star.focus();
      star.click();
      expect(items()).toEqual(['Alpha', 'Beta']);
      const now = root.querySelector<HTMLButtonElement>('li .notes-star')!;
      expect(now.getAttribute('aria-pressed')).toBe('true');
      expect(now.textContent).toBe('★');
      expect(document.activeElement).toBe(now);
      expect(store.getState().selectedId).toBe(b.id);
    });

    it('uses theme tokens only for the star rules', () => {
      const css = readFileSync('src/notes/list.css', 'utf8');
      const rules = css.match(/\.notes-star[^{]*\{[^}]*\}/g) ?? [];
      expect(rules.join('')).toContain(':focus-visible');
      expect(rules.join('')).not.toMatch(/#[0-9a-f]{3,6}\b|rgb|hsl|oklch/i);
    });
  });
  describe('tag filter', () => {
    function seed() {
      const store = createNotesStore(mem());
      const a = store.create();
      store.update(a.id, '# Alpha');
      store.setTags(a.id, ['Work']);
      const b = store.create();
      store.update(b.id, '# Beta');
      store.setTags(b.id, ['work', 'home']);
      const c = store.create();
      store.update(c.id, '# Gamma');
      return { store, a, b, c };
    }
    const select = () =>
      root.querySelector<HTMLSelectElement>('.notes-tag-select')!;
    const clear = () =>
      root.querySelector<HTMLButtonElement>('.notes-tag-clear')!;
    const items = () =>
      [...root.querySelectorAll('li .notes-item')].map((e) => e.textContent);
    const pick = (v: string) => {
      select().value = v;
      select().dispatchEvent(new Event('change', { bubbles: true }));
    };

    it('lists All tags then distinct tags case-insensitively; hidden with no tags', () => {
      const empty = createNotesStore(mem());
      empty.create();
      mountNoteList(root, empty);
      expect(root.querySelector<HTMLElement>('.notes-tag-filter')?.hidden).toBe(
        true,
      );
      root.replaceChildren();
      const { store } = seed();
      mountNoteList(root, store);
      const opts = [...select().options].map((o) => [o.value, o.textContent]);
      expect(opts).toHaveLength(3);
      expect(opts[0]).toEqual(['', 'All tags']);
      expect(opts.slice(1).map((o) => o[1])).toEqual(['home', 'work']);
    });

    it('keeps the select on the canonical spelling when the first spelling goes away', () => {
      const { store, b } = seed();
      mountNoteList(root, store);
      pick('work');
      store.setTags(b.id, []);
      expect(select().value).toBe('Work');
      expect(items()).toEqual(['Alpha']);
    });

    it('lists starred notes first, each group by updatedAt descending', () => {
      const { store, a, b } = seed();
      store.setStarred(a.id, true);
      mountNoteList(root, store);
      pick([...select().options][2]!.value);
      expect(items()).toEqual(['Alpha', 'Beta']);
      store.setStarred(a.id, false);
      store.setStarred(b.id, true);
      expect(items()).toEqual(['Beta', 'Alpha']);
    });

    it('keeps focus on the select after a store change', () => {
      const { store, c } = seed();
      mountNoteList(root, store);
      select().focus();
      store.setTags(c.id, ['misc']);
      expect(document.activeElement).toBe(select());
    });

    it('filters, composes with search, clears, and keeps focus', () => {
      const { store } = seed();
      mountNoteList(root, store);
      expect(clear().hidden).toBe(true);
      select().focus();
      pick('work');
      expect(items().sort()).toEqual(['Alpha', 'Beta']);
      expect(clear().type).toBe('button');
      expect(clear().hidden).toBe(false);
      expect(document.activeElement).toBe(select());
      const search = root.querySelector<HTMLInputElement>(
        '.notes-search-input',
      )!;
      search.value = 'beta';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      expect(items()).toEqual(['Beta']);
      search.value = 'gamma';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      expect(root.textContent).toContain(
        'No notes tagged "work" match "gamma"',
      );
      expect(clear().hidden).toBe(false);
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      clear().click();
      expect(items()).toHaveLength(3);
      expect(select().value).toBe('');
      expect(document.activeElement).toBe(select());
    });

    it('shows a tag-only empty state, Escape clears, and a stale tag resets', () => {
      const { store, a, b } = seed();
      mountNoteList(root, store);
      pick('home');
      store.setTags(b.id, []);
      expect(select().value).toBe('');
      expect(items()).toHaveLength(3);
      store.setTags(a.id, ['Work']);
      pick('work');
      select().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(select().value).toBe('');
      expect(items()).toHaveLength(3);
    });

    it('keeps selection, is not persisted, and New note clears it', () => {
      const storage = mem();
      const store = createNotesStore(storage);
      const a = store.create();
      store.update(a.id, '# Alpha');
      store.setTags(a.id, ['home']);
      const c = store.create();
      store.update(c.id, '# Gamma');
      store.select(c.id);
      mountNoteList(root, store);
      const setItem = vi.spyOn(storage, 'setItem');
      pick('home');
      expect(store.getState().selectedId).toBe(c.id);
      expect(root.querySelector('[aria-current="true"]')).toBeNull();
      expect(setItem).not.toHaveBeenCalled();
      const second = document.createElement('nav');
      document.body.append(second);
      mountNoteList(second, store);
      expect(second.querySelector<HTMLSelectElement>('select')!.value).toBe('');
      expect(second.querySelectorAll('li .notes-item')).toHaveLength(2);
      second.remove();
      root.querySelector<HTMLButtonElement>('.notes-new')?.click();
      expect(select().value).toBe('');
      expect(items()).toContain('Untitled');
    });

    it('styles both controls with focus rings and theme tokens only', () => {
      const css = readFileSync('src/notes/list.css', 'utf8');
      const rules = css.match(/\.notes-tag-[^{]*\{[^}]*\}/g) ?? [];
      const joined = rules.join('');
      expect(joined).toContain('.notes-tag-select:focus-visible');
      expect(joined).toContain('.notes-tag-clear:focus-visible');
      expect(joined).not.toMatch(/#[0-9a-f]{3,6}\b|rgb|hsl|oklch/i);
    });
  });
});

describe('archived views', () => {
  function seed() {
    const store = createNotesStore(mem());
    const a = store.create();
    store.update(a.id, '# Alpha');
    const b = store.create();
    store.update(b.id, '# Beta');
    const c = store.create();
    store.update(c.id, '# Gamma');
    return { store, a, b, c };
  }
  const btn = (label: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === label,
    )!;
  const titles = () =>
    [...root.querySelectorAll('li .notes-item')].map((e) => e.textContent);

  it('toggles views with a count and aria-pressed, starting on Notes', () => {
    const { store, a } = seed();
    store.setArchived(a.id, true);
    mountNoteList(root, store);
    const group = root.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Note views');
    expect(btn('Notes').getAttribute('aria-pressed')).toBe('true');
    expect(btn('Archived (1)').getAttribute('aria-pressed')).toBe('false');
    expect(titles()).not.toContain('Alpha');
    btn('Archived (1)').click();
    expect(btn('Archived (1)').getAttribute('aria-pressed')).toBe('true');
    expect(titles()).toEqual(['Alpha']);
  });

  it('orders archived notes by archivedAt desc, ignoring stars', () => {
    const { store, a, b, c } = seed();
    store.setStarred(a.id, true);
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    store.setArchived(a.id, true);
    vi.spyOn(Date, 'now').mockReturnValue(2_000);
    store.setArchived(b.id, true);
    vi.spyOn(Date, 'now').mockReturnValue(3_000);
    store.setArchived(c.id, true);
    mountNoteList(root, store);
    btn('Archived (3)').click();
    expect(titles()).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('Archive needs no confirm; Restore returns the note; Delete confirms', () => {
    const { store } = seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mountNoteList(root, store);
    root.querySelector<HTMLButtonElement>('.notes-archive')?.click();
    expect(confirm).not.toHaveBeenCalled();
    expect(store.getState().notes.some((n) => n.archivedAt)).toBe(true);
    btn('Archived (1)').click();
    root.querySelector<HTMLButtonElement>('.notes-delete')?.click();
    expect(confirm).toHaveBeenCalled();
    expect(store.getState().notes).toHaveLength(3);
    expect(root.querySelectorAll('.notes-restore')).toHaveLength(1);
    expect(btn('Restore').className).toBe('notes-secondary');
    root.querySelector<HTMLButtonElement>('.notes-restore')?.click();
    expect(store.getState().notes.every((n) => !n.archivedAt)).toBe(true);
    expect(root.querySelector('.notes-empty')?.textContent).toBe(
      'No archived notes.',
    );
  });

  it('scopes search to the view and keeps the query across switches', () => {
    const { store, a } = seed();
    store.setArchived(a.id, true);
    mountNoteList(root, store);
    const search = root.querySelector<HTMLInputElement>('.notes-search-input')!;
    search.value = 'Alpha';
    search.dispatchEvent(new Event('input'));
    expect(titles()).toEqual([]);
    btn('Archived (1)').click();
    expect(search.value).toBe('Alpha');
    expect(titles()).toEqual(['Alpha']);
  });

  it('moves focus to a neighbour, or the view toggle when none is left', () => {
    const { store } = seed();
    mountNoteList(root, store);
    const first = root.querySelector<HTMLButtonElement>('.notes-archive')!;
    first.focus();
    first.click();
    expect(document.activeElement?.className).toBe('notes-archive');
    root.querySelector<HTMLButtonElement>('.notes-archive')!.focus();
    root.querySelector<HTMLButtonElement>('.notes-archive')!.click();
    root.querySelector<HTMLButtonElement>('.notes-archive')!.focus();
    root.querySelector<HTMLButtonElement>('.notes-archive')!.click();
    expect((document.activeElement as HTMLElement).dataset.focus).toBe(
      'view:notes',
    );
  });

  it('announces archive and restore in one persistent live region', () => {
    const { store } = seed();
    mountNoteList(root, store);
    const live = root.querySelector('.notes-live') as HTMLElement;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.getAttribute('role')).toBeNull();
    root.querySelector<HTMLButtonElement>('.notes-archive')!.click();
    expect(root.querySelector('.notes-live')).toBe(live);
    expect(live.textContent).toMatch(/^Archived "\w+"\. Archived \(1\)\.$/);
    btn('Archived (1)').click();
    root.querySelector<HTMLButtonElement>('.notes-restore')!.click();
    expect(live.textContent).toMatch(/^Restored "\w+"\. Archived \(0\)\.$/);
  });

  it('ignores a stale Archive click and leaves focus alone', () => {
    const { store, a } = seed();
    mountNoteList(root, store);
    const stale = [
      ...root.querySelectorAll<HTMLButtonElement>('.notes-archive'),
    ].find((b) => b.dataset.focus === `archive:${a.id}`)!;
    store.setArchived(a.id, true);
    const live = root.querySelector('.notes-live') as HTMLElement;
    live.textContent = '';
    stale.click();
    expect(live.textContent).toBe('');
    const search = root.querySelector<HTMLInputElement>('.notes-search-input')!;
    search.focus();
    store.create();
    expect(document.activeElement).toBe(search);
  });

  it('moves focus to New note when a deleted row vanishes', () => {
    const store = createNotesStore(mem());
    const n = store.create();
    store.update(n.id, '# Only');
    mountNoteList(root, store);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const del = root.querySelector<HTMLButtonElement>('.notes-delete')!;
    del.focus();
    del.click();
    expect((document.activeElement as HTMLElement).dataset.focus).toBe('new');
  });

  it('keeps New note and Export all working from Archived', () => {
    const { store } = seed();
    store.setArchivedMany(
      store.getState().notes.map((n) => n.id),
      true,
    );
    const exp = vi
      .spyOn(exportModule, 'exportAllNotes')
      .mockImplementation(() => undefined);
    mountNoteList(root, store);
    expect(root.querySelector('.notes-empty')?.textContent).toContain(
      'No notes yet',
    );
    expect(
      root.querySelector<HTMLButtonElement>('.notes-export')?.disabled,
    ).toBe(false);
    btn('Archived (3)').click();
    root.querySelector<HTMLButtonElement>('.notes-export')?.click();
    expect(exp).toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('.notes-new')?.click();
    expect(btn('Notes').getAttribute('aria-pressed')).toBe('true');
    expect(titles()).toEqual(['Untitled']);
  });

  it('updates the count on an external storage change and starts fresh on Notes', () => {
    const storage = mem();
    const store = createNotesStore(storage);
    store.update(store.create().id, '# One');
    mountNoteList(root, store);
    btn('Archived (0)').click();
    const setItem = vi.spyOn(storage, 'setItem');
    const note = (id: string, archivedAt?: number) => ({
      id,
      body: `# ${id}`,
      createdAt: 1,
      updatedAt: 2,
      ...(archivedAt ? { archivedAt } : {}),
    });
    storage.setItem(
      'quill:v1',
      JSON.stringify([note('a', 5), note('b', 6), note('c')]),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
    expect(btn('Archived (2)')).toBeTruthy();
    setItem.mockClear();
    const second = document.createElement('nav');
    document.body.append(second);
    mountNoteList(second, store);
    const pressed = (label: string) =>
      [...second.querySelectorAll('button')]
        .find((b) => b.textContent === label)
        ?.getAttribute('aria-pressed');
    expect(pressed('Notes')).toBe('true');
    expect(pressed('Archived (2)')).toBe('false');
    expect(setItem).not.toHaveBeenCalled();
    second.remove();
  });

  it('labels Archive and Restore per note, next to Delete, and selects from Archived', () => {
    const { store, a } = seed();
    mountNoteList(root, store);
    const row = root.querySelector('li')!;
    const kinds = [...row.querySelectorAll('button')].map((b) => b.className);
    const ai = kinds.indexOf('notes-archive');
    expect(ai).toBeGreaterThan(-1);
    expect(kinds[ai + 1]).toBe('notes-delete');
    const title = row.querySelector('.notes-item')!.textContent;
    expect(
      row.querySelector('.notes-archive')?.getAttribute('aria-label'),
    ).toBe(`Archive "${title}"`);
    store.setArchived(a.id, true);
    btn('Archived (1)').click();
    const arow = root.querySelector('li')!;
    expect(arow.querySelector('.notes-archive')).toBeNull();
    expect(
      arow.querySelector('.notes-restore')?.getAttribute('aria-label'),
    ).toBe('Restore "Alpha"');
    const select = vi.spyOn(store, 'select');
    arow.querySelector<HTMLButtonElement>('.notes-item')!.click();
    expect(select).toHaveBeenCalledWith(a.id);
    const names = [...root.querySelectorAll('.notes-list button')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent,
    );
    expect(names).not.toContain('Restore');
  });

  it('moves aria-current to the next, previous or no row when the open note is archived', () => {
    const { store, a, b, c } = seed();
    const current = () =>
      root.querySelector('[aria-current="true"]')?.textContent;
    const archiveOpen = (title: string) =>
      root
        .querySelector<HTMLButtonElement>(`[aria-label='Archive "${title}"']`)!
        .click();
    mountNoteList(root, store);
    const order = titles();
    const byTitle: Record<string, string> = {
      Alpha: a.id,
      Beta: b.id,
      Gamma: c.id,
    };
    store.select(byTitle[order[0]!]!);
    expect(current()).toBe(order[0]);
    archiveOpen(order[0]!);
    expect(current()).toBe(order[1]);
    store.select(byTitle[order[2]!]!);
    archiveOpen(order[2]!);
    expect(current()).toBe(order[1]);
    archiveOpen(order[1]!);
    expect(current()).toBeUndefined();
  });

  it('scopes the tag filter to the view and keeps or clears the tag on a switch', () => {
    const { store, a, b } = seed();
    store.setTags(a.id, ['work']);
    store.setTags(b.id, ['home', 'work']);
    store.setArchived(b.id, true);
    mountNoteList(root, store);
    const select = () =>
      root.querySelector<HTMLSelectElement>('.notes-tag-select')!;
    const opts = () => [...select().options].map((o) => o.textContent);
    expect(opts()).toEqual(['All tags', 'work']);
    select().value = 'work';
    select().dispatchEvent(new Event('change', { bubbles: true }));
    btn('Archived (1)').click();
    expect(opts()).toEqual(['All tags', 'home', 'work']);
    expect(select().value).toBe('work');
    select().value = 'home';
    select().dispatchEvent(new Event('change', { bubbles: true }));
    btn('Notes').click();
    expect(select().value).toBe('');
  });

  it('says No archived notes only in Archived and keeps first-run text in Notes', () => {
    const { store } = seed();
    store.setArchivedMany(
      store.getState().notes.map((n) => n.id),
      true,
    );
    mountNoteList(root, store);
    expect(root.querySelector('.notes-empty')?.textContent).toBe(
      'No notes yet. Create one to get started.',
    );
  });

  it('keeps the nav Restore label and opens the file picker', () => {
    const { store } = seed();
    mountNoteList(root, store);
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, 'click');
    root
      .querySelector<HTMLButtonElement>(
        '.notes-actions [data-focus="restore"]',
      )!
      .click();
    expect(click).toHaveBeenCalled();
    expect(
      root.querySelector('.notes-actions [data-focus="restore"]')?.textContent,
    ).toBe('Restore');
  });

  it('focuses the same-kind control of the replacing row after Restore, else the toggle', () => {
    const { store } = seed();
    store.setArchivedMany(
      store.getState().notes.map((n) => n.id),
      true,
    );
    mountNoteList(root, store);
    btn('Archived (3)').click();
    const first = root.querySelector<HTMLButtonElement>('.notes-restore')!;
    first.focus();
    first.click();
    const active = document.activeElement as HTMLElement;
    expect(active.className).toBe('notes-restore');
    expect(active).not.toBe(document.body);
    for (let i = 0; i < 2; i++) {
      const r = root.querySelector<HTMLButtonElement>('.notes-restore')!;
      r.focus();
      r.click();
    }
    expect((document.activeElement as HTMLElement).dataset.focus).toBe(
      'view:archived',
    );
  });

  it('styles the new buttons with focus rings and no colour literals', () => {
    const css = readFileSync('src/notes/list.css', 'utf8');
    expect(css).toContain('.notes-view:focus-visible');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(/i);
  });
});

describe('changedArchiveIds', () => {
  const note = (id: string, archivedAt?: number): Note => ({
    id,
    body: id,
    createdAt: 1,
    updatedAt: 1,
    tags: [],
    ...(archivedAt ? { archivedAt } : {}),
  });
  const notes = [note('a'), note('b', 5), note('c'), note('d', 7)];

  it('keeps existing notes not yet in the target state, in input order, once', () => {
    expect(
      changedArchiveIds(notes, ['c', 'x', 'b', 'a', 'c', 'a'], true),
    ).toEqual(['c', 'a']);
    expect(changedArchiveIds(notes, ['d', 'a', 'b', 'zz', 'd'], false)).toEqual(
      ['d', 'b'],
    );
    expect(changedArchiveIds(notes, [], true)).toEqual([]);
  });
});

describe('select mode', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Notes listed top to bottom in the order given. */
  function seed(titles: string[], storage: Storage = mem()) {
    const store = createNotesStore(storage);
    const ids: Record<string, string> = {};
    for (const t of [...titles].reverse()) {
      const n = store.create();
      store.update(n.id, `# ${t}`);
      ids[t] = n.id;
    }
    return { store, storage, ids };
  }
  const five = ['One', 'Two', 'Three', 'Four', 'Five'];
  const btn = (label: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === label,
    )!;
  const toggle = () =>
    root.querySelector<HTMLButtonElement>('.notes-select-toggle')!;
  const bar = () => root.querySelector<HTMLElement>('.notes-bulk-bar')!;
  const bulk = () =>
    root.querySelector<HTMLButtonElement>('[data-focus="bulk-action"]')!;
  const cancel = () =>
    root.querySelector<HTMLButtonElement>('[data-focus="bulk-cancel"]')!;
  const countText = () =>
    root.querySelector('.notes-bulk-count')?.textContent ?? '';
  const toast = () => root.querySelector<HTMLElement>('.notes-toast')!;
  const undo = () => toast().querySelector<HTMLButtonElement>('button')!;
  const live = () => root.querySelector<HTMLElement>('.notes-live')!;
  const labelFor = (b: HTMLInputElement) =>
    root.querySelector(`label[for="${b.id}"]`)?.textContent;
  const boxes = () => [
    ...root.querySelectorAll<HTMLInputElement>('li .notes-select'),
  ];
  const rows = () => boxes().map(labelFor);
  const ticked = () =>
    boxes()
      .filter((b) => b.checked)
      .map(labelFor);
  const box = (t: string) => boxes().find((b) => labelFor(b) === t)!;
  const label = (t: string) =>
    [...root.querySelectorAll<HTMLLabelElement>('li label')].find(
      (l) => l.textContent === t,
    )!;
  const shiftClick = (el: HTMLElement) =>
    el.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
      }),
    );
  const key = (el: HTMLElement, k: string, shiftKey = false) => {
    const e = new KeyboardEvent('keydown', {
      key: k,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(e);
    return e;
  };
  const search = (q: string) => {
    const i = root.querySelector<HTMLInputElement>('.notes-search-input')!;
    i.value = q;
    i.dispatchEvent(new Event('input'));
    return i;
  };
  const focused = () => document.activeElement as HTMLElement;
  const archivedTitles = (store: NotesStore) =>
    store
      .getState()
      .notes.filter((n) => n.archivedAt !== undefined)
      .map((n) => n.body.slice(2))
      .sort();

  it('starts off, then shows checkboxes and the bar, and stores nothing', () => {
    const { store, storage } = seed(['One', 'Two']);
    mountNoteList(root, store);
    const setItem = vi.spyOn(storage, 'setItem');
    expect(toggle().textContent).toBe('Select');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(boxes()).toHaveLength(0);
    expect(bar().hidden).toBe(true);
    toggle().click();
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(rows()).toEqual(['One', 'Two']);
    expect(bar().hidden).toBe(false);
    box('One').click();
    expect(setItem).not.toHaveBeenCalled();
    const second = document.createElement('nav');
    document.body.append(second);
    mountNoteList(second, store);
    expect(
      second
        .querySelector('.notes-select-toggle')
        ?.getAttribute('aria-pressed'),
    ).toBe('false');
    expect(second.querySelectorAll('.notes-select')).toHaveLength(0);
    second.remove();
    const keys = [...Array(storage.length).keys()].map((i) => storage.key(i));
    expect(keys.sort()).toEqual(['quill:v1', 'quill:v1:selected']);
  });

  it('disables Select only when the showing view is empty', () => {
    const { store } = seed(['One']);
    mountNoteList(root, store);
    expect(toggle().disabled).toBe(false);
    btn('Archived (0)').click();
    expect(toggle().disabled).toBe(true);
  });

  it('labels checkboxes with the title, toggles by title and hides row buttons', () => {
    const { store } = seed(['One', 'Two']);
    mountNoteList(root, store);
    const select = vi.spyOn(store, 'select');
    toggle().click();
    const b = box('One');
    expect(b.type).toBe('checkbox');
    expect(b.getAttribute('aria-label')).toBeNull();
    expect(label('One').htmlFor).toBe(b.id);
    for (const cls of [
      'notes-star',
      'notes-item',
      'notes-archive',
      'notes-delete',
    ])
      expect(root.querySelectorAll(`li .${cls}`)).toHaveLength(0);
    label('One').click();
    expect(box('One').checked).toBe(true);
    expect(countText()).toBe('1 selected');
    expect(select).not.toHaveBeenCalled();
    cancel().click();
    for (const cls of [
      'notes-star',
      'notes-item',
      'notes-archive',
      'notes-delete',
    ])
      expect(root.querySelectorAll(`li .${cls}`)).toHaveLength(2);
    expect(boxes()).toHaveLength(0);
  });

  it('keeps aria-current on the open note row', () => {
    const { store, ids } = seed(['One', 'Two']);
    store.select(ids.Two!);
    mountNoteList(root, store);
    toggle().click();
    const current = root.querySelector('[aria-current="true"]');
    expect(current?.tagName).toBe('LI');
    expect(current?.querySelector('label')?.textContent).toBe('Two');
  });

  it('shows the bar with a polite count, and Restore in Archived', () => {
    const { store, ids } = seed(['One', 'Two', 'Three']);
    store.setArchived(ids.Three!, true);
    mountNoteList(root, store);
    toggle().click();
    const count = root.querySelector('.notes-bulk-count')!;
    expect(count.getAttribute('aria-live')).toBe('polite');
    expect(countText()).toBe('0 selected');
    expect(
      [...bar().querySelectorAll('button')].map((b) => b.textContent),
    ).toEqual(['Select all', 'Archive', 'Cancel']);
    expect(bulk().disabled).toBe(true);
    box('One').click();
    box('Two').click();
    expect(countText()).toBe('2 selected');
    expect(bulk().disabled).toBe(false);
    expect(root.querySelector('.notes-bulk-count')).toBe(count);
    box('Two').click();
    box('One').click();
    expect(countText()).toBe('0 selected');
    expect(bulk().disabled).toBe(true);
    expect(bar().hidden).toBe(false);
    expect(boxes()).toHaveLength(2);
    btn('Archived (1)').click();
    expect(bulk().textContent).toBe('Restore');
    expect(
      [...bar().querySelectorAll('[data-focus]')].map(
        (b) => (b as HTMLElement).dataset.focus,
      ),
    ).toEqual(['bulk-select-all', 'bulk-action', 'bulk-cancel']);
  });

  it('Select all takes only the visible rows of the showing view', () => {
    const { store, ids } = seed([
      'Apple pie',
      'Apple tart',
      'Bread',
      'Cake',
      'Old apple',
    ]);
    store.setArchived(ids['Old apple']!, true);
    mountNoteList(root, store);
    toggle().click();
    search('apple');
    btn('Select all').click();
    expect(ticked()).toEqual(['Apple pie', 'Apple tart']);
    expect(countText()).toBe('2 selected');
    btn('Archived (1)').click();
    btn('Select all').click();
    expect(ticked()).toEqual(['Old apple']);
  });

  it('drops a selected row hidden by search and leaves it unticked after', () => {
    const { store } = seed(['Apple', 'Bread']);
    mountNoteList(root, store);
    toggle().click();
    box('Bread').click();
    search('apple');
    expect(countText()).toBe('0 selected');
    search('');
    expect(ticked()).toEqual([]);
  });

  it('drops a selected note archived in another tab', () => {
    const { store, storage, ids } = seed(['One', 'Two']);
    mountNoteList(root, store);
    toggle().click();
    box('One').click();
    box('Two').click();
    const next = store
      .getState()
      .notes.map((n) => (n.id === ids.One ? { ...n, archivedAt: 9 } : n));
    storage.setItem('quill:v1', JSON.stringify(next));
    window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
    expect(rows()).toEqual(['Two']);
    expect(countText()).toBe('1 selected');
  });

  it('bulk Archive makes one store call and one storage write', () => {
    const { store, storage, ids } = seed(['One', 'Two', 'Three', 'Four']);
    mountNoteList(root, store);
    const many = vi.spyOn(store, 'setArchivedMany');
    const setItem = vi.spyOn(storage, 'setItem');
    toggle().click();
    box('Three').click();
    box('One').click();
    box('Two').click();
    bulk().click();
    expect(many).toHaveBeenCalledTimes(1);
    expect(many).toHaveBeenCalledWith([ids.One, ids.Two, ids.Three], true);
    expect(setItem.mock.calls.filter(([k]) => k === 'quill:v1')).toHaveLength(
      1,
    );
    expect(countText()).toBe('0 selected');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(rows()).toEqual(['Four']);
    btn('Archived (3)').click();
    expect(rows().sort()).toEqual(['One', 'Three', 'Two']);
  });

  it('bulk Restore makes one store call and returns the notes', () => {
    const { store, ids } = seed(['One', 'Two', 'Three']);
    store.setArchivedMany([ids.One!, ids.Two!, ids.Three!], true);
    mountNoteList(root, store);
    btn('Archived (3)').click();
    const many = vi.spyOn(store, 'setArchivedMany');
    toggle().click();
    const [first, , third] = rows();
    box(first!).click();
    box(third!).click();
    bulk().click();
    expect(many).toHaveBeenCalledTimes(1);
    expect(many).toHaveBeenCalledWith([ids[first!], ids[third!]], false);
    btn('Notes').click();
    expect(rows().sort()).toEqual([first, third].sort());
  });

  it('clears the selection on a view switch and keeps select mode', () => {
    const { store, ids } = seed(['One', 'Two']);
    store.setArchived(ids.Two!, true);
    mountNoteList(root, store);
    toggle().click();
    box('One').click();
    btn('Archived (1)').click();
    expect(countText()).toBe('0 selected');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    box('Two').click();
    btn('Notes').click();
    expect(countText()).toBe('0 selected');
    expect(ticked()).toEqual([]);
    expect(boxes()).toHaveLength(1);
  });

  it('exits on Cancel, the toggle and Esc, focusing Select; search Esc wins', () => {
    const { store } = seed(['One', 'Two']);
    mountNoteList(root, store);
    const exits: Array<() => void> = [
      () => cancel().click(),
      () => toggle().click(),
      () => {
        box('Two').focus();
        key(box('Two'), 'Escape');
      },
    ];
    for (const exit of exits) {
      toggle().click();
      box('One').click();
      exit();
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
      expect(boxes()).toHaveLength(0);
      expect(bar().hidden).toBe(true);
      expect(focused().dataset.focus).toBe('select-mode');
      toggle().click();
      expect(ticked()).toEqual([]);
      cancel().click();
    }
    toggle().click();
    const i = search('One');
    i.focus();
    const e = key(i, 'Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(i.value).toBe('');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
  });

  it('New note exits select mode and lists the new note', () => {
    const { store } = seed(['One']);
    mountNoteList(root, store);
    toggle().click();
    box('One').click();
    btn('New note').click();
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(
      [...root.querySelectorAll('li .notes-item')].map((e) => e.textContent),
    ).toContain('Untitled');
  });

  it('focuses the first row after Archive, else Cancel', () => {
    const { store, ids } = seed(['One', 'Two', 'Three']);
    mountNoteList(root, store);
    toggle().click();
    box('One').click();
    box('Two').click();
    bulk().focus();
    bulk().click();
    expect(focused().dataset.focus).toBe(`select:${ids.Three}`);
    btn('Select all').click();
    bulk().click();
    expect(focused()).toBe(cancel());
    expect(focused()).not.toBe(document.body);
  });

  it('keeps row Archive and Restore on setArchived outside select mode', () => {
    const { store, ids } = seed(['One']);
    mountNoteList(root, store);
    const one = vi.spyOn(store, 'setArchived');
    root.querySelector<HTMLButtonElement>('.notes-archive')!.click();
    expect(one).toHaveBeenLastCalledWith(ids.One, true);
    btn('Archived (1)').click();
    root.querySelector<HTMLButtonElement>('.notes-restore')!.click();
    expect(one).toHaveBeenLastCalledWith(ids.One, false);
  });

  describe('ranges', () => {
    it('shift-click selects down from the anchor', () => {
      const { store } = seed(five);
      mountNoteList(root, store);
      toggle().click();
      box('Two').click();
      shiftClick(box('Four'));
      expect(ticked()).toEqual(['Two', 'Three', 'Four']);
      expect(countText()).toBe('3 selected');
      expect(focused()).toBe(box('Four'));
    });

    it('shift-click on a title selects up from the anchor', () => {
      const { store } = seed(five);
      mountNoteList(root, store);
      toggle().click();
      box('Four').click();
      const down = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
      });
      label('One').dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
      shiftClick(label('One'));
      expect(ticked()).toEqual(['One', 'Two', 'Three', 'Four']);
      expect(focused()).toBe(box('One'));
    });

    it('only adds to the selection', () => {
      const { store } = seed(five);
      mountNoteList(root, store);
      toggle().click();
      box('One').click();
      box('Five').click();
      box('Two').click();
      shiftClick(box('Three'));
      expect(ticked()).toEqual(['One', 'Two', 'Three', 'Five']);
    });

    it('skips rows hidden by search', () => {
      const { store } = seed(['Apple 1', 'Bread', 'Apple 2', 'Apple 3']);
      mountNoteList(root, store);
      toggle().click();
      search('apple');
      box('Apple 1').click();
      shiftClick(box('Apple 3'));
      expect(countText()).toBe('3 selected');
      search('');
      expect(ticked()).toEqual(['Apple 1', 'Apple 2', 'Apple 3']);
    });

    it('with no anchor toggles only that row', () => {
      const { store } = seed(five);
      mountNoteList(root, store);
      toggle().click();
      shiftClick(box('Three'));
      expect(ticked()).toEqual(['Three']);
      shiftClick(box('Five'));
      expect(ticked()).toEqual(['Three', 'Four', 'Five']);
    });

    it('resets the anchor after an action, a view switch and Cancel', () => {
      const { store } = seed(five);
      mountNoteList(root, store);
      toggle().click();
      box('One').click();
      bulk().click();
      shiftClick(box('Four'));
      expect(ticked()).toEqual(['Four']);
      btn('Archived (1)').click();
      btn('Notes').click();
      shiftClick(box('Two'));
      expect(ticked()).toEqual(['Two']);
      cancel().click();
      toggle().click();
      shiftClick(box('Five'));
      expect(ticked()).toEqual(['Five']);
    });

    it('Space toggles natively and sets the anchor for Shift+Space', () => {
      const { store } = seed(five);
      mountNoteList(root, store);
      toggle().click();
      box('Two').focus();
      const space = key(box('Two'), ' ');
      expect(space.defaultPrevented).toBe(false);
      // The browser's own activation for an unprevented Space on a checkbox.
      box('Two').click();
      expect(ticked()).toEqual(['Two']);
      box('Four').focus();
      const range = key(box('Four'), ' ', true);
      expect(range.defaultPrevented).toBe(true);
      expect(ticked()).toEqual(['Two', 'Three', 'Four']);
      expect(focused()).toBe(box('Four'));
    });

    it('Shift+Space takes the range from an anchor above, keeping the focused row', () => {
      const { store } = seed(five);
      mountNoteList(root, store);
      toggle().click();
      box('One').click();
      box('Three').focus();
      const e = key(box('Three'), ' ', true);
      expect(e.defaultPrevented).toBe(true);
      expect(ticked()).toEqual(['One', 'Two', 'Three']);
      expect(box('Three').checked).toBe(true);
      expect(focused()).toBe(box('Three'));
      expect(focused()).not.toBe(document.body);
    });
  });

  describe('toast and undo', () => {
    it('is a hidden, empty, non-live container on mount', () => {
      const { store } = seed(['One']);
      mountNoteList(root, store);
      const t = toast();
      expect(t.hidden).toBe(true);
      expect(t.childNodes).toHaveLength(0);
      expect(t.getAttribute('role')).toBeNull();
      expect(t.getAttribute('aria-live')).toBeNull();
      expect(t.previousElementSibling).toBe(bar());
    });

    it('reads the changed count with an Undo button', () => {
      const { store } = seed(['One', 'Two', 'Three']);
      mountNoteList(root, store);
      toggle().click();
      btn('Select all').click();
      bulk().click();
      expect(toast().hidden).toBe(false);
      expect(toast().textContent).toBe('3 notes archivedUndo');
      expect(undo().textContent).toBe('Undo');
      btn('Archived (3)').click();
      box('Two').click();
      bulk().click();
      expect(toast().textContent).toBe('1 note restoredUndo');
    });

    it('hides at 5000 ms, paused while Undo has focus', () => {
      vi.useFakeTimers();
      const { store } = seed(['One', 'Two']);
      mountNoteList(root, store);
      toggle().click();
      box('One').click();
      bulk().click();
      vi.advanceTimersByTime(4999);
      expect(toast().hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(toast().hidden).toBe(true);
      box('Two').click();
      bulk().click();
      undo().focus();
      vi.advanceTimersByTime(8000);
      expect(toast().hidden).toBe(false);
      toggle().focus();
      vi.advanceTimersByTime(4999);
      expect(toast().hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(toast().hidden).toBe(true);
    });

    it('clears the toast timer on unmount', () => {
      vi.useFakeTimers();
      const { store } = seed(['One']);
      const unmount = mountNoteList(root, store);
      toggle().click();
      box('One').click();
      bulk().click();
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('Undo inverts an archive batch in one call and focuses the view toggle', () => {
      const { store, ids } = seed(['One', 'Two', 'Three', 'Four']);
      mountNoteList(root, store);
      toggle().click();
      box('One').click();
      box('Two').click();
      box('Three').click();
      bulk().click();
      const many = vi.spyOn(store, 'setArchivedMany');
      undo().focus();
      undo().click();
      expect(many).toHaveBeenCalledTimes(1);
      expect(many).toHaveBeenCalledWith([ids.One, ids.Two, ids.Three], false);
      expect(rows()).toEqual(['One', 'Two', 'Three', 'Four']);
      expect(toast().hidden).toBe(true);
      expect(focused().dataset.focus).toBe('view:notes');
      expect(
        focused().closest('[role="group"]')?.getAttribute('aria-label'),
      ).toBe('Note views');
    });

    it('Undo re-archives a restore batch', () => {
      const { store, ids } = seed(['One', 'Two', 'Three']);
      store.setArchivedMany([ids.One!, ids.Two!, ids.Three!], true);
      mountNoteList(root, store);
      btn('Archived (3)').click();
      toggle().click();
      box('One').click();
      box('Two').click();
      bulk().click();
      const many = vi.spyOn(store, 'setArchivedMany');
      const batch = many.mock.calls.length;
      undo().click();
      expect(many.mock.calls.slice(batch)).toHaveLength(1);
      expect(many.mock.calls[batch]![1]).toBe(true);
      expect([...many.mock.calls[batch]![0]].sort()).toEqual(
        [ids.One, ids.Two].sort(),
      );
      expect(archivedTitles(store)).toEqual(['One', 'Three', 'Two']);
      expect(focused().dataset.focus).toBe('view:archived');
    });

    it('a second batch replaces the toast and Undo inverts only it', () => {
      const { store, ids } = seed(['One', 'Two', 'Three', 'Four']);
      mountNoteList(root, store);
      toggle().click();
      box('One').click();
      bulk().click();
      box('Two').click();
      box('Three').click();
      bulk().click();
      expect(toast().textContent).toBe('2 notes archivedUndo');
      const many = vi.spyOn(store, 'setArchivedMany');
      undo().click();
      expect(many).toHaveBeenCalledWith([ids.Two, ids.Three], false);
      expect(archivedTitles(store)).toEqual(['One']);
    });

    it('row Archive neither shows nor hides the toast', () => {
      const { store } = seed(['One', 'Two', 'Three']);
      mountNoteList(root, store);
      root.querySelector<HTMLButtonElement>('.notes-archive')!.click();
      expect(toast().hidden).toBe(true);
      toggle().click();
      box('Two').click();
      bulk().click();
      cancel().click();
      root.querySelector<HTMLButtonElement>('.notes-archive')!.click();
      expect(toast().hidden).toBe(false);
      expect(toast().textContent).toBe('1 note archivedUndo');
    });

    it('survives a view switch and Cancel, and Undo still works', () => {
      const { store } = seed(['One', 'Two']);
      mountNoteList(root, store);
      toggle().click();
      btn('Select all').click();
      bulk().click();
      btn('Archived (2)').click();
      cancel().click();
      expect(toast().hidden).toBe(false);
      undo().click();
      expect(archivedTitles(store)).toEqual([]);
      expect(focused().dataset.focus).toBe('view:archived');
    });

    it('puts Undo next in tab order after the bar', () => {
      const { store } = seed(['One', 'Two']);
      mountNoteList(root, store);
      toggle().click();
      box('One').click();
      bulk().click();
      const tabbable = [
        ...root.querySelectorAll<HTMLElement>('button, input, select'),
      ].filter(
        (el) =>
          !(el as HTMLButtonElement).disabled &&
          !el.closest('[hidden]') &&
          !(el as HTMLInputElement).hidden,
      );
      const at = tabbable.indexOf(cancel());
      expect(at).toBeGreaterThan(-1);
      expect(tabbable[at + 1]).toBe(undo());
    });
  });

  describe('announcements', () => {
    /** Records every non-empty write to the node's text. */
    function recordWrites(node: Node): string[] {
      const writes: string[] = [];
      let proto: object | null = node;
      let desc: PropertyDescriptor | undefined;
      while (proto && !desc) {
        desc = Object.getOwnPropertyDescriptor(proto, 'textContent');
        proto = Object.getPrototypeOf(proto) as object | null;
      }
      const { get, set } = desc!;
      Object.defineProperty(node, 'textContent', {
        configurable: true,
        get() {
          return get!.call(node) as string;
        },
        set(v: string) {
          if (v) writes.push(v);
          set!.call(node, v);
        },
      });
      return writes;
    }

    it('bulk Archive writes once into the same live node as row Archive', () => {
      const { store } = seed(['One', 'Two', 'Three', 'Four', 'Five']);
      mountNoteList(root, store);
      root.querySelector<HTMLButtonElement>('.notes-archive')!.click();
      const node = live();
      expect(node.textContent).toMatch(/^Archived "One"\. Archived \(1\)\.$/);
      const writes = recordWrites(node);
      toggle().click();
      btn('Select all').click();
      box('Five').click();
      bulk().click();
      expect(live()).toBe(node);
      expect(writes).toEqual(['Archived 3 notes. Archived (4).']);
      const polite = [...root.querySelectorAll('[aria-live="polite"]')];
      expect(polite).toEqual([node, root.querySelector('.notes-bulk-count')]);
      expect(root.querySelectorAll('[role="status"]')).toHaveLength(2);
    });

    it('announces Restore and both Undos once each', () => {
      const { store, ids } = seed(['One', 'Two', 'Three', 'Four']);
      store.setArchived(ids.Four!, true);
      mountNoteList(root, store);
      const writes = recordWrites(live());
      btn('Archived (1)').click();
      toggle().click();
      box('Four').click();
      bulk().click();
      expect(writes).toEqual(['Restored 1 note. Archived (0).']);
      btn('Notes').click();
      btn('Select all').click();
      box('Four').click();
      bulk().click();
      undo().click();
      expect(writes.slice(1)).toEqual([
        'Archived 3 notes. Archived (3).',
        'Undid archive of 3 notes. Archived (0).',
      ]);
      box('One').click();
      box('Two').click();
      bulk().click();
      btn('Archived (2)').click();
      btn('Select all').click();
      bulk().click();
      undo().click();
      expect(writes.slice(3)).toEqual([
        'Archived 2 notes. Archived (2).',
        'Restored 2 notes. Archived (0).',
        'Undid restore of 2 notes. Archived (2).',
      ]);
    });

    it('a batch that changes nothing announces nothing and leaves focus alone', () => {
      const { store, ids } = seed(['One', 'Two']);
      // Hold back notifications so the list can't re-render between the
      // other tab's change and the press.
      let paused = false;
      let listener:
        ((s: NotesState, src: 'local' | 'external') => void) | undefined;
      store.subscribe((s, src) => {
        if (!paused) listener?.(s, src);
      });
      const gated: NotesStore = {
        ...store,
        subscribe: (l) => {
          listener = l;
          return () => {
            listener = undefined;
          };
        },
      };
      mountNoteList(root, gated);
      const many = vi.spyOn(gated, 'setArchivedMany');
      toggle().click();
      box('One').click();
      paused = true;
      store.setArchived(ids.One!, true);
      const writes = recordWrites(live());
      bulk().focus();
      bulk().click();
      expect(many).toHaveBeenCalledTimes(1);
      expect(many).toHaveBeenCalledWith([ids.One], true);
      expect(writes).toEqual([]);
      expect(toast().hidden).toBe(true);
      expect(countText()).toBe('0 selected');
      expect(focused()).not.toBe(document.body);
      const searchBox = root.querySelector<HTMLInputElement>(
        '.notes-search-input',
      )!;
      searchBox.focus();
      paused = false;
      store.update(ids.Two!, '# Two again');
      expect(document.activeElement).toBe(searchBox);
    });

    it('an Undo that changes nothing announces nothing and keeps focus off body', () => {
      const { store, ids } = seed(['One', 'Two']);
      mountNoteList(root, store);
      toggle().click();
      box('One').click();
      bulk().click();
      const writes = recordWrites(live());
      store.setArchived(ids.One!, false);
      undo().focus();
      undo().click();
      expect(writes).toEqual([]);
      expect(toast().hidden).toBe(true);
      expect(focused().dataset.focus).toBe('view:notes');
      const searchBox = root.querySelector<HTMLInputElement>(
        '.notes-search-input',
      )!;
      searchBox.focus();
      store.update(ids.Two!, '# Two again');
      expect(document.activeElement).toBe(searchBox);
    });
  });

  it('journey: select a range, archive it and undo', () => {
    const { store } = seed(five);
    mountNoteList(root, store);
    toggle().click();
    box('Two').click();
    shiftClick(box('Four'));
    bulk().click();
    expect(rows()).toEqual(['One', 'Five']);
    expect(toast().textContent).toBe('3 notes archivedUndo');
    expect(live().textContent).toBe('Archived 3 notes. Archived (3).');
    undo().click();
    expect(rows()).toEqual(five);
    expect(live().textContent).toBe('Undid archive of 3 notes. Archived (0).');
  });

  it('styles every new control with theme tokens and a focus ring', () => {
    const css = readFileSync('src/notes/list.css', 'utf8');
    const rules =
      css.match(/\.notes-(select|bulk|toast|view-row)[^{]*\{[^}]*\}/g) ?? [];
    const joined = rules.join('\n');
    expect(rules.length).toBeGreaterThan(5);
    expect(joined).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(/i);
    for (const sel of [
      '.notes-select-toggle:focus-visible',
      '.notes-select:focus-visible',
      '.notes-bulk-button:focus-visible',
      '.notes-toast-undo:focus-visible',
    ])
      expect(css).toContain(sel);
  });
});
