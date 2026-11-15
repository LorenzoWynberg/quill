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

The package rules live in [`.trinity/docs/index.md`](.trinity/docs/index.md#rules); read them there.

Journey probes live in `probes/`: each drives one journey on a real Chromium against a running app (`CHROME=<chromium> node probes/<name>.mjs <app url> [screenshot dir]`).
