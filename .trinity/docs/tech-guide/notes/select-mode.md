# Select mode and bulk archive

`mountNoteList` in `src/notes/list.ts` has a select mode: tick several notes, then archive or restore them in one action. Select mode and the selection live in the `mountNoteList` closure only; nothing is stored. See [archive.md](archive.md) for the archive state itself.

## Selecting

- A `Select` toggle turns the mode on. Each row then shows a checkbox with a unique id (`notes-select-<mount>-<n>`, so two lists in one document never collide).
- Clicking a box ticks one note. Shift-click, or Shift+Space on a focused box, ticks the range from the last acted-on note (the anchor) to the clicked one over the visible rows. With no usable anchor, the click toggles that one note.
- A bar shows `N selected` (polite live region), `Select all` (every visible row), the action button and `Cancel`. The action is `Archive` in the Notes view and `Restore` in the Archived view.
- `Esc` leaves select mode and returns focus to the `Select` toggle. The search box and tag filter clear themselves on `Esc` first and call `preventDefault`; the root handler ignores a prevented event.

## The batch action

- The action works on the ticked rows in visible order. `changedArchiveIds(notes, ids, archived)` (exported) returns the ids that would really change: unique, existing, not already in the target state.
- It calls `store.setArchivedMany` once: one storage write, one `'local'` emit. The selection clears first.
- If nothing changes, nothing is announced and no toast shows.
- Focus goes to the first visible row not moved, else `Cancel`.
- The result is announced once in the polite `.notes-live` region: `Archived 3 notes. Archived (n).` or `Restored ...`.

## Undo toast

- `.notes-toast` shows `N notes archived` (or `restored`) with an `Undo` button. It is visual only; the announcement above is the spoken one.
- It hides after `TOAST_MS` (5000 ms). A new batch restarts the full 5 s. Focus inside the toast pauses the timer; leaving it restarts it. It does not pause on pointer hover (see Hover pause below).
- `Undo` reverses exactly the ids the batch changed, announces `Undid archive of N notes. Archived (n).`, hides the toast and moves focus to the current view toggle.

## Hover pause

A hover pause was tried and removed. After an archive-all empties the view, the search row collapses and the toast slides under a resting pointer; Chromium then fires `mouseenter` and the toast never hid. The pause is focus-only. Pointer pause for WCAG 2.2.1 is an open design question.

## Probe

`probes/select-mode.mjs` drives the journey on a real Chromium against a running app: `CHROME=<chromium> node probes/select-mode.mjs <app url> [screenshot dir]`.
