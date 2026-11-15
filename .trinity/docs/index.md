# Quill

Quill is a browser notes app: write markdown, see it rendered, keep notes in local storage. This package is the Vite + TypeScript web app, served under `/quill/`.

## Rules

- Use `var(--role)` tokens from `src/shared/theme.css`, never literal colours; `DESIGN.md` is the design source.
- `notes`, `editor` and `preview` import only from `src/shared/`; only `src/main.ts` composes them.
- A `*.test.ts` file sits beside the code it covers.
- Versions come from `package.json` and `pnpm-lock.yaml`.

## Commands

- `pnpm dev`: dev server
- `pnpm build`: typecheck then production build into `dist/` (assets under `/quill/`)
- `pnpm test`: vitest run

## Guide

- [Project layout and shell](tech-guide/app/layout.md)
- [Editor and autosave](tech-guide/editor/editor.md)
- [Markdown preview](tech-guide/app/preview.md)
- [Notes store and list](tech-guide/notes/store.md)
