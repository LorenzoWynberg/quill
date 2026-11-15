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
});
