import { deriveTitle } from './title';
import type { NotesStore } from './store';

const MESSAGES = {
  quota: 'Storage is full. Recent changes are not being saved.',
  unavailable: 'Storage is unavailable. Notes are not being saved.',
} as const;

export function mountNoteList(
  root: HTMLElement,
  store: NotesStore,
): () => void {
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
    frag.append(create);

    if (writeError) {
      const alert = document.createElement('div');
      alert.setAttribute('role', 'alert');
      alert.className = 'notes-alert';
      alert.textContent = MESSAGES[writeError];
      frag.append(alert);
    }

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

    root.replaceChildren(frag);
    if (focusKey) {
      const target = Array.from(
        root.querySelectorAll<HTMLElement>('[data-focus]'),
      ).find((el) => el.dataset.focus === focusKey);
      (
        target ?? root.querySelector<HTMLElement>('[data-focus="new"]')
      )?.focus();
    }
  }

  render();
  return store.subscribe(render);
}
