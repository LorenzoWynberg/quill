import { deriveTitle } from './title';
import { exportAllNotes } from './export';
import type { NotesStore } from './store';

const MESSAGES = {
  quota: 'Storage is full. Recent changes are not being saved.',
  unavailable: 'Storage is unavailable. Notes are not being saved.',
} as const;

export interface NoteListOptions {
  beforeExport?: () => void;
  beforeRestore?: () => void;
}

const RESULT_MESSAGES = {
  invalid:
    'Restore failed: this is not a valid Quill backup. Nothing was changed.',
  write: 'Restore failed: notes could not be saved. Nothing was changed.',
} as const;

function backupName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `quill-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

export function mountNoteList(
  root: HTMLElement,
  store: NotesStore,
  options: NoteListOptions = {},
): () => void {
  const alert = document.createElement('div');
  alert.setAttribute('role', 'alert');
  alert.className = 'notes-alert';
  alert.hidden = true;
  const notice = document.createElement('div');
  notice.setAttribute('role', 'status');
  notice.className = 'notes-notice';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.hidden = true;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      options.beforeRestore?.();
      const result = store.importBackup(text);
      notice.textContent = result.ok
        ? `Restore complete: added ${result.added}, updated ${result.updated}, unchanged ${result.unchanged}.`
        : RESULT_MESSAGES[result.reason];
    } finally {
      input.value = '';
    }
  });
  const content = document.createElement('div');
  root.replaceChildren(alert, notice, input, content);

  function backup(): void {
    const blob = new Blob([store.exportBackup()], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupName();
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function render(): void {
    const active = document.activeElement;
    const focusKey =
      active instanceof HTMLElement && root.contains(active)
        ? active.dataset.focus
        : undefined;
    const { notes, selectedId, writeError } = store.getState();

    const frag = document.createDocumentFragment();

    const actions = document.createElement('div');
    actions.className = 'notes-actions';
    const action = (
      key: string,
      label: string,
      cls: string,
      onClick: () => void,
    ): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.dataset.focus = key;
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    };
    const exportAll = action('export', 'Export all', 'notes-export', () => {
      options?.beforeExport?.();
      exportAllNotes(store.getState().notes);
    });
    exportAll.setAttribute('aria-label', 'Export all notes as .zip');
    exportAll.disabled = notes.length === 0;
    actions.append(
      action('new', 'New note', 'notes-new', () => store.create()),
      exportAll,
      action('backup', 'Backup', 'notes-secondary', backup),
      action('restore', 'Restore', 'notes-secondary', () => input.click()),
    );
    frag.append(actions);

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
