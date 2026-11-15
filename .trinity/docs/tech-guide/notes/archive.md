# Archived notes

The store in `src/notes/store.ts` gives a note an optional `archivedAt` timestamp. It is the state only: the store API, persistence, backup and sync. See [store.md](store.md) for the rest of the store.

## State

- `archivedAt?: number` is a finite number above 0. On load, any other value drops the field. An unarchived note has no field.
- `setArchived(id, archived)` and `setArchivedMany(ids, archived)` set or clear it. `setArchived` calls `setArchivedMany([id], archived)`.
- A batch uses one `Date.now()` timestamp for every note it changes. Unknown ids, duplicate ids and notes already in the requested state are skipped. If nothing changes, nothing is persisted and nothing is emitted. Otherwise it persists once and emits `'local'` once.
- Archiving does not bump `updatedAt`, so list order is unchanged.

## Selection

- When archiving changes the selected note, the selection moves to the next unarchived note in `getState()` order, or else the previous one, or else `null`.
- `mostRecent` ignores archived notes, so loading, removing or an unresolved saved selection never falls back to an archived note.

## Backup and sync

- `exportBackup()` writes `archivedAt` on archived notes only. The backup format stays 1.
- `importBackup` merges `archivedAt` like any other field: the file's copy wins only when its `updatedAt` is strictly newer.
- In an external reload with pending local edits, the open note keeps this tab's text and takes the other tab's `archivedAt`, as it does for `starred` and `tags`.
