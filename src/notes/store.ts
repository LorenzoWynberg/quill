import { normaliseTags } from './tags';

export interface Note {
  id: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  starred?: boolean;
  tags: string[];
}

export type WriteError = 'quota' | 'unavailable' | null;
export type ChangeSource = 'local' | 'external';

export interface NotesState {
  notes: Note[];
  selectedId: string | null;
  writeError: WriteError;
}

export type ImportResult =
  | { ok: true; added: number; updated: number; unchanged: number }
  | { ok: false; reason: 'invalid' | 'write' };

export interface NotesStore {
  getState(): NotesState;
  subscribe(
    listener: (state: NotesState, source: ChangeSource) => void,
  ): () => void;
  create(): Note;
  select(id: string): void;
  update(id: string, body: string): void;
  remove(id: string): void;
  setStarred(id: string, starred: boolean): void;
  setTags(id: string, tags: readonly string[]): void;
  setPendingLocalEdits(pending: boolean): void;
  exportBackup(): string;
  importBackup(text: string): ImportResult;
}

const KEY = 'quill:v1';
const SELECTED_KEY = 'quill:v1:selected';
const BACKUP_PREFIX = 'quill:v1:backup:';

function isNote(value: unknown): value is Note {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.body === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number'
  );
}

function normalise(n: Note): Note {
  const rawTags: unknown = n.tags;
  const base: Note = {
    id: n.id,
    body: n.body,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    tags: normaliseTags(
      Array.isArray(rawTags)
        ? rawTags.filter((t): t is string => typeof t === 'string')
        : [],
    ),
  };
  return n.starred === true ? { ...base, starred: true } : base;
}

function isQuota(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: unknown; code?: unknown };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  );
}

function defaultStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createNotesStore(
  storage: Storage | null = defaultStorage(),
): NotesStore {
  let notes: Note[] = [];
  let selectedId: string | null = null;
  let writeError: WriteError = null;
  let pending = false;
  let writesBlocked = false;
  const listeners = new Set<
    (state: NotesState, source: ChangeSource) => void
  >();

  interface Loaded {
    status: 'ok' | 'unavailable';
    notes: Note[];
    raw: string | null;
    damaged: boolean;
  }

  function readNotes(): Loaded {
    if (!storage)
      return { status: 'unavailable', notes: [], raw: null, damaged: false };
    let raw: string | null;
    try {
      raw = storage.getItem(KEY);
    } catch {
      return { status: 'unavailable', notes: [], raw: null, damaged: false };
    }
    if (raw === null) return { status: 'ok', notes: [], raw, damaged: false };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed))
        return { status: 'ok', notes: [], raw, damaged: true };
      const valid = parsed.filter(isNote);
      return {
        status: 'ok',
        notes: valid.map(normalise),
        raw,
        damaged: valid.length !== parsed.length,
      };
    } catch {
      return { status: 'ok', notes: [], raw, damaged: true };
    }
  }

  function readSelected(): string | null {
    try {
      return storage?.getItem(SELECTED_KEY) ?? null;
    } catch {
      return null;
    }
  }

  function mostRecent(list: Note[]): string | null {
    let best: Note | null = null;
    for (const n of list) if (!best || n.updatedAt > best.updatedAt) best = n;
    return best?.id ?? null;
  }

  function resolveSelected(preferred: string | null): string | null {
    return preferred !== null && notes.some((n) => n.id === preferred)
      ? preferred
      : mostRecent(notes);
  }

  function getState(): NotesState {
    return {
      notes: [...notes].sort(
        (a, b) =>
          Number(b.starred === true) - Number(a.starred === true) ||
          b.updatedAt - a.updatedAt,
      ),
      selectedId,
      writeError,
    };
  }

  function emit(source: ChangeSource): void {
    const state = getState();
    for (const l of [...listeners]) l(state, source);
  }

  function persist(): void {
    if (writesBlocked) return;
    if (!storage) {
      writeError = 'unavailable';
      return;
    }
    try {
      storage.setItem(KEY, JSON.stringify(notes));
      if (selectedId === null) storage.removeItem(SELECTED_KEY);
      else storage.setItem(SELECTED_KEY, selectedId);
      writeError = null;
    } catch (err) {
      writeError = isQuota(err) ? 'quota' : 'unavailable';
    }
  }

  function backupDamaged(raw: string | null): void {
    if (raw === null || !storage) return;
    try {
      storage.setItem(`${BACKUP_PREFIX}${Date.now()}`, raw);
    } catch (err) {
      writesBlocked = true;
      writeError = isQuota(err) ? 'quota' : 'unavailable';
    }
  }

  const loaded = readNotes();
  if (loaded.status === 'unavailable') {
    writeError = 'unavailable';
    writesBlocked = Boolean(storage);
  } else {
    notes = loaded.notes;
    if (loaded.damaged) backupDamaged(loaded.raw);
  }
  selectedId = resolveSelected(readSelected());

  if (typeof window !== 'undefined' && storage) {
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== null && event.key !== KEY) return;
      if (event.storageArea && event.storageArea !== storage) return;
      const reloaded = readNotes();
      if (reloaded.status === 'unavailable') return;
      const open = notes.find((n) => n.id === selectedId);
      if (reloaded.damaged) {
        backupDamaged(reloaded.raw);
        const byId = new Map(notes.map((n) => [n.id, n]));
        for (const n of reloaded.notes) {
          const have = byId.get(n.id);
          if (
            !have ||
            (n.updatedAt > have.updatedAt && !(pending && open?.id === n.id))
          )
            byId.set(n.id, n);
        }
        notes = [...byId.values()];
      } else {
        const next = reloaded.notes.filter(
          (n) => !(pending && open && n.id === open.id),
        );
        if (pending && open) {
          const theirs = reloaded.notes.find((n) => n.id === open.id);
          const merged = theirs
            ? normalise({
                ...open,
                starred: theirs.starred,
                tags: theirs.tags,
              })
            : open;
          notes = [...next, merged];
        } else notes = reloaded.notes;
      }
      selectedId = resolveSelected(selectedId);
      emit('external');
    });
  }

  return {
    getState,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    create() {
      const now = Date.now();
      const latest = notes.reduce((m, n) => Math.max(m, n.updatedAt), 0);
      const t = Math.max(now, latest + 1);
      const note: Note = {
        id: newId(),
        body: '',
        createdAt: t,
        updatedAt: t,
        tags: [],
      };
      notes = [...notes, note];
      selectedId = note.id;
      persist();
      emit('local');
      return note;
    },
    select(id) {
      if (!notes.some((n) => n.id === id)) return;
      selectedId = id;
      persist();
      emit('local');
    },
    update(id, body) {
      const current = notes.find((n) => n.id === id);
      if (!current) return;
      const t = Math.max(Date.now(), current.updatedAt + 1);
      notes = notes.map((n) =>
        n.id === id ? { ...n, body, updatedAt: t } : n,
      );
      persist();
      emit('local');
    },
    remove(id) {
      notes = notes.filter((n) => n.id !== id);
      if (selectedId === id) selectedId = mostRecent(notes);
      persist();
      emit('local');
    },
    setStarred(id, starred) {
      const current = notes.find((n) => n.id === id);
      if (!current || (current.starred === true) === starred) return;
      notes = notes.map((n) => {
        if (n.id !== id) return n;
        const { starred: _drop, ...rest } = n;
        void _drop;
        return starred ? { ...rest, starred: true } : rest;
      });
      persist();
      emit('local');
    },
    setTags(id, tags) {
      const current = notes.find((n) => n.id === id);
      if (!current) return;
      const next = normaliseTags(tags);
      if (
        next.length === current.tags.length &&
        next.every((t, i) => t === current.tags[i])
      )
        return;
      const t = Math.max(Date.now(), current.updatedAt + 1);
      notes = notes.map((n) =>
        n.id === id ? { ...n, tags: next, updatedAt: t } : n,
      );
      persist();
      emit('local');
    },
    setPendingLocalEdits(value) {
      pending = value;
    },
    exportBackup() {
      return JSON.stringify({
        app: 'quill',
        format: 1,
        exportedAt: new Date().toISOString(),
        notes: notes.map((n) => ({
          id: n.id,
          body: n.body,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
          ...(n.starred ? { starred: true } : {}),
          tags: n.tags,
        })),
      });
    },
    importBackup(text) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, reason: 'invalid' };
      }
      if (typeof parsed !== 'object' || parsed === null)
        return { ok: false, reason: 'invalid' };
      const env = parsed as Record<string, unknown>;
      if (
        env.app !== 'quill' ||
        env.format !== 1 ||
        !Array.isArray(env.notes) ||
        !env.notes.every(isNote)
      )
        return { ok: false, reason: 'invalid' };

      const incoming = new Map<string, Note>();
      for (const n of env.notes as Note[]) {
        const have = incoming.get(n.id);
        if (!have || n.updatedAt > have.updatedAt) incoming.set(n.id, n);
      }
      const merged = new Map(notes.map((n) => [n.id, n]));
      let added = 0;
      let updated = 0;
      let unchanged = 0;
      for (const n of incoming.values()) {
        const have = merged.get(n.id);
        const copy = normalise(n);
        if (!have) {
          merged.set(n.id, copy);
          added++;
        } else if (n.updatedAt > have.updatedAt) {
          merged.set(n.id, copy);
          updated++;
        } else unchanged++;
      }
      if (added + updated === 0) return { ok: true, added, updated, unchanged };

      const next = [...merged.values()];
      if (writesBlocked || !storage) {
        writeError = 'unavailable';
        emit('external');
        return { ok: false, reason: 'write' };
      }
      try {
        storage.setItem(KEY, JSON.stringify(next));
      } catch (err) {
        writeError = isQuota(err) ? 'quota' : 'unavailable';
        emit('external');
        return { ok: false, reason: 'write' };
      }
      notes = next;
      const resolved = resolveSelected(selectedId);
      if (resolved !== selectedId) {
        selectedId = resolved;
        try {
          if (resolved === null) storage.removeItem(SELECTED_KEY);
          else storage.setItem(SELECTED_KEY, resolved);
        } catch {
          // best effort: the notes are already saved
        }
      }
      writeError = null;
      emit('external');
      return { ok: true, added, updated, unchanged };
    },
  };
}
