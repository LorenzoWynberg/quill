# Exporting notes

`src/notes/export.ts` turns notes into downloads. It uses `fflate` (`zipSync`, `strToU8`) for zip files.

## Filenames

- `noteFilename(note)` takes the derived title, drops control characters and `/ \ : * ? " < > |`, keeps at most 80 characters, trims, and appends `.md`. An empty result becomes `Untitled.md`. It does not collapse whitespace or avoid Windows reserved names.
- `uniqueFilenames(notes)` makes names unique case-insensitively by adding ` (2)`, ` (3)` before `.md`.
- `zipFilename()` gives `quill-notes-YYYY-MM-DD.zip` in local time.

## Downloads

- `exportNote(note)` downloads the body as `text/markdown;charset=utf-8`.
- `exportAllNotes(notes)` does nothing for an empty list, otherwise downloads one `application/zip` of every note body.
- `downloadBlob` clicks a hidden anchor with an object URL, then revokes the URL.

## UI

- The editor has an Export button, disabled when no note is open. It calls `flush()` so pending edits are saved, then exports the stored note.
- The note list has an Export all button (aria-label "Export all notes as a zip"), disabled with no notes. `mountNoteList(root, store, { beforeExport })` runs `beforeExport` first; `src/main.ts` passes the editor's `flush`.
- `mountEditor` returns an `EditorHandle` with `flush()`.
