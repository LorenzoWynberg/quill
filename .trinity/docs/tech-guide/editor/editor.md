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

## Tag field

Below the textarea, a `tag-field` group (labelled "Tags") shows one chip per tag of the open note and an `Add tag` input. It is hidden while no note is selected. Validation lives in the notes domain (`normaliseTag`, `normaliseTags`; see [Note tags](../notes/tags.md)); the editor only collects input.

- Enter commits the whole input. A comma typed into the input commits the text before it and keeps the text after it; a paste or other bulk insert containing commas commits every part. Blur commits a non-blank draft, except when the blur comes from pressing a `Remove` button (a `pointerdown` or `mousedown` on it suppresses the blur commit until the pointer is released, so the click removes that tag once).
- Backspace in an empty input removes the last tag.
- Each chip has a `Remove` button (`aria-label` `Remove tag "<tag>"`). After removal focus moves to the next chip's button, or the input when none remains.
- Commits go through `store.setTags`. The `tag-msg` live region (`aria-live="polite"`) says `Already tagged.` when an entry duplicates a tag, and `Tags can be up to 32 characters.` when an entry is invalid. A paste or Enter with some invalid parts commits the valid parts; the over-long parts stay in the input and the message is announced once. The next keystroke clears the message. If the write fails (`store.getState().writeError` is set) no chip is left, the text stays in the input and the region says `Tag not saved: storage is unavailable or full.`; the message clears after the next successful write. It shows no message for a successful add or remove.
- Chips re-render on every store update; switching notes clears the input and message.
