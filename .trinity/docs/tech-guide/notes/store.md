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

`mountNoteList(root, store)` renders a New note button, the alert, and one open and one Delete button per note. Delete asks `window.confirm` first. After each render, focus returns to the element with the same `data-focus` key, or to New note if it is gone. It returns an unsubscribe function.
