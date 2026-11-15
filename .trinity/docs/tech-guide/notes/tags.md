# Note tags

Every note carries a `tags` list of strings. `src/notes/tags.ts` holds the rules; `src/notes/store.ts` applies them; `src/notes/export.ts` writes them out.

## Normalising

- `normaliseTag(raw)` trims the text and returns `null` for an empty tag, a tag containing a comma, a tag containing a control character (`\p{Cc}`, which covers C0, DEL and C1, plus the U+2028 and U+2029 separators, so line breaks included), or a tag longer than `MAX_TAG_LENGTH` (32) code points.
- `sameTag(a, b)` compares case-insensitively.
- `normaliseTags(list)` drops invalid tags (so a tag with a control character is dropped on load and on import while the note's other tags are kept) and case-insensitive duplicates, keeping the first spelling and the order.

## Store

- Loading a note normalises `tags`; a missing or non-array value gives `[]`, and non-string entries are dropped. A new note starts with `tags: []`.
- `setTags(id, tags)` normalises the list, does nothing for an unknown id or when the result equals the current tags, and otherwise bumps `updatedAt`, persists and emits `'local'`.
- `exportBackup()` includes each note's `tags`, so backups and restores keep them.
- During an external reload with pending local edits, the open note keeps this tab's text but takes the other tab's `tags`.

## Markdown export

`noteMarkdown(note)` returns the body unchanged for a note without tags. With tags it prefixes a YAML front matter block: `tags:` followed by one `  - "tag"` line per tag, with `\` and `"` and every `\p{Cc}`, U+2028 and U+2029 character escaped as YAML double-quoted escapes (`\n`, `\r`, `\t`, `\u2028`, `\u2029`, and `\xNN` for other controls), so each tag stays on exactly one line, then `---`. `exportNote`, `exportAllNotes` and `buildNotesZip` all write through it.
