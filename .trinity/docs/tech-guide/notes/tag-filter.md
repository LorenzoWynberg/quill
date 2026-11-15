# Filtering the note list by tag

`src/notes/list.ts` renders a "Filter by tag" select inside the search region. It composes with the text search in [Searching the note list](search.md) and uses `sameTag` from [Note tags](tags.md).

## Options

- The options are `All tags` plus every distinct tag across all notes, de-duplicated case-insensitively (first spelling wins) and sorted with `localeCompare` ignoring case.
- The select row is hidden while no note has a tag. Options are rebuilt on every render.

## Filtering

- A note shows when it matches the text query and, if a tag is active, carries that tag (compared with `sameTag`).
- If the active tag no longer exists, or differs only in spelling, `activeTag` is rewritten to the canonical option, or cleared when gone, so the select never reads blank while filtering.
- The filter is list-only, like search: the store is unchanged.

## Clearing and focus

- A "Clear tag filter" button shows only while a tag is active; it clears the tag and returns focus to the select.
- Escape on the select clears the active tag.
- New note clears both the query and the tag.
- Focus restore after a render also looks in the filter row (`data-focus="tag-filter"`).

## Empty state

When notes exist but none are visible, the `role="status"` region reads `No notes tagged "<tag>"` (tag only) or `No notes tagged "<tag>" match "<query>"` (both). Without a tag the text from the search page applies.

## Known gaps

Changing the tag while matches remain announces no result count. The empty-state tag-only branch is untested.
