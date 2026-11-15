# Markdown preview

- `src/preview/index.ts` exports `renderMarkdown(body)`, which returns safe HTML using markdown-it in `commonmark` mode with tables and strikethrough enabled.
- Raw HTML is escaped (`html: false`) and unsafe link schemes are dropped by markdown-it's link validation, so no sanitizer is used.
- Links open with `target="_blank"` and `rel="noopener noreferrer"`.
- `src/preview/preview.css` styles the rendered output with theme tokens; tables scroll horizontally. The scroll container is not focusable, a known keyboard-access gap.
- `src/preview/index.test.ts` covers rendering, escaping, link safety and the `package.json` dependency.
