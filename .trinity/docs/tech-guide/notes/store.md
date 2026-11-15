# Notes store and list

`src/notes/store.ts` owns note state and persistence; `src/notes/list.ts` renders the note list from it.

## Storage

- Notes are a JSON array of `{ id, body, createdAt, updatedAt }` under the `localStorage` key `quill:v1`. The selected note id is under `quill:v1:selected`.
- On load, a missing key, corrupt JSON or a non-array value gives an empty list without throwing; entries that are not valid notes are dropped.
- `getState()` returns notes sorted most-recent-first by `updatedAt`. `create` and `update` bump `updatedAt` to stay strictly above the newest existing value, so order is stable within one millisecond.
- If the selected id is missing or unknown, the most recently updated note is selected. Deleting the selected note selects the most recent remaining one.

## Write failures

Every change runs `persist()`. A failed write sets `writeError` to `'quota'` (a quota error) or `'unavailable'` (anything else, or no storage). In-memory notes keep the text, so nothing typed is lost. A later successful write clears the error. The list shows it as a `role="alert"` message.

## Cross-tab sync

The store listens for `storage` events on `quill:v1` (and a `null` key, which means storage was cleared), reloads, and emits to subscribers with source `'external'`. Local changes emit `'local'`. `setPendingLocalEdits(true)` tells the store the open note has unsaved edits, so an external reload keeps this tab's copy of that note.

## List

`mountNoteList(root, store, options?)` renders a New note, Backup and Restore button row, a search input and Clear search button (see [search.md](search.md)), the alert, a `role="status"` notice, a second `role="status"` region for search results, and one open and one Delete button per note. Delete asks `window.confirm` first. After each render, focus returns to the element with the same `data-focus` key, looked up in both the actions row and the list, or to New note if it is gone. It returns an unsubscribe function.

## Backup and restore

`exportBackup()` returns JSON `{ app: 'quill', format: 1, exportedAt, notes }` with each note's `id`, `body`, `createdAt` and `updatedAt`. The Backup button downloads it as `quill-backup-YYYY-MM-DD.json`.

`importBackup(text)` is a non-destructive merge and returns an `ImportResult`:

- Text that is not JSON, or lacks `app: 'quill'`, `format: 1` or a `notes` array of valid notes, gives `{ ok: false, reason: 'invalid' }`.
- Duplicate ids inside the file keep the newest `updatedAt`.
- A note with an unknown id is added; a known id is replaced only when the file's `updatedAt` is strictly newer (equal keeps the local note); otherwise it counts as unchanged. Local notes absent from the file stay.
- When nothing is added or updated, nothing is written. A failed write sets `writeError`, leaves notes unchanged and gives `{ ok: false, reason: 'write' }`. On success it emits `'external'`, reselects if the selected id no longer resolves, and returns `{ ok: true, added, updated, unchanged }`.

The Restore button opens a hidden file input. Before importing, the list calls the `beforeRestore` option; `src/main.ts` passes the editor's `flush()` (returned by `mountEditor` as an `EditorHandle`) so a pending edit is saved first. The notice shows the counts, or a message for an invalid file, a write failure, an unreadable file, a failed flush (import aborted) or an unexpected error. The input is reset after every attempt.
