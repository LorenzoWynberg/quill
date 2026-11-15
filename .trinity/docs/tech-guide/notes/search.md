# Searching the note list

`src/notes/search.ts` exports `matchesQuery(body, query)`, re-exported from `src/notes/index.ts`. `src/notes/list.ts` uses it to filter the list.

## Matching

- The query is trimmed and lower-cased. An empty query matches every note.
- A note matches when its body, or its title from `deriveTitle`, contains the query as a case-insensitive substring. A blank note has the derived title `Untitled`, so `untitled` matches it.

## List behaviour

- The list renders a `type="search"` input labelled "Search notes" and a "Clear search" button that shows only while a query is set.
- The filter is list-only: the store is never changed, and the editor, export and backup still see every note.
- Escape in the input clears the query, as does Clear search (focus returns to the input). New note clears the query so the new note is visible.
- The search row is hidden while there are no notes, and a query is dropped when the list empties.
- When notes exist but none match, a `role="status"` region shows `No notes match "<query>"`. Result counts are not announced.
- Focus restore after a render looks in both the actions row and the list.
