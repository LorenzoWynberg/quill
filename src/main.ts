import './shared/theme.css';
import './shared/shell.css';
import './preview/preview.css';
import './notes/list.css';
import { createNotesStore, mountNoteList } from './notes';

const app = document.getElementById('app');

if (app) {
  app.innerHTML = `
    <a class="skip-link" href="#editor">Skip to editor</a>
    <nav aria-label="Notes"></nav>
    <main data-pane="edit">
      <section aria-label="Editor" id="editor" tabindex="-1"></section>
      <section aria-label="Preview"></section>
    </main>
  `;
  const nav = app.querySelector<HTMLElement>('nav[aria-label="Notes"]');
  if (nav) mountNoteList(nav, createNotesStore());
}
