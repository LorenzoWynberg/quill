# Changelog

## 1.2.0 - 2026-11-15

### New: tidy many notes at once

You can now archive or restore a batch of notes in one action. Turn on **Select mode**, tick the notes you want, and archive them from the Notes view. To bring them back, select them in the Archived view and restore them together. **Select all** picks every note currently visible after search and tag filters, and Cancel or Esc leaves select mode.

Selecting a long run of notes is quick. Tick one note, then shift-click another to select every note between them. You can also do it all from the keyboard: tab to a note and press **Shift+Space** to extend the selection, so you never need the mouse.

### Undo after every batch

After you archive or restore a batch, a short **Undo** toast appears for about five seconds (it waits while you're focused on it). Undo puts back exactly the notes that batch changed and leaves the rest of your notes alone. Screen readers announce each batch and each undo, so you don't need to see the screen to use it.

### Improved: safer bulk changes

Each batch archive or restore saves all the selected notes in one write, and so does each undo, so a batch never ends up half-applied.

## 1.1.0 - 2026-11-15

### New: archive notes

You can now archive a note to get it out of your main list without deleting it. Every row in the note list has an **Archive** control, and a new **Archived** view next to **Notes** shows everything you've put away. In the Archived view, **Restore** puts a note back in your main list. Search and the tag filter work the same in both views, so you can find an archived note the same way you find any other.

### Archived notes stay open for reading and editing

Archiving a note doesn't lock it. When you open an archived note, the editor tells you it's archived and shows a **Restore** button right there. You can keep reading and editing it, and bring it back without going back to the list.

### Archived notes are still your notes

Archived notes are kept like any other note. They're included in backups, restores and exports, and if you have Quill open in more than one tab, archiving or restoring a note in one tab shows up in the others.

### Accessibility

Screen readers now announce when a note is archived or restored. Keyboard focus in the note list after you archive or restore a note works the same way it did before archiving was added.

## 1.0.0 - 2026-11-15

### New: tags for your notes

Notes can now carry tags. A chip field sits under the editor: type a tag and press Enter to add it, or remove one with the keyboard or the pointer. Tags live alongside the note, not inside it, so they never show up in your markdown text or the rendered preview. This chip field is the only place tags are added.

Tags stay consistent wherever you add them. Capitalisation and stray spaces are cleaned up the same way every time, so the same tag isn't stored twice. Tags survive a page reload, appear in other open tabs, come back intact when you restore a JSON backup, and are written into the frontmatter of exported markdown files.

### New: filter the note list by tag

Pick a tag to narrow the note list to the notes that have it, then clear the filter in one step to see everything again. The tag filter works together with search, so you can search within a tag without leaving the list.

### Fixed: tag entry and export edge cases

The chip field now handles awkward input reliably. A click, a paste or a save that fails while you're adding a tag is no longer lost without warning. Tags with unusual characters, whether typed in or brought in from a backup, no longer break the frontmatter of an exported markdown file.

## 0.5.0 - 2026-11-15

### New

#### Choose Light, Dark or System yourself

You can now pick Quill's theme instead of always following your operating system. A new **Theme** control in the app header has three options: **Light**, **Dark** and **System**. Light and Dark keep Quill in that theme whatever your OS is set to. System, the default, follows your OS setting as Quill always has.

#### Your choice is remembered

Quill saves your pick in this browser, so a reload or a new visit opens in the theme you chose. The theme is applied before the page is drawn, so you won't see a flash of the wrong theme while the app loads. Choosing System clears the saved setting and hands control back to your OS. Changing the theme never touches your notes or their backups.

### Changed

#### A slim header above your notes

Quill now has a header that runs across the full width of the app, above the notes list and the editor. It shows the Quill name and the theme control in small, muted text, so it stays quiet next to your writing. On narrow screens it sits above the stacked notes list and editor.

The theme control is a standard set of radio buttons. You can reach it with Tab, switch options with the arrow keys and see the usual focus outline. Its text meets WCAG AA contrast in both the light and dark themes.

## 0.4.0 - 2026-11-15

### New

#### Star the notes you care about

You can now star a note to pin it to the top of your note list. Starred notes stay above the rest, so the notes you go back to most are always within reach, however many others you write.

Stars persist. A starred note stays starred after you reload the page, shows up the same way in your other open Quill tabs, and is kept when you export or restore a JSON backup.

Starring a note does not count as an edit. It leaves the note's content and last-edited time unchanged, so you can star and unstar notes freely without changing their edit history.

## 0.3.0 - 2026-11-15

### New

#### Search your notes

The note list now has a search box at the top. Start typing and the list narrows to the notes whose title or body contains your text. Matching ignores capitalisation and finds the text anywhere in a word, so a few letters are usually enough. Blank notes appear as "Untitled" in the list, and searching `untitled` finds them.

To clear a search, press **Escape** or click **Clear search**. Focus goes back to the search box so you can type again straight away. Creating a new note also clears the search, so the new note is always visible in the list.

While you search, the list shows how many notes match, for example _3 notes match "recipe"_. If none match, it says _No notes match "recipe"_ instead of showing an empty list. Screen readers announce these messages too. The search box stays hidden until you have at least one note.

#### Your notes stay as they are

Search only changes which notes the list shows. It never changes or removes a note, and the editor, export and backup still include every note, even while a search is active.

## 0.2.1 - 2026-11-15

### Fixed

**Exported notes now get clean, portable file names.** Before this fix, a note titled something like `Plan  for  May...` exported as `Plan  for  May....md`. Repeated spaces and the dots stacked in front of `.md` caused some filesystems and sync tools to reject or rename the file. Runs of whitespace in a title now collapse to a single space, and any dots or spaces just before the extension are removed, so the same note exports as `Plan for May.md`.

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
