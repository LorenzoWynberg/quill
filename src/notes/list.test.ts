import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountNoteList } from './list';
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
  });
});
