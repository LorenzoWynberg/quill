# Changelog

## 0.2.2 - 2026-11-15

### Improved

#### Clearer message when you restore the wrong file

If you choose a file in **Restore** that isn't a Quill backup, Quill now says so in plain words: **That file is not a Quill backup.** The old "Restore failed:" wording is gone. Junk text, an HTML page, an empty file and JSON that isn't shaped like a backup all show this message.

The behaviour is the same as before: a file like this changes nothing. Your notes, the note you have selected and what's saved in your browser stay exactly as they were. Pick the right backup file and try again.

Other Restore messages keep their current wording. These are the success summary (`Restore complete: added N, updated N, unchanged N.`), the notice for when your notes can't be saved, and the notices for a file that can't be read or an open note that hasn't been saved yet.

## 0.2.1 - 2026-11-15

### Fixed

**Exported notes now get clean, portable file names.** Before this fix, a note titled something like `Plan  for  May...` (two spaces between words) exported as `Plan  for  May....md`. Repeated spaces and the dots stacked in front of `.md` caused some filesystems and sync tools to reject or rename the file. Runs of whitespace in a title now collapse to a single space, and any dots or spaces just before the extension are removed, so the same note exports as `Plan for May.md`.

The fix covers single-note export and the zip export of all your notes, so both produce the same names. Your notes are unchanged; only the names of the exported files differ. If you have scripts or folders that expect the old names, you may see slightly different names on your next export.

## 0.2.0 - 2026-11-15

### New: back up and restore your notes

Quill keeps your notes in this browser's local storage. Until now, clearing site data or moving to another computer meant losing them. Two new buttons next to **New note** fix that.

#### Backup

**Backup** downloads all your notes as a single file named `quill-backup-YYYY-MM-DD.json`. The file holds each note's text and its created and last-edited times. Keep it somewhere safe, or copy it to another machine.

#### Restore

**Restore** opens a file picker. Choose a Quill backup and its notes are merged into the ones you already have. The merge is built to be safe:

- **It never deletes anything.** Notes you have now that aren't in the backup stay as they are.
- **Newer edits win.** A note in the backup replaces your copy only if the backup's version was edited more recently. If yours is newer or the same, it's kept.
- **Notes you don't have are added.**
- **A bad file changes nothing.** If the file isn't a valid Quill backup, or your browser's storage is full or unavailable, your notes are left exactly as they were and Quill tells you why.

When a restore finishes, a message below the buttons shows how many notes were added, updated and left unchanged. It stays until you restore again. You don't get a confirmation prompt first, because restoring can't remove or downgrade anything. Any note you're in the middle of editing is saved before the restore runs, so your latest typing isn't lost.

#### Layout and accessibility

New note, Backup and Restore share one row. On narrow screens the row wraps instead of scrolling sideways. All three are standard buttons with a visible focus outline, so you can reach and use them from the keyboard. Restore results are announced to screen readers.

## 0.1.0 - 2026-11-15

### New: Export your notes as Markdown

Your notes no longer have to stay inside this browser. Quill can now save your writing as plain Markdown files that open in any editor, sync to any folder, and outlast any one browser profile.

#### Export the note you're editing

The editor now has an **Export** button that downloads the open note as a `.md` file named after its title. Any edits you haven't saved yet go into the file, so what you download matches what's on screen. Characters that filenames can't contain are removed, very long titles are cut to 80 characters, and a note with no usable title downloads as `Untitled.md`. The button is greyed out when no note is open.

#### Export all notes at once

The note list now has an **Export all** button that downloads every note as one zip file named `quill-notes-YYYY-MM-DD.zip`. Each note in the zip is its own `.md` file. When two notes have the same title, Quill numbers the extra copies, for example `Ideas (2).md`, so no note overwrites another. Your latest unsaved edits are included here too. The button is greyed out when you have no notes.

#### Good to know

Exporting copies your notes and leaves the originals where they are. Everything stays in Quill as before, and nothing is uploaded anywhere. The download is created in your browser and saved straight to your computer.
