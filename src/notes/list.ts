import { deriveTitle } from './title';
import { exportAllNotes } from './export';
import type { NotesStore } from './store';

const MESSAGES = {
  quota: 'Storage is full. Recent changes are not being saved.',
  unavailable: 'Storage is unavailable. Notes are not being saved.',
} as const;

export interface NoteListOptions {
  beforeExport?: () => void;
}

export function mountNoteList(
  root: HTMLElement,
  store: NotesStore,
  options?: NoteListOptions,
): () => void {
  const alert = document.createElement('div');
  alert.setAttribute('role', 'alert');
  alert.className = 'notes-alert';
  alert.hidden = true;
  const content = document.createElement('div');
  root.replaceChildren(alert, content);

  function render(): void {
    const active = document.activeElement;
    const focusKey =
      active instanceof HTMLElement && root.contains(active)
        ? active.dataset.focus
        : undefined;
    const { notes, selectedId, writeError } = store.getState();

    const frag = document.createDocumentFragment();

    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'notes-new';
    create.dataset.focus = 'new';
    create.textContent = 'New note';
    create.addEventListener('click', () => store.create());
    const exportAll = document.createElement('button');
    exportAll.type = 'button';
    exportAll.className = 'notes-export';
    exportAll.dataset.focus = 'export';
    exportAll.textContent = 'Export all';
    exportAll.setAttribute('aria-label', 'Export all notes as .zip');
    exportAll.disabled = notes.length === 0;
    exportAll.addEventListener('click', () => {
      options?.beforeExport?.();
      exportAllNotes(store.getState().notes);
    });
    const header = document.createElement('div');
    header.className = 'notes-header';
    header.append(create, exportAll);
    frag.append(header);

    const message = writeError ? MESSAGES[writeError] : '';
    if (alert.textContent !== message) alert.textContent = message;
    alert.hidden = message === '';

    if (notes.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'notes-empty';
      empty.textContent = 'No notes yet. Create one to get started.';
      frag.append(empty);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'notes-list';
      for (const note of notes) {
        const title = deriveTitle(note.body);
        const li = document.createElement('li');
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'notes-item';
        open.dataset.focus = `open:${note.id}`;
        open.textContent = title;
        if (note.id === selectedId) open.setAttribute('aria-current', 'true');
        open.addEventListener('click', () => store.select(note.id));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'notes-delete';
        del.dataset.focus = `delete:${note.id}`;
        del.textContent = 'Delete';
        del.setAttribute('aria-label', `Delete "${title}"`);
        del.addEventListener('click', () => {
          if (window.confirm(`Delete "${title}"? This cannot be undone.`))
            store.remove(note.id);
        });
        li.append(open, del);
        ul.append(li);
      }
      frag.append(ul);
    }

    content.replaceChildren(frag);
    if (focusKey) {
      const target = Array.from(
        content.querySelectorAll<HTMLElement>('[data-focus]'),
      ).find((el) => el.dataset.focus === focusKey);
      (
        target ?? content.querySelector<HTMLElement>('[data-focus="new"]')
      )?.focus();
    }
  }

  render();
  return store.subscribe(render);
}
