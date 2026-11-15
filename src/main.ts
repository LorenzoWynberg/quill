import './shared/theme.css';
import './shared/shell.css';
import './preview/preview.css';
import './notes/list.css';
import './editor/editor.css';
import { createNotesStore, mountNoteList } from './notes';
import { mountEditor } from './editor';
import type { EditorHandle } from './editor';
import { renderMarkdown } from './preview';
import { mountThemeControl } from './shared/theme';

const app = document.getElementById('app');

if (app) {
  app.innerHTML = `
    <a class="skip-link" href="#editor">Skip to editor</a>
    <header class="app-header">
      <span class="app-name">Quill</span>
      <div data-theme-control></div>
    </header>
    <nav aria-label="Notes"></nav>
    <main data-pane="edit">
      <section aria-label="Editor" id="editor" tabindex="-1"></section>
      <section aria-label="Preview"></section>
    </main>
  `;
  const themeSlot = app.querySelector<HTMLElement>('[data-theme-control]');
  if (themeSlot) mountThemeControl(themeSlot);
  const nav = app.querySelector<HTMLElement>('nav[aria-label="Notes"]');
  const store = createNotesStore();
  let editor: EditorHandle | undefined;
  const editorEl = app.querySelector<HTMLElement>('section#editor');
  const previewEl = app.querySelector<HTMLElement>(
    'section[aria-label="Preview"]',
  );
  if (editorEl && previewEl) {
    editor = mountEditor(editorEl, {
      store,
      render: renderMarkdown,
      previewEl,
    });
  }
  if (nav) {
    mountNoteList(nav, store, {
      beforeExport: () => editor?.flush(),
      beforeRestore: () => editor?.flush(),
    });
  }
}
