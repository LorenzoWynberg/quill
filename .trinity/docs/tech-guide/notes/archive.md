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

## Views in the note list

`mountNoteList` in `src/notes/list.ts` shows one of two views, chosen by a `Notes` / `Archived (n)` toggle group (`aria-pressed`). A fresh mount starts on Notes; the view is not persisted.

- Notes lists unarchived notes. Archived lists archived notes, newest `archivedAt` first, ties broken by `updatedAt`. The count follows `storage` events.
- Each row has an `Archive` button (Notes view) or `Restore` button (Archived view), labelled `Archive "<title>"` / `Restore "<title>"`, beside `Delete`.
- Search, the tag list and the tag filter are scoped to the showing view.
- An empty Archived view reads `No archived notes.`; New note switches back to Notes.
- After Archive or Restore, focus moves to the next row's same button, else the previous row's, else the view toggle. If the focus target no longer exists, focus falls back to the New note button.
- A successful Archive or Restore sets a polite live region (`.notes-live`, screen-reader only) to `Archived "<title>". Archived (n).` or `Restored "<title>". Archived (n).`. A change that does not alter the note's archived state announces nothing and drops the pending focus target.
- The editor holds its own polite live region (`.editor-archived-live`) that reads `This note is archived.` while the open note is archived and is cleared on restore. The visible notice keeps `role="status"`.
