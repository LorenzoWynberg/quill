export interface Note {
  id: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export type WriteError = 'quota' | 'unavailable' | null;
export type ChangeSource = 'local' | 'external';

export interface NotesState {
  notes: Note[];
  selectedId: string | null;
  writeError: WriteError;
}

export interface NotesStore {
  getState(): NotesState;
  subscribe(
    listener: (state: NotesState, source: ChangeSource) => void,
  ): () => void;
  create(): Note;
  select(id: string): void;
  update(id: string, body: string): void;
  remove(id: string): void;
  setPendingLocalEdits(pending: boolean): void;
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
        notes: valid,
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
      notes: [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
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

  const loaded = readNotes();
  if (loaded.status === 'unavailable') {
    writeError = 'unavailable';
    writesBlocked = Boolean(storage);
  } else {
    notes = loaded.notes;
    if (loaded.damaged && loaded.raw !== null && storage) {
      try {
        storage.setItem(`${BACKUP_PREFIX}${Date.now()}`, loaded.raw);
      } catch (err) {
        writesBlocked = true;
        writeError = isQuota(err) ? 'quota' : 'unavailable';
      }
    }
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
        notes = pending && open ? [...next, open] : reloaded.notes;
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
      const note: Note = { id: newId(), body: '', createdAt: t, updatedAt: t };
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
    setPendingLocalEdits(value) {
      pending = value;
    },
  };
}
