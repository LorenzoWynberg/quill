# Project layout and shell

- `src/main.ts` imports `shared/theme.css` and `shared/shell.css`, then renders the two-pane shell into `#app`: a skip link, a `header.app-header` (the "Quill" name plus the theme control mounted from `src/shared/theme.ts`, see `tech-guide/theme/toggle.md`), a `nav` labelled Notes, and a `main` (`data-pane="edit"`) holding Editor and Preview sections.
- `src/notes/` holds the notes store, title derivation and the note list (`list.ts`, with a persistent `role="alert"` region for storage errors), `src/editor/` holds the editor (`index.ts`), `editor.css` and its tests, and `src/preview/` holds the preview, `preview.css` and its tests.
- `main.ts` imports `editor.css` and mounts the editor with the store, `renderMarkdown` and `previewEl`.
- `src/shared/theme.css` holds the Paper colour, font and text-size tokens as CSS custom properties on `:root`, plus the dark facet, selected by `data-theme`. `shell.css` spans the header across the full grid width.
- `src/shared/smoke.test.ts` is an environment check for the test setup (vitest with happy-dom).
- `vite.config.ts` sets `base: '/quill/'`, so built assets load from `/quill/`.
- `markdown-it` is the markdown renderer dependency.
