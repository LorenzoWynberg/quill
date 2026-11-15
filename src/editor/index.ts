import { exportNote, normaliseTag, sameTag } from '../notes';
import type { NotesStore } from '../notes';

export interface EditorDeps {
  store: NotesStore;
  render: (body: string) => string;
  previewEl: HTMLElement;
}

export interface EditorHandle {
  flush(): void;
}

const DEBOUNCE_MS = 300;

export function mountEditor(root: HTMLElement, deps: EditorDeps): EditorHandle {
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

  const header = document.createElement('div');
  header.className = 'editor-header';
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'editor-export';
  exportBtn.textContent = 'Export';
  exportBtn.setAttribute('aria-label', 'Export note as Markdown');
  exportBtn.disabled = true;
  header.append(exportBtn);

  const tagField = document.createElement('div');
  tagField.className = 'tag-field';
  tagField.setAttribute('role', 'group');
  tagField.setAttribute('aria-labelledby', 'tag-field-label');
  const tagLabel = document.createElement('span');
  tagLabel.id = 'tag-field-label';
  tagLabel.className = 'tag-field-label';
  tagLabel.textContent = 'Tags';
  const chips = document.createElement('ul');
  chips.className = 'tag-chips';
  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.id = 'tag-input';
  tagInput.setAttribute('aria-label', 'Add tag');
  tagInput.setAttribute('aria-describedby', 'tag-msg');
  const msg = document.createElement('div');
  msg.id = 'tag-msg';
  msg.className = 'tag-msg';
  msg.setAttribute('aria-live', 'polite');
  tagField.append(tagLabel, chips, tagInput, msg);

  root.replaceChildren(header, empty, label, textarea, tagField);

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
    exportBtn.disabled = !has;
    tagField.hidden = !has;
    renderChips();
    previewEl.innerHTML = has ? render(textarea.value) : '';
  }

  function tagsOf(id: string | null): readonly string[] {
    if (id === null) return [];
    return store.getState().notes.find((n) => n.id === id)?.tags ?? [];
  }

  function renderChips(): void {
    const items = tagsOf(currentId).map((tag) => {
      const li = document.createElement('li');
      li.className = 'tag-chip';
      const text = document.createElement('span');
      text.textContent = tag;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-remove';
      btn.textContent = 'Remove';
      btn.setAttribute('aria-label', `Remove tag "${tag}"`);
      btn.addEventListener('click', () => removeTag(tag));
      li.append(text, btn);
      return li;
    });
    chips.replaceChildren(...items);
  }

  function removeTag(tag: string): void {
    if (currentId === null) return;
    const tags = tagsOf(currentId);
    const idx = tags.indexOf(tag);
    store.setTags(
      currentId,
      tags.filter((t) => t !== tag),
    );
    const btns = chips.querySelectorAll<HTMLButtonElement>('.tag-remove');
    (btns[idx] ?? tagInput).focus();
  }

  // Splits on commas; entries are validated by the notes domain. With
  // final=false the text after the last comma stays in the input.
  function commitTags(raw: string, final: boolean): void {
    if (currentId === null) return;
    const parts = raw.split(',');
    const remainder = final ? '' : (parts.pop() ?? '');
    const valid: string[] = [];
    let tooLong = false;
    for (const part of parts) {
      const tag = normaliseTag(part);
      if (tag !== null) valid.push(tag);
      else if (/\S/.test(part)) tooLong = true;
    }
    if (tooLong) {
      msg.textContent = 'Tags can be up to 32 characters.';
      return;
    }
    const current = tagsOf(currentId);
    const fresh: string[] = [];
    let duplicate = false;
    for (const tag of valid) {
      if ([...current, ...fresh].some((t) => sameTag(t, tag))) duplicate = true;
      else fresh.push(tag);
    }
    if (fresh.length > 0) store.setTags(currentId, [...current, ...fresh]);
    tagInput.value = remainder;
    msg.textContent = duplicate ? 'Already tagged.' : '';
  }

  tagInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      commitTags(tagInput.value, true);
      return;
    }
    msg.textContent = '';
    if (ev.key === 'Backspace' && tagInput.value === '' && currentId !== null) {
      const tags = tagsOf(currentId);
      if (tags.length > 0) store.setTags(currentId, tags.slice(0, -1));
    }
  });
  tagInput.addEventListener('input', () => {
    msg.textContent = '';
    if (tagInput.value.includes(',')) commitTags(tagInput.value, false);
  });
  tagInput.addEventListener('blur', () => {
    if (/\S/.test(tagInput.value)) commitTags(tagInput.value, true);
  });

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

  exportBtn.addEventListener('click', () => {
    if (currentId === null) return;
    flush();
    const note = store.getState().notes.find((n) => n.id === currentId);
    if (note) exportNote(note);
  });

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
      tagInput.value = '';
      msg.textContent = '';
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
    renderChips();
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
  return { flush };
}
