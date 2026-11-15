import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNotesStore } from './store';

class MemStorage implements Storage {
  data = new Map<string, string>();
  failWith: Error | null = null;
  failGet = false;
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    if (this.failGet) throw new Error('no');
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.failWith) throw this.failWith;
    this.data.set(k, v);
  }
}

const quota = () =>
  Object.assign(new Error('full'), { name: 'QuotaExceededError' });
const seed = (s: MemStorage, notes: unknown[]) =>
  s.data.set('quill:v1', JSON.stringify(notes));
const n = (id: string, body: string, updatedAt: number) => ({
  id,
  body,
  createdAt: 1,
  updatedAt,
});

afterEach(() => vi.restoreAllMocks());

describe('notes store', () => {
  it('writes one key holding exactly the four fields', () => {
    const s = new MemStorage();
    const store = createNotesStore(s);
    const note = store.create();
    store.update(note.id, 'hi');
    const stored = JSON.parse(s.data.get('quill:v1') ?? '');
    expect(Object.keys(stored[0]).sort()).toEqual([
      'body',
      'createdAt',
      'id',
      'updatedAt',
    ]);
    expect(stored[0].body).toBe('hi');
  });

  it('sorts by updatedAt descending and update moves a note to the front', () => {
    const s = new MemStorage();
    seed(s, [n('a', 'A', 1), n('b', 'B', 2)]);
    const store = createNotesStore(s);
    expect(store.getState().notes.map((x) => x.id)).toEqual(['b', 'a']);
    store.update('a', 'A2');
    expect(store.getState().notes.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('create selects, remove falls back', () => {
    const s = new MemStorage();
    seed(s, [n('a', 'A', 1)]);
    const store = createNotesStore(s);
    const c = store.create();
    expect(store.getState().selectedId).toBe(c.id);
    store.remove(c.id);
    expect(store.getState().selectedId).toBe('a');
    store.remove('a');
    expect(store.getState().selectedId).toBeNull();
  });

  it('persists and restores the selected id, falling back to most recent', () => {
    const s = new MemStorage();
    seed(s, [n('a', 'A', 1), n('b', 'B', 2)]);
    const store = createNotesStore(s);
    expect(store.getState().selectedId).toBe('b');
    store.select('a');
    expect(createNotesStore(s).getState().selectedId).toBe('a');
    s.data.set('quill:v1:selected', 'gone');
    expect(createNotesStore(s).getState().selectedId).toBe('b');
  });

  it('flags quota but keeps the body, and clears on later success', () => {
    const s = new MemStorage();
    const store = createNotesStore(s);
    const note = store.create();
    s.failWith = quota();
    store.update(note.id, 'kept');
    expect(store.getState().writeError).toBe('quota');
    expect(store.getState().notes[0]?.body).toBe('kept');
    s.failWith = null;
    store.update(note.id, 'ok');
    expect(store.getState().writeError).toBeNull();
  });

  it('flags other write failures as unavailable', () => {
    const s = new MemStorage();
    const store = createNotesStore(s);
    s.failWith = new Error('denied');
    store.create();
    expect(store.getState().writeError).toBe('unavailable');
  });

  it('loads empty without overwriting corrupt JSON', () => {
    const s = new MemStorage();
    s.data.set('quill:v1', '{not json');
    const store = createNotesStore(s);
    expect(store.getState().notes).toEqual([]);
    expect(s.data.get('quill:v1')).toBe('{not json');
  });

  it('drops malformed entries', () => {
    const s = new MemStorage();
    seed(s, [n('a', 'A', 1), { id: 'x' }]);
    expect(createNotesStore(s).getState().notes).toHaveLength(1);
  });

  it('reports unavailable when getItem throws', () => {
    const s = new MemStorage();
    s.failGet = true;
    const state = createNotesStore(s).getState();
    expect(state.notes).toEqual([]);
    expect(state.writeError).toBe('unavailable');
  });

  const backups = (s: MemStorage) =>
    [...s.data.entries()].filter(([k]) => k.startsWith('quill:v1:backup:'));

  it('backs up truncated JSON before the first write', () => {
    const s = new MemStorage();
    s.data.set('quill:v1', '[{"id":"a"');
    createNotesStore(s).create();
    expect(backups(s).map(([, v]) => v)).toEqual(['[{"id":"a"']);
  });

  it('keeps valid notes and backs up the raw original when some are invalid', () => {
    const s = new MemStorage();
    const raw = JSON.stringify([
      n('a', 'A', 1),
      { ...n('b', 'B', 2), updatedAt: 'x' },
    ]);
    s.data.set('quill:v1', raw);
    const store = createNotesStore(s);
    store.create();
    expect(store.getState().notes.map((x) => x.id)).toContain('a');
    expect(backups(s).map(([, v]) => v)).toEqual([raw]);
  });

  it('withholds writes after a failed read, even once reads recover', () => {
    const s = new MemStorage();
    seed(s, [n('a', 'A', 1)]);
    const before = s.data.get('quill:v1');
    s.failGet = true;
    const store = createNotesStore(s);
    s.failGet = false;
    store.create();
    expect(s.data.get('quill:v1')).toBe(before);
    expect(store.getState().writeError).toBe('unavailable');
  });

  it('does not reset notes on an unparseable storage event', () => {
    const s = new MemStorage();
    seed(s, [n('a', 'A', 1)]);
    const store = createNotesStore(s);
    s.data.set('quill:v1', '{broken');
    window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
    expect(store.getState().notes.map((x) => x.id)).toEqual(['a']);
  });

  it('syncs external changes and ignores the selected key', () => {
    const s = new MemStorage();
    seed(s, [n('a', 'A', 1)]);
    const store = createNotesStore(s);
    const seen: string[] = [];
    store.subscribe((_st, src) => seen.push(src));
    seed(s, [n('a', 'A-ext', 5), n('b', 'B', 3)]);
    window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
    expect(seen).toEqual(['external']);
    expect(store.getState().notes.map((x) => x.body)).toEqual(['A-ext', 'B']);
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'quill:v1:selected' }),
    );
    expect(seen).toHaveLength(1);
  });

  it('keeps the local body while pending, and the next update wins', () => {
    const s = new MemStorage();
    seed(s, [n('a', 'A', 1)]);
    const store = createNotesStore(s);
    store.select('a');
    store.update('a', 'local');
    store.setPendingLocalEdits(true);
    seed(s, [n('a', 'remote', 99)]);
    window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
    expect(store.getState().notes[0]?.body).toBe('local');
    store.update('a', 'local2');
    expect(JSON.parse(s.data.get('quill:v1') ?? '')[0].body).toBe('local2');
  });

  it('falls back when the open note was deleted elsewhere', () => {
    const s = new MemStorage();
    seed(s, [n('a', 'A', 1), n('b', 'B', 2)]);
    const store = createNotesStore(s);
    store.select('b');
    seed(s, [n('a', 'A', 1)]);
    window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
    expect(store.getState().selectedId).toBe('a');
  });

  it('reloads when storage is cleared elsewhere (key null)', () => {
    const s = new MemStorage();
    seed(s, [n('a', 'A', 1)]);
    const store = createNotesStore(s);
    s.data.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(store.getState().notes).toEqual([]);
  });

  it('unsubscribe stops notifications', () => {
    const store = createNotesStore(new MemStorage());
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.create();
    off();
    store.create();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  describe('backup', () => {
    const file = (notes: unknown[], extra = {}) =>
      JSON.stringify({ app: 'quill', format: 1, notes, ...extra });

    it('exports the envelope with exactly four fields per note', () => {
      const s = new MemStorage();
      seed(s, [{ ...n('a', 'A', 1), extra: 1 }]);
      const out = JSON.parse(createNotesStore(s).exportBackup());
      expect(Object.keys(out).sort()).toEqual(
        ['app', 'exportedAt', 'format', 'notes'].sort(),
      );
      expect(out.app).toBe('quill');
      expect(out.format).toBe(1);
      expect(new Date(out.exportedAt).toISOString()).toBe(out.exportedAt);
      expect(out.notes).toEqual([n('a', 'A', 1)]);
    });

    it('round-trips into an empty store with one write', () => {
      const src = new MemStorage();
      seed(src, [n('a', 'A', 1), n('b', 'B', 2)]);
      const text = createNotesStore(src).exportBackup();
      const dst = new MemStorage();
      const store = createNotesStore(dst);
      const set = vi.spyOn(dst, 'setItem');
      const fn = vi.fn();
      store.subscribe(fn);
      expect(store.importBackup(text)).toEqual({
        ok: true,
        added: 2,
        updated: 0,
        unchanged: 0,
      });
      expect(JSON.parse(dst.data.get('quill:v1') ?? '[]')).toEqual(
        JSON.parse(text).notes,
      );
      expect(set.mock.calls.filter((c) => c[0] === 'quill:v1')).toHaveLength(1);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn.mock.calls[0]?.[1]).toBe('external');
      expect(store.getState().selectedId).toBe('b');
    });

    it('applies each merge rule and keeps selection', () => {
      const s = new MemStorage();
      seed(s, [
        n('keep', 'local only', 5),
        n('newer', 'old', 1),
        n('tie', 'local', 3),
        n('localNewer', 'local', 9),
      ]);
      const store = createNotesStore(s);
      store.select('tie');
      const res = store.importBackup(
        file([
          n('add', 'added', 2),
          n('newer', 'fresh', 4),
          n('tie', 'file', 3),
          n('localNewer', 'file', 2),
        ]),
      );
      expect(res).toEqual({ ok: true, added: 1, updated: 1, unchanged: 2 });
      const by = new Map(store.getState().notes.map((x) => [x.id, x]));
      expect(by.get('add')?.body).toBe('added');
      expect(by.get('newer')).toMatchObject({ body: 'fresh', updatedAt: 4 });
      expect(by.get('tie')?.body).toBe('local');
      expect(by.get('localNewer')?.body).toBe('local');
      expect(by.has('keep')).toBe(true);
      expect(store.getState().selectedId).toBe('tie');
    });

    it('counts distinct ids when the file repeats one', () => {
      const store = createNotesStore(new MemStorage());
      const res = store.importBackup(
        file([n('a', 'first', 2), n('a', 'second', 2), n('a', 'newer', 3)]),
      );
      expect(res).toEqual({ ok: true, added: 1, updated: 0, unchanged: 0 });
      expect(store.getState().notes[0]?.body).toBe('newer');
    });

    it('does not write when nothing changes', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'A', 5)]);
      const store = createNotesStore(s);
      const set = vi.spyOn(s, 'setItem');
      expect(store.importBackup(file([n('a', 'X', 5)]))).toEqual({
        ok: true,
        added: 0,
        updated: 0,
        unchanged: 1,
      });
      expect(set).not.toHaveBeenCalled();
    });

    it.each([
      ['not json', 'nope{'],
      ['wrong app', file([], { app: 'other' })],
      ['wrong format', file([], { format: 2 })],
      ['notes not array', file([], { notes: {} })],
      ['one bad entry', file([n('a', 'A', 1), { id: 'b' }])],
      ['null', 'null'],
    ])('rejects invalid input (%s) without touching anything', (_l, text) => {
      const s = new MemStorage();
      seed(s, [n('z', 'Z', 1)]);
      const store = createNotesStore(s);
      const before = JSON.stringify([...s.data]);
      const fn = vi.fn();
      store.subscribe(fn);
      expect(store.importBackup(text)).toEqual({
        ok: false,
        reason: 'invalid',
      });
      expect(JSON.stringify([...s.data])).toBe(before);
      expect(fn).not.toHaveBeenCalled();
    });

    it('reports a write failure and keeps memory unchanged', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'A', 1)]);
      const store = createNotesStore(s);
      const before = store.getState().notes;
      s.failWith = quota();
      expect(store.importBackup(file([n('b', 'B', 2)]))).toEqual({
        ok: false,
        reason: 'write',
      });
      expect(store.getState().notes).toEqual(before);
      expect(store.getState().writeError).toBe('quota');
    });
  });
});
