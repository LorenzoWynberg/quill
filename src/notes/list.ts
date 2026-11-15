import { deriveTitle } from './title';
import { matchesQuery } from './search';
import { sameTag } from './tags';
import { exportAllNotes } from './export';
import type { ImportResult, Note, NotesStore } from './store';

const TOAST_MS = 5000;
let mountSeq = 0;

const plural = (n: number): string => `${n} ${n === 1 ? 'note' : 'notes'}`;

/**
 * The ids an archive change would actually move: in `ids` order, without
 * duplicates, keeping only notes that exist and are not already in the target
 * state.
 */
export function changedArchiveIds(
  notes: readonly Note[],
  ids: readonly string[],
  archived: boolean,
): string[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const note = byId.get(id);
    if (note && (note.archivedAt !== undefined) !== archived) out.push(id);
  }
  return out;
}

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
  unreadable:
    'Restore failed: the file could not be read. Nothing was changed.',
  flush:
    'Restore cancelled: your open note could not be saved first. Nothing was changed.',
  unexpected:
    'Restore failed unexpectedly. Check your notes before trying again.',
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
  const live = document.createElement('div');
  live.className = 'notes-live sr-only';
  live.setAttribute('aria-live', 'polite');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.hidden = true;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    notice.textContent = '';
    try {
      let text: string;
      try {
        text = await file.text();
      } catch {
        notice.textContent = RESULT_MESSAGES.unreadable;
        return;
      }
      try {
        options.beforeRestore?.();
      } catch (error) {
        console.error('Restore aborted: pre-restore flush failed', error);
        notice.textContent = RESULT_MESSAGES.flush;
        return;
      }
      let result: ImportResult;
      try {
        result = store.importBackup(text);
      } catch (error) {
        console.error('Restore failed unexpectedly', error);
        notice.textContent = RESULT_MESSAGES.unexpected;
        return;
      }
      notice.textContent = result.ok
        ? `Restore complete: added ${result.added}, updated ${result.updated}, unchanged ${result.unchanged}.`
        : RESULT_MESSAGES[result.reason];
    } finally {
      input.value = '';
    }
  });
  const actionsHost = document.createElement('div');
  const listHost = document.createElement('div');
  const statusHost = document.createElement('div');
  statusHost.setAttribute('role', 'status');
  statusHost.className = 'notes-search-status';
  let query = '';
  let activeTag = '';
  let view: 'notes' | 'archived' = 'notes';
  let pendingFocus: string | undefined;
  const viewHost = document.createElement('div');
  viewHost.className = 'notes-view-row';
  const idPrefix = `notes-select-${++mountSeq}-`;

  // Select mode and its selection live only in this closure, never in storage.
  let selectMode = false;
  const selected = new Set<string>();
  let anchor: string | undefined;
  let visibleIds: string[] = [];
  function clearSelection(): void {
    selected.clear();
    anchor = undefined;
  }
  function exitSelect(): void {
    selectMode = false;
    clearSelection();
  }
  function rangeTo(id: string): void {
    const from = anchor === undefined ? -1 : visibleIds.indexOf(anchor);
    const to = visibleIds.indexOf(id);
    if (from === -1 || to === -1) {
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
    } else {
      const rows = visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1);
      for (const v of rows) selected.add(v);
    }
  }
  function acted(id: string): void {
    anchor = id;
    pendingFocus = `select:${id}`;
    render();
  }
  function announce(text: string): void {
    live.textContent = '';
    live.textContent = text;
  }
  const archivedTotal = (): number =>
    store.getState().notes.filter((n) => n.archivedAt !== undefined).length;

  // The bulk action bar is built once; render() only updates and shows it.
  const bar = document.createElement('div');
  bar.className = 'notes-bulk-bar';
  bar.hidden = true;
  const count = document.createElement('span');
  count.className = 'notes-bulk-count';
  count.setAttribute('aria-live', 'polite');
  const barButton = (key: string, label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'notes-bulk-button';
    b.dataset.focus = key;
    b.textContent = label;
    return b;
  };
  const selectAll = barButton('bulk-select-all', 'Select all');
  const bulkAction = barButton('bulk-action', 'Archive');
  const cancel = barButton('bulk-cancel', 'Cancel');
  bar.append(count, selectAll, bulkAction, cancel);
  selectAll.addEventListener('click', () => {
    for (const id of visibleIds) selected.add(id);
    render();
  });
  cancel.addEventListener('click', () => {
    exitSelect();
    pendingFocus = 'select-mode';
    render();
  });
  bulkAction.addEventListener('click', () => {
    const archiving = view === 'notes';
    const ids = visibleIds.filter((id) => selected.has(id));
    const changed = changedArchiveIds(store.getState().notes, ids, archiving);
    if (changed.length > 0) {
      const moved = new Set(changed);
      const first = visibleIds.find((id) => !moved.has(id));
      pendingFocus = first ? `select:${first}` : 'bulk-cancel';
    }
    clearSelection();
    store.setArchivedMany(ids, archiving);
    // A batch that changes nothing notifies nobody: keep no focus intent and
    // re-render ourselves so the cleared selection shows.
    pendingFocus = undefined;
    if (changed.length === 0) {
      render();
      return;
    }
    announce(
      `${archiving ? 'Archived' : 'Restored'} ${plural(changed.length)}. Archived (${archivedTotal()}).`,
    );
    showToast(changed, archiving);
  });

  // The toast is visual only (not a live region): every batch is announced
  // once, through `live`. It is built once and survives every render.
  const toast = document.createElement('div');
  toast.className = 'notes-toast';
  toast.hidden = true;
  const toastText = document.createElement('span');
  toastText.className = 'notes-toast-text';
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'notes-toast-undo';
  undo.dataset.focus = 'toast-undo';
  undo.textContent = 'Undo';
  let toastIds: string[] = [];
  let toastArchived = true;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  // The timer also pauses under the pointer, so Undo can't vanish mid-reach.
  let hovered = false;
  function stopTimer(): void {
    if (toastTimer !== undefined) clearTimeout(toastTimer);
    toastTimer = undefined;
  }
  function startTimer(): void {
    stopTimer();
    toastTimer = setTimeout(hideToast, TOAST_MS);
  }
  function hideToast(): void {
    stopTimer();
    hovered = false;
    toast.hidden = true;
  }
  function showToast(ids: string[], archived: boolean): void {
    toastIds = ids;
    toastArchived = archived;
    toastText.textContent = `${plural(ids.length)} ${archived ? 'archived' : 'restored'}`;
    if (toast.firstChild !== toastText) toast.replaceChildren(toastText, undo);
    toast.hidden = false;
    if (hovered) stopTimer();
    else startTimer();
  }
  toast.addEventListener('focusin', stopTimer);
  toast.addEventListener('focusout', (e) => {
    const next = e.relatedTarget;
    if (toast.hidden || hovered) return;
    if (next instanceof Node && toast.contains(next)) return;
    startTimer();
  });
  toast.addEventListener('mouseenter', () => {
    hovered = true;
    stopTimer();
  });
  toast.addEventListener('mouseleave', () => {
    hovered = false;
    if (toast.hidden || toast.contains(document.activeElement)) return;
    startTimer();
  });
  undo.addEventListener('click', () => {
    const archived = !toastArchived;
    const eff = changedArchiveIds(store.getState().notes, toastIds, archived);
    if (eff.length > 0) pendingFocus = `view:${view}`;
    store.setArchivedMany(toastIds, archived);
    pendingFocus = undefined;
    const hadFocus = toast.contains(document.activeElement);
    hideToast();
    if (eff.length > 0) {
      announce(
        `Undid ${toastArchived ? 'archive' : 'restore'} of ${plural(eff.length)}. Archived (${archivedTotal()}).`,
      );
    } else if (hadFocus) {
      // Nothing changed, so nothing re-rendered: don't leave focus inside the
      // now-hidden toast.
      viewHost
        .querySelector<HTMLElement>(`[data-focus="view:${view}"]`)
        ?.focus();
    }
  });

  const onRootKeydown = (e: KeyboardEvent): void => {
    // The search box and tag filter clear themselves on Esc first and call
    // preventDefault; they keep priority.
    if (!selectMode || e.key !== 'Escape' || e.defaultPrevented) return;
    exitSelect();
    pendingFocus = 'select-mode';
    render();
  };
  root.addEventListener('keydown', onRootKeydown);

  const searchRegion = document.createElement('div');
  searchRegion.className = 'notes-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'notes-search-input';
  searchInput.setAttribute('aria-label', 'Search notes');
  searchInput.placeholder = 'Search notes';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'notes-search-clear';
  clearBtn.textContent = 'Clear search';
  clearBtn.hidden = true;
  const filterRow = document.createElement('div');
  filterRow.className = 'notes-tag-filter';
  const tagId = 'notes-tag-select';
  const tagLabel = document.createElement('label');
  tagLabel.htmlFor = tagId;
  tagLabel.className = 'notes-tag-label';
  tagLabel.textContent = 'Filter by tag';
  const tagSelect = document.createElement('select');
  tagSelect.id = tagId;
  tagSelect.className = 'notes-tag-select';
  tagSelect.dataset.focus = 'tag-filter';
  const tagClear = document.createElement('button');
  tagClear.type = 'button';
  tagClear.className = 'notes-tag-clear';
  tagClear.textContent = 'Clear tag filter';
  tagClear.hidden = true;
  filterRow.append(tagLabel, tagSelect, tagClear);
  searchRegion.append(searchInput, clearBtn, filterRow);
  tagSelect.addEventListener('change', () => {
    activeTag = tagSelect.value;
    render();
  });
  tagSelect.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || activeTag === '') return;
    e.preventDefault();
    clearTag();
    render();
  });
  tagClear.addEventListener('click', () => {
    clearTag();
    render();
    tagSelect.focus();
  });
  function clearTag(): void {
    activeTag = '';
    tagSelect.value = '';
  }
  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    render();
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || query === '') return;
    e.preventDefault();
    clearQuery();
    render();
  });
  clearBtn.addEventListener('click', () => {
    clearQuery();
    render();
    searchInput.focus();
  });
  function clearQuery(): void {
    query = '';
    searchInput.value = '';
  }
  root.replaceChildren(
    alert,
    notice,
    live,
    input,
    actionsHost,
    viewHost,
    searchRegion,
    statusHost,
    bar,
    toast,
    listHost,
  );

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
    const activeKey =
      active instanceof HTMLElement && root.contains(active)
        ? active.dataset.focus
        : undefined;
    const focusKey = pendingFocus ?? activeKey;
    pendingFocus = undefined;
    const { notes, selectedId, writeError } = store.getState();

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
      action('new', 'New note', 'notes-new', () => {
        clearQuery();
        clearTag();
        exitSelect();
        view = 'notes';
        store.create();
      }),
      exportAll,
      action('backup', 'Backup', 'notes-secondary', backup),
      action('restore', 'Restore', 'notes-secondary', () => input.click()),
    );
    actionsHost.replaceChildren(actions);

    const message = writeError ? MESSAGES[writeError] : '';
    if (alert.textContent !== message) alert.textContent = message;
    alert.hidden = message === '';

    const archivedCount = notes.filter(
      (n) => n.archivedAt !== undefined,
    ).length;
    const viewNotes =
      view === 'notes'
        ? notes.filter((n) => n.archivedAt === undefined)
        : notes
            .filter((n) => n.archivedAt !== undefined)
            .sort(
              (a, b) =>
                (b.archivedAt ?? 0) - (a.archivedAt ?? 0) ||
                b.updatedAt - a.updatedAt,
            );
    const group = document.createElement('div');
    group.className = 'notes-views';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Note views');
    const toggle = (key: 'notes' | 'archived', label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'notes-view';
      b.dataset.focus = `view:${key}`;
      b.textContent = label;
      b.setAttribute('aria-pressed', String(view === key));
      b.addEventListener('click', () => {
        view = key;
        clearSelection();
        render();
      });
      return b;
    };
    group.append(
      toggle('notes', 'Notes'),
      toggle('archived', `Archived (${archivedCount})`),
    );
    const selectToggle = document.createElement('button');
    selectToggle.type = 'button';
    selectToggle.className = 'notes-select-toggle';
    selectToggle.dataset.focus = 'select-mode';
    selectToggle.textContent = 'Select';
    selectToggle.setAttribute('aria-pressed', String(selectMode));
    // While on, it stays usable as the way out even if the view empties.
    selectToggle.disabled = viewNotes.length === 0 && !selectMode;
    selectToggle.addEventListener('click', () => {
      if (selectMode) {
        exitSelect();
        pendingFocus = 'select-mode';
      } else selectMode = true;
      render();
    });
    viewHost.replaceChildren(group, selectToggle);

    if (notes.length === 0 && query !== '') clearQuery();
    searchRegion.hidden = viewNotes.length === 0;
    clearBtn.hidden = query === '';
    const tags: string[] = [];
    for (const n of viewNotes)
      for (const t of n.tags)
        if (!tags.some((x) => sameTag(x, t))) tags.push(t);
    tags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    if (activeTag !== '')
      activeTag = tags.find((t) => sameTag(t, activeTag)) ?? '';
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'All tags';
    tagSelect.replaceChildren(
      allOpt,
      ...tags.map((t) => {
        const o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        return o;
      }),
    );
    tagSelect.value = activeTag;
    filterRow.hidden = tags.length === 0;
    tagClear.hidden = activeTag === '';
    const visible = viewNotes.filter(
      (n) =>
        matchesQuery(n.body, query) &&
        (activeTag === '' || n.tags.some((t) => sameTag(t, activeTag))),
    );
    // The selection is always a subset of the rows on screen.
    visibleIds = visible.map((n) => n.id);
    const shown = new Set(visibleIds);
    for (const id of selected) if (!shown.has(id)) selected.delete(id);
    if (anchor !== undefined && !shown.has(anchor)) anchor = undefined;
    bar.hidden = !selectMode;
    const counted = `${selected.size} selected`;
    if (count.textContent !== counted) count.textContent = counted;
    bulkAction.textContent = view === 'notes' ? 'Archive' : 'Restore';
    bulkAction.disabled = selected.size === 0;
    const frag = document.createDocumentFragment();

    if (viewNotes.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'notes-empty';
      empty.textContent =
        view === 'archived'
          ? 'No archived notes.'
          : 'No notes yet. Create one to get started.';
      frag.append(empty);
    } else if (visible.length === 0) {
      const none = document.createElement('p');
      none.className = 'notes-no-match';
      const q = query.trim();
      none.textContent =
        activeTag === ''
          ? `No notes match "${q}"`
          : q === ''
            ? `No notes tagged "${activeTag}"`
            : `No notes tagged "${activeTag}" match "${q}"`;
      statusHost.replaceChildren(none);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'notes-list';
      for (const note of visible) {
        const title = deriveTitle(note.body);
        const li = document.createElement('li');
        if (selectMode) {
          li.append(...selectRow(note.id, title));
          if (note.id === selectedId) li.setAttribute('aria-current', 'true');
          ul.append(li);
          continue;
        }
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'notes-item';
        open.dataset.focus = `open:${note.id}`;
        open.textContent = title;
        if (note.id === selectedId) open.setAttribute('aria-current', 'true');
        open.addEventListener('click', () => store.select(note.id));
        const kind = view === 'notes' ? 'archive' : 'restore';
        const move = document.createElement('button');
        move.type = 'button';
        move.className = view === 'notes' ? 'notes-archive' : 'notes-restore';
        move.dataset.focus = `${kind}:${note.id}`;
        move.textContent = view === 'notes' ? 'Archive' : 'Restore';
        move.setAttribute(
          'aria-label',
          `${view === 'notes' ? 'Archive' : 'Restore'} "${title}"`,
        );
        move.addEventListener('click', () => {
          const i = visible.findIndex((v) => v.id === note.id);
          const neighbour = visible[i + 1] ?? visible[i - 1];
          pendingFocus = neighbour ? `${kind}:${neighbour.id}` : `view:${view}`;
          const archiving = view === 'notes';
          const before = store
            .getState()
            .notes.find((n) => n.id === note.id)?.archivedAt;
          store.setArchived(note.id, archiving);
          // A no-op change notifies nobody; drop focus intent so it can't leak.
          pendingFocus = undefined;
          const changed = store.getState().notes.find((n) => n.id === note.id);
          if (
            changed &&
            (before !== undefined) !== (changed.archivedAt !== undefined)
          ) {
            const count = store
              .getState()
              .notes.filter((n) => n.archivedAt !== undefined).length;
            live.textContent = '';
            live.textContent = `${archiving ? 'Archived' : 'Restored'} "${title}". Archived (${count}).`;
          }
        });
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
        const starred = note.starred === true;
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'notes-star';
        star.dataset.focus = `star:${note.id}`;
        star.setAttribute('aria-pressed', String(starred));
        star.setAttribute('aria-label', `Star "${title}"`);
        const glyph = document.createElement('span');
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = starred ? '★' : '☆';
        star.append(glyph);
        star.addEventListener('click', () =>
          store.setStarred(note.id, !starred),
        );
        li.append(star, open, move, del);
        ul.append(li);
      }
      frag.append(ul);
    }

    if (visible.length > 0 && query.trim() !== '') {
      const n = visible.length;
      const msg = `${n} ${n === 1 ? 'note matches' : 'notes match'} "${query.trim()}"`;
      // Skip an identical rewrite so screen readers don't re-announce it.
      if (statusHost.textContent !== msg) statusHost.textContent = msg;
    } else if (visible.length > 0 || viewNotes.length === 0) {
      statusHost.replaceChildren();
    }
    listHost.replaceChildren(frag);
    if (focusKey) {
      const all = [
        ...actionsHost.querySelectorAll<HTMLElement>('[data-focus]'),
        ...viewHost.querySelectorAll<HTMLElement>('[data-focus]'),
        ...filterRow.querySelectorAll<HTMLElement>('[data-focus]'),
        ...bar.querySelectorAll<HTMLElement>('[data-focus]'),
        ...toast.querySelectorAll<HTMLElement>('[data-focus]'),
        ...listHost.querySelectorAll<HTMLElement>('[data-focus]'),
      ];
      // A control that is now disabled can't hold focus, so it counts as gone.
      (
        all.find(
          (el) =>
            el.dataset.focus === focusKey &&
            !(el instanceof HTMLButtonElement && el.disabled),
        ) ?? actionsHost.querySelector<HTMLElement>('[data-focus="new"]')
      )?.focus();
    }
  }

  function selectRow(id: string, title: string): HTMLElement[] {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'notes-select';
    box.id = `${idPrefix}${id}`;
    box.dataset.focus = `select:${id}`;
    box.checked = selected.has(id);
    const label = document.createElement('label');
    label.className = 'notes-select-label';
    label.htmlFor = box.id;
    label.textContent = title;
    // Mouse, label click and native Space all arrive here as a click, after
    // the browser has flipped `checked`.
    box.addEventListener('click', (e) => {
      if (e.shiftKey && anchor !== undefined) rangeTo(id);
      else if (box.checked) selected.add(id);
      else selected.delete(id);
      acted(id);
    });
    // Shift+Space: take the range ourselves and stop the native toggle, which
    // would otherwise flip the focused row back.
    box.addEventListener('keydown', (e) => {
      if (e.key !== ' ' || !e.shiftKey) return;
      e.preventDefault();
      if (e.repeat) return;
      rangeTo(id);
      acted(id);
    });
    label.addEventListener('mousedown', (e) => {
      if (e.shiftKey) e.preventDefault(); // no text selection on shift-click
    });
    label.addEventListener('click', (e) => {
      if (!e.shiftKey) return;
      // Handle the range here rather than relying on the browser to forward
      // the modifier to the checkbox's synthetic click.
      e.preventDefault();
      rangeTo(id);
      acted(id);
    });
    return [box, label];
  }

  render();
  const unsubscribe = store.subscribe(render);
  return () => {
    stopTimer();
    root.removeEventListener('keydown', onRootKeydown);
    unsubscribe();
  };
}
