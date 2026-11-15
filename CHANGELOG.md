# Changelog

## 0.1.0 - 2026-11-15

### New: Export your notes as Markdown

Your notes no longer have to stay inside this browser. Quill can now save your writing as plain Markdown files that open in any editor, sync to any folder, and outlast any one browser profile.

#### Export the note you're editing

The editor now has an **Export** button that downloads the open note as a `.md` file named after its title. Any edits you haven't saved yet go into the file, so what you download matches what's on screen. Characters that filenames can't contain are removed, very long titles are cut to 80 characters, and a note with no usable title downloads as `Untitled.md`. The button is greyed out when no note is open.

#### Export all notes at once

The note list now has an **Export all** button that downloads every note as one zip file named `quill-notes-YYYY-MM-DD.zip`. Each note in the zip is its own `.md` file. When two notes have the same title, Quill numbers the extra copies, for example `Ideas (2).md`, so no note overwrites another. Your latest unsaved edits are included here too. The button is greyed out when you have no notes.

#### Good to know

Exporting copies your notes and leaves the originals where they are. Everything stays in Quill as before, and nothing is uploaded anywhere. The download is created in your browser and saved straight to your computer.
