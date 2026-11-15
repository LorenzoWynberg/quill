import type { NotesStore } from '../notes';

export interface EditorDeps {
  store: NotesStore;
  render: (body: string) => string;
  previewEl: HTMLElement;
}

const DEBOUNCE_MS = 300;

export function mountEditor(root: HTMLElement, deps: EditorDeps): void {
  const { store, render, previewEl } = deps;

  const empty = document.createElement('p');
  empty.className = 'editor-empty';
  empty.textContent = 'Create a note to start writing.';

  const label = document.createElement('label');
  label.htmlFor = 'editor-input';
  label.className = 'sr-only';
  label.textContent = 'Note';

  const textarea = document.createElement('textarea');
  textarea.id = 'editor-input';
  textarea.className = 'editor-textarea';

  root.replaceChildren(empty, label, textarea);

  const main = root.parentElement;
  let showEditPane = (): void => {};
  if (main) {
    const toggle = document.createElement('div');
    toggle.className = 'pane-toggle';
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', 'View');
    const buttons = (['edit', 'preview'] as const).map((pane) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = pane === 'edit' ? 'Edit' : 'Preview';
      b.addEventListener('click', () => {
        main.dataset.pane = pane;
        sync();
      });
      return { pane, b };
    });
    const sync = (): void => {
      for (const { pane, b } of buttons) {
        b.setAttribute(
          'aria-pressed',
          String((main.dataset.pane ?? 'edit') === pane),
        );
      }
    };
    showEditPane = () => {
      main.dataset.pane = 'edit';
      sync();
    };
    toggle.append(...buttons.map((x) => x.b));
    main.prepend(toggle);
    sync();
  }

  let currentId: string | null = null;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function bodyOf(id: string | null): string {
    if (id === null) return '';
    return store.getState().notes.find((n) => n.id === id)?.body ?? '';
  }

  function show(): void {
    const has = currentId !== null;
    empty.hidden = has;
    textarea.hidden = !has;
    label.hidden = !has;
    previewEl.innerHTML = has ? render(textarea.value) : '';
  }

  function clearPending(): void {
    clearTimeout(timer);
    timer = undefined;
    if (pending) {
      pending = false;
      store.setPendingLocalEdits(false);
    }
  }

  function flush(): void {
    if (!pending || currentId === null) return;
    const id = currentId;
    clearTimeout(timer);
    timer = undefined;
    store.update(id, textarea.value);
    if (store.getState().writeError === null) clearPending();
  }

  textarea.addEventListener('input', () => {
    previewEl.innerHTML = render(textarea.value);
    if (!pending) {
      pending = true;
      store.setPendingLocalEdits(true);
    }
    clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  });

  store.subscribe((state, source) => {
    if (state.selectedId !== currentId) {
      const oldId = currentId;
      currentId = state.selectedId;
      if (pending && oldId !== null) store.update(oldId, textarea.value);
      clearPending();
      textarea.value = bodyOf(currentId);
      show();
    } else if (source === 'external' && !pending && currentId !== null) {
      const body = bodyOf(currentId);
      if (body !== textarea.value) {
        const { selectionStart: s, selectionEnd: e } = textarea;
        textarea.value = body;
        textarea.setSelectionRange(
          Math.min(s, body.length),
          Math.min(e, body.length),
        );
        show();
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('beforeunload', flush);

  document
    .querySelector<HTMLAnchorElement>('a.skip-link')
    ?.addEventListener('click', (ev) => {
      ev.preventDefault();
      showEditPane();
      if (textarea.hidden) root.focus();
      else textarea.focus();
    });

  currentId = store.getState().selectedId;
  textarea.value = bodyOf(currentId);
  show();
}
