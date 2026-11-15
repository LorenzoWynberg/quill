# Editor and autosave

`mountEditor(root, { store, render, previewEl })` in `src/editor/index.ts` builds the editor inside the `#editor` section. `src/main.ts` passes the notes store, `renderMarkdown` and the preview section.

- The editor holds an empty-state message and a labelled `textarea` (`#editor-input`). The message shows while no note is selected.
- Each input event re-renders the preview synchronously, then schedules a save 300 ms later (`DEBOUNCE_MS`). There is no Save button.
- While an edit is unsaved the editor calls `store.setPendingLocalEdits(true)`; a flush calls `store.update(id, value)` and clears the flag.
- Selecting another note saves the pending text to the old note first, then loads the new body.
- An `external` store update replaces the textarea text only when no local edit is pending, and keeps the caret within the new length.
- A pending edit is flushed when the page becomes hidden (`visibilitychange`) and on `beforeunload`.

## Word and character count

A `p#editor-count` under the textarea shows text such as `1 word · 5 characters`. The textarea points at it with `aria-describedby`. `updateCount()` runs on every input event and on every `show()`; the counter is hidden and empty while no note is selected.

`src/editor/count.ts` holds the logic:

- `countWords(body)` counts whitespace-separated words in `markdownToPlainText(body)`, so syntax and link targets are excluded. Code text counts. An empty result is 0.
- `countCharacters(body)` counts code points of the raw source, so an emoji counts once.
- `formatCount(body)` joins the two with ` · ` and uses singular for exactly 1.

`markdownToPlainText` lives in `src/preview/index.ts` and walks the markdown-it tokens; the editor imports it through `../preview`. `editor.css` styles `.editor-count` with theme tokens.

## Edit/Preview toggle

`mountEditor` prepends a `pane-toggle` group of Edit and Preview buttons to the parent `main`. A button sets `main.dataset.pane` and `aria-pressed`. `editor.css` uses the attribute to show one pane on phones.

The skip link (`a.skip-link`) calls `showEditPane()` before focusing, so focus never lands on a hidden pane. It focuses the section when no note is selected.

The document and window listeners are never removed; there is no dispose function.
