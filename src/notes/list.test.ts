import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mountNoteList } from './list';
import * as exportModule from './export';
import { createNotesStore } from './store';

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
