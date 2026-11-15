import './shared/theme.css';
import './shared/shell.css';

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
}
