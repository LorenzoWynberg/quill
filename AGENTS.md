<!-- TRINITY-MANAGED-START -->

## Documentation

`quill` is a repo of the quill project, and its root is a package (Quill). Trinity generates this section from the project packages and rewrites it whenever they change, so write your own notes outside it.

Its documentation starts at [`.trinity/docs/index.md`](.trinity/docs/index.md), which links every page in the `.trinity/docs/` families:

- `rules/<topic>.md`: the rules every change in the package follows
- `gotchas/<tech>.md`: one page per technology in the package stack
- `tech-guide/<section>/<chapter>.md`: how the code works
- `user-guide/<section>/<chapter>.md`: what a person sees and does

<!-- TRINITY-MANAGED-END -->

## Quill conventions

- Stack record: `package.json` and `pnpm-lock.yaml` are the record of the stack; read versions from them.
- Design source: `DESIGN.md` is the design's source; `src/shared/theme.css` is its theme layer. Use `var(--role)` tokens, never literal colours.
- Layering: the `notes`, `editor` and `preview` domains import only from `src/shared/`, never from each other. Only `src/main.ts` composes them.
- Tests: a `*.test.ts` file sits beside the code it covers, in that code's domain folder.
