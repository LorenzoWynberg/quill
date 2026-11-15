# Editor and autosave

`mountEditor(root, { store, render, previewEl })` in `src/editor/index.ts` builds the editor inside the `#editor` section. `src/main.ts` passes the notes store, `renderMarkdown` and the preview section.

- The editor holds an empty-state message and a labelled `textarea` (`#editor-input`). The message shows while no note is selected.
- Each input event re-renders the preview synchronously, then schedules a save 300 ms later (`DEBOUNCE_MS`). There is no Save button.
- While an edit is unsaved the editor calls `store.setPendingLocalEdits(true)`; a flush calls `store.update(id, value)` and clears the flag.
- Selecting another note saves the pending text to the old note first, then loads the new body.
- An `external` store update replaces the textarea text only when no local edit is pending, and keeps the caret within the new length.
- A pending edit is flushed when the page becomes hidden (`visibilitychange`) and on `beforeunload`.

## Edit/Preview toggle

`mountEditor` prepends a `pane-toggle` group of Edit and Preview buttons to the parent `main`. A button sets `main.dataset.pane` and `aria-pressed`. `editor.css` uses the attribute to show one pane on phones.

The skip link (`a.skip-link`) calls `showEditPane()` before focusing, so focus never lands on a hidden pane. It focuses the section when no note is selected.

The document and window listeners are never removed; there is no dispose function.
