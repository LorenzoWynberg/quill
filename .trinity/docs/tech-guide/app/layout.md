# Project layout and shell

- `src/main.ts` imports `shared/theme.css` and `shared/shell.css`, then renders the two-pane shell into `#app`: a skip link, a `nav` labelled Notes, and a `main` (`data-pane="edit"`) holding Editor and Preview sections.
- `src/notes/`, `src/editor/`, `src/preview/` are domain folders, each with an `index.ts` stub.
- `src/shared/theme.css` holds the Paper colour, font and text-size tokens as CSS custom properties on `:root`.
- `src/shared/smoke.test.ts` is an environment check for the test setup (vitest with happy-dom).
- `vite.config.ts` sets `base: '/quill/'`, so built assets load from `/quill/`.
- `markdown-it` is the markdown renderer dependency.
