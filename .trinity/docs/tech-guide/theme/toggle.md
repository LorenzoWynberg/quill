# Theme toggle

- `src/shared/theme.ts` exports `THEME_STORAGE_KEY` (`quill:theme`), `ThemeChoice` (`light | dark | system`), `readThemeChoice`, `applyThemeChoice` and `mountThemeControl`.
- `readThemeChoice` returns `light` or `dark` when stored, otherwise `system` (also when storage throws).
- `applyThemeChoice` sets `data-theme` on `<html>` for `light`/`dark` and removes it for `system`; it stores `light`/`dark` and removes the key for `system`. A storage failure is swallowed, so the choice still applies for the page view.
- `mountThemeControl` appends a `fieldset.theme-control` of three radios (Light, Dark, System) named `theme` to a container.
- `index.html` carries an inline script in `<head>` that reads `quill:theme` and sets `data-theme` before first paint; it must stay in step with `THEME_STORAGE_KEY` (covered by `src/shared/prepaint.test.ts`).
- `src/shared/theme.css` selects dark tokens by `[data-theme='dark']` and, for `system`, by `prefers-color-scheme: dark`.
- `src/main.ts` renders a `header.app-header` (app name plus a `[data-theme-control]` slot) above the panes; `#app` uses `grid-template-rows: auto 1fr` so the header row stays compact.
