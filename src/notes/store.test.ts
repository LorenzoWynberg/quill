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
  it('drops a stored tag with a line break on load', () => {
    const s = new MemStorage();
    seed(s, [{ ...n('a', 'A', 1), tags: ['ok', 'x\ny'] }]);
    expect(createNotesStore(s).getState().notes[0]?.tags).toEqual(['ok']);
  });

  it('writes one key holding exactly the five fields', () => {
    const s = new MemStorage();
    const store = createNotesStore(s);
    const note = store.create();
    store.update(note.id, 'hi');
    const stored = JSON.parse(s.data.get('quill:v1') ?? '');
    expect(Object.keys(stored[0]).sort()).toEqual([
      'body',
      'createdAt',
      'id',
      'tags',
      'updatedAt',
    ]);
    expect(stored[0].body).toBe('hi');
    store.setStarred(note.id, true);
    const starred = JSON.parse(s.data.get('quill:v1') ?? '');
    expect(Object.keys(starred[0]).sort()).toEqual([
      'body',
      'createdAt',
      'id',
      'starred',
      'tags',
      'updatedAt',
    ]);
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

    it('exports the envelope with exactly five fields per note', () => {
      const s = new MemStorage();
      seed(s, [{ ...n('a', 'A', 1), extra: 1 }]);
      const out = JSON.parse(createNotesStore(s).exportBackup());
      expect(Object.keys(out).sort()).toEqual(
        ['app', 'exportedAt', 'format', 'notes'].sort(),
      );
      expect(out.app).toBe('quill');
      expect(out.format).toBe(1);
      expect(new Date(out.exportedAt).toISOString()).toBe(out.exportedAt);
      expect(out.notes).toEqual([{ ...n('a', 'A', 1), tags: [] }]);
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

    it('drops a tag holding a line break but keeps the others', () => {
      const store = createNotesStore(new MemStorage());
      const note = { ...n('a', 'A', 2), tags: ['ok', 'x\ny'] };
      expect(store.importBackup(file([note]))).toMatchObject({ added: 1 });
      expect(store.getState().notes[0]?.tags).toEqual(['ok']);
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

  describe('starring', () => {
    it('sorts starred first, keeps updatedAt, persists, and unstar removes the key', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'a', 10), n('b', 'b', 20), n('c', 'c', 30)]);
      const store = createNotesStore(s);
      const emits: string[] = [];
      store.subscribe((_, src) => emits.push(src));
      store.setStarred('a', true);
      expect(emits).toEqual(['local']);
      expect(store.getState().notes.map((x) => x.id)).toEqual(['a', 'c', 'b']);
      expect(store.getState().notes[0]?.updatedAt).toBe(10);
      const stored = JSON.parse(s.data.get('quill:v1') ?? '');
      expect(stored.find((x: { id: string }) => x.id === 'a').starred).toBe(
        true,
      );
      expect(createNotesStore(s).getState().notes[0]?.id).toBe('a');
      store.setStarred('a', false);
      expect(store.getState().notes.map((x) => x.id)).toEqual(['c', 'b', 'a']);
      expect(s.data.get('quill:v1')).not.toContain('starred');
    });

    it('is a no-op for an unknown id or the same value, and reports quota', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'a', 10)]);
      const store = createNotesStore(s);
      const spy = vi.spyOn(s, 'setItem');
      store.setStarred('zzz', true);
      store.setStarred('a', false);
      expect(spy).not.toHaveBeenCalled();
      s.failWith = quota();
      store.setStarred('a', true);
      expect(store.getState().writeError).toBe('quota');
    });

    it('loads a missing or non-boolean starred as unstarred without a backup', () => {
      const s = new MemStorage();
      seed(s, [{ ...n('a', 'a', 10), starred: 'yes' }, n('b', 'b', 5)]);
      const store = createNotesStore(s);
      expect(store.getState().notes.every((x) => x.starred !== true)).toBe(
        true,
      );
      expect([...s.data.keys()].some((k) => k.includes('backup'))).toBe(false);
      expect(store.getState().writeError).toBeNull();
    });

    it('update keeps the star', () => {
      const s = new MemStorage();
      seed(s, [{ ...n('a', 'a', 10), starred: true }]);
      const store = createNotesStore(s);
      store.update('a', 'new');
      expect(store.getState().notes[0]?.starred).toBe(true);
    });

    it('takes the star from another tab but keeps local pending edits', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'a', 10)]);
      const store = createNotesStore(s);
      store.setPendingLocalEdits(true);
      store.update('a', 'local');
      const theirs = JSON.parse(s.data.get('quill:v1') ?? '');
      theirs[0].body = 'remote';
      theirs[0].starred = true;
      s.data.set('quill:v1', JSON.stringify(theirs));
      window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
      const note = store.getState().notes[0];
      expect(note?.body).toBe('local');
      expect(note?.starred).toBe(true);
    });

    it('moves a note starred in another tab to the front of this tab', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'a', 10), n('b', 'b', 5)]);
      const a = createNotesStore(s);
      const b = createNotesStore(s);
      a.setStarred('b', true);
      window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
      expect(b.getState().notes.map((x) => x.id)).toEqual(['b', 'a']);
      a.setStarred('b', false);
      window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
      expect(b.getState().notes.map((x) => x.id)).toEqual(['a', 'b']);
    });

    it('backup carries stars only when set, and restore applies newer-wins', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'a', 10), n('b', 'b', 20)]);
      const store = createNotesStore(s);
      const plain = JSON.parse(store.exportBackup());
      expect(JSON.stringify(plain.notes)).not.toContain('starred');
      store.setStarred('a', true);
      const backup = store.exportBackup();
      expect(JSON.parse(backup).notes[0].starred).toBe(true);
      expect(JSON.parse(backup).notes[1]).not.toHaveProperty('starred');

      const fresh = createNotesStore(new MemStorage());
      fresh.importBackup(backup);
      const a = fresh.getState().notes.find((x) => x.id === 'a');
      expect(a?.starred).toBe(true);
      expect(a?.updatedAt).toBe(10);

      const equal = JSON.parse(backup);
      equal.notes[0].starred = undefined;
      fresh.importBackup(JSON.stringify(equal));
      expect(fresh.getState().notes.find((x) => x.id === 'a')?.starred).toBe(
        true,
      );
    });
  });

  describe('tags', () => {
    it('create starts with no tags and migrates old notes', () => {
      const s = new MemStorage();
      seed(s, [{ ...n('a', 'A', 1), starred: true }]);
      const store = createNotesStore(s);
      expect(store.getState().notes[0]).toMatchObject({
        starred: true,
        tags: [],
      });
      expect(store.create().tags).toEqual([]);
    });

    it('drops malformed tags on load', () => {
      const s = new MemStorage();
      seed(s, [
        { ...n('a', 'A', 1), tags: ['x', 3, ' X ', 'a,b', ''] },
        { ...n('b', 'B', 2), tags: 'nope' },
      ]);
      const store = createNotesStore(s);
      const byId = new Map(store.getState().notes.map((x) => [x.id, x]));
      expect(byId.get('a')?.tags).toEqual(['x']);
      expect(byId.get('b')?.tags).toEqual([]);
    });

    it('setTags normalises, persists and bumps updatedAt', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'A', 5)]);
      const store = createNotesStore(s);
      store.setTags('a', [' Work ', 'work', 'home']);
      const note = store.getState().notes[0];
      expect(note?.tags).toEqual(['Work', 'home']);
      expect(note?.updatedAt).toBeGreaterThan(5);
      expect(JSON.parse(s.data.get('quill:v1') ?? '')[0].tags).toEqual([
        'Work',
        'home',
      ]);
    });

    it('setTags is a no-op for a missing note or an equal list', () => {
      const s = new MemStorage();
      seed(s, [{ ...n('a', 'A', 5), tags: ['x', 'y'] }]);
      const store = createNotesStore(s);
      const seen: unknown[] = [];
      store.subscribe((st) => seen.push(st));
      store.setTags('zzz', ['q']);
      store.setTags('a', ['x', 'y']);
      expect(seen).toHaveLength(0);
      expect(store.getState().notes[0]?.updatedAt).toBe(5);
      store.setTags('a', ['y', 'x']);
      expect(seen).toHaveLength(1);
    });

    it('cross-tab pending merge keeps local body and takes their tags', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'A', 1)]);
      const store = createNotesStore(s);
      store.select('a');
      store.update('a', 'local');
      store.setPendingLocalEdits(true);
      seed(s, [{ ...n('a', 'remote', 99), tags: ['theirs'] }]);
      window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
      const note = store.getState().notes[0];
      expect(note?.body).toBe('local');
      expect(note?.tags).toEqual(['theirs']);
    });

    it('round-trips through backup export and import', () => {
      const s = new MemStorage();
      seed(s, [{ ...n('a', 'A', 1), tags: ['x'] }]);
      const text = createNotesStore(s).exportBackup();
      expect(JSON.parse(text).notes[0].tags).toEqual(['x']);
      const t = new MemStorage();
      const other = createNotesStore(t);
      expect(other.importBackup(text)).toMatchObject({ ok: true, added: 1 });
      expect(other.getState().notes[0]?.tags).toEqual(['x']);
      const legacy = JSON.stringify({
        app: 'quill',
        format: 1,
        notes: [n('b', 'B', 2)],
      });
      other.importBackup(legacy);
      expect(other.getState().notes.find((x) => x.id === 'b')?.tags).toEqual(
        [],
      );
    });
  });

  describe('archive', () => {
    const writes = (spy: { mock: { calls: unknown[][] } }) =>
      spy.mock.calls.filter((c) => c[0] === 'quill:v1').length;

    it('archives and unarchives without touching updatedAt, and persists', () => {
      const s = new MemStorage();
      seed(s, [{ ...n('a', 'A', 5), starred: true, tags: ['t'] }]);
      const store = createNotesStore(s);
      store.setArchived('a', true);
      const got = store.getState().notes[0];
      expect(got?.archivedAt).toBeGreaterThan(0);
      expect(got).toMatchObject({ updatedAt: 5, body: 'A', starred: true });
      expect(JSON.parse(s.data.get('quill:v1') ?? '[]')[0].archivedAt).toBe(
        got?.archivedAt,
      );
      expect(createNotesStore(s).getState().notes[0]?.archivedAt).toBe(
        got?.archivedAt,
      );
      store.setArchived('a', false);
      expect(store.getState().notes[0]).not.toHaveProperty('archivedAt');
    });

    it('drops an invalid archivedAt without a backup copy', () => {
      const s = new MemStorage();
      seed(s, [
        { ...n('a', 'A', 1), archivedAt: 'x' },
        { ...n('b', 'B', 2), archivedAt: -3 },
      ]);
      const store = createNotesStore(s);
      expect(store.getState().notes.some((x) => 'archivedAt' in x)).toBe(false);
      expect([...s.data.keys()].some((k) => k.includes('backup'))).toBe(false);
    });

    it('writes and emits once per batch, and not at all for a no-op', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'A', 1), n('b', 'B', 2), n('c', 'C', 3)]);
      const store = createNotesStore(s);
      const spy = vi.spyOn(s, 'setItem');
      const listener = vi.fn();
      store.subscribe(listener);
      store.setArchivedMany(['a', 'b', 'zzz'], true);
      expect(writes(spy)).toBe(1);
      expect(listener).toHaveBeenCalledTimes(1);
      store.setArchivedMany(['a', 'b'], true);
      store.setArchivedMany(['c'], false);
      expect(writes(spy)).toBe(1);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('moves selection to the next unarchived note, else previous, else null', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'A', 3), n('b', 'B', 2), n('c', 'C', 1)]);
      const store = createNotesStore(s);
      store.select('a');
      store.setArchivedMany(['a', 'b'], true);
      expect(store.getState().selectedId).toBe('c');
      store.setArchived('c', true);
      expect(store.getState().selectedId).toBeNull();
      const t = new MemStorage();
      seed(t, [n('a', 'A', 3), n('b', 'B', 2), n('c', 'C', 1)]);
      const two = createNotesStore(t);
      two.select('c');
      two.setArchived('c', true);
      expect(two.getState().selectedId).toBe('b');
    });

    it('does not pick an archived note as the most recent on load', () => {
      const s = new MemStorage();
      seed(s, [{ ...n('a', 'A', 9), archivedAt: 5 }, n('b', 'B', 1)]);
      expect(createNotesStore(s).getState().selectedId).toBe('b');
    });

    it('round-trips through backup, with the newer copy winning', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'A', 1)]);
      const store = createNotesStore(s);
      store.setArchived('a', true);
      const text = store.exportBackup();
      expect(JSON.parse(text).notes[0]).toHaveProperty('archivedAt');
      const other = createNotesStore(new MemStorage());
      other.importBackup(text);
      expect(other.getState().notes[0]?.archivedAt).toBe(
        store.getState().notes[0]?.archivedAt,
      );
      const stale = JSON.stringify({
        app: 'quill',
        format: 1,
        notes: [{ ...n('a', 'A', 1), archivedAt: 99 }],
      });
      expect(other.importBackup(stale)).toMatchObject({ unchanged: 1 });
    });

    it('carries archivedAt through a cross-tab merge of pending edits', () => {
      const s = new MemStorage();
      seed(s, [n('a', 'A', 1)]);
      const store = createNotesStore(s);
      store.setPendingLocalEdits(true);
      seed(s, [{ ...n('a', 'A', 2), archivedAt: 7 }]);
      window.dispatchEvent(new StorageEvent('storage', { key: 'quill:v1' }));
      expect(store.getState().notes[0]?.archivedAt).toBe(7);
    });
  });
});
