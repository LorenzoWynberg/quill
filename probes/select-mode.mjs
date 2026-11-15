/* global process, console, setTimeout, Buffer */
// Journey probe: select a range of notes, archive them in one batch, undo it,
// and use the keyboard (Space, Shift+Space, Tab, Esc) in select mode — on a
// real Chromium with trusted input, against a running Quill.
//
// Usage: node probes/select-mode.mjs <app url> <screenshot dir>
// Needs CHROME (or TRINITY_CHROMIUM_PATH) pointing at a Chromium binary.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, outDir = join(tmpdir(), 'quill-probe')] = process.argv.slice(2);
const chrome = process.env.CHROME ?? process.env.TRINITY_CHROMIUM_PATH;
if (!url || !chrome) {
  console.error('usage: CHROME=... node probes/select-mode.mjs <url> [outDir]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const proc = spawn(
  chrome,
  [
    '--headless',
    '--remote-debugging-pipe',
    // Chromium's own sandbox can't start inside an already-sandboxed runner;
    // the probe only ever loads the local app.
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'quill-chrome-'))}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
);
const toChrome = proc.stdio[3];
const fromChrome = proc.stdio[4];
let nextId = 1;
const waiting = new Map();
const listeners = [];
let buf = Buffer.alloc(0);
fromChrome.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  let end;
  while ((end = buf.indexOf(0)) !== -1) {
    const msg = JSON.parse(buf.subarray(0, end).toString());
    buf = buf.subarray(end + 1);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === 'Inspector.targetCrashed') {
      console.error('FAIL page crashed');
      proc.kill();
      process.exit(1);
    } else for (const l of listeners) l(msg);
  }
});
function send(method, params = {}, sessionId) {
  const id = nextId++;
  toChrome.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(actual)}` +
      (ok ? '' : ` (expected ${JSON.stringify(expected)})`),
  );
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', {
  targetId,
  flatten: true,
});
const page = (method, params) => send(method, params, sessionId);
await page('Page.enable');
await page('Runtime.enable');
function loaded() {
  return new Promise((resolve) => {
    const l = (m) => {
      if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) {
        listeners.splice(listeners.indexOf(l), 1);
        resolve();
      }
    };
    listeners.push(l);
  });
}
async function js(expression) {
  const r = await page('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

// Page helpers, installed after every load.
const HELPERS = `
  window.__q = {
    label: (t) => [...document.querySelectorAll('li label')].find((l) => l.textContent === t),
    box: (t) => document.getElementById(window.__q.label(t).htmlFor),
    rows: () => [...document.querySelectorAll('li .notes-select, li .notes-item')]
      .map((el) => el.matches('.notes-item') ? el.textContent
        : document.querySelector('label[for="' + el.id + '"]').textContent),
    ticked: () => [...document.querySelectorAll('li .notes-select')].filter((b) => b.checked)
      .map((b) => document.querySelector('label[for="' + b.id + '"]').textContent),
    focus: () => document.activeElement?.dataset?.focus ?? document.activeElement?.tagName,
    center: (el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; },
  };`;

async function click(expr, modifiers = 0) {
  const [x, y] = await js(`window.__q.center(${expr})`);
  await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  for (const type of ['mousePressed', 'mouseReleased'])
    await page('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      clickCount: 1,
      modifiers,
    });
}
const KEYS = {
  Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
};
async function press(name, modifiers = 0) {
  const k = KEYS[name];
  await page('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, ...k });
  const { text: _t, ...up } = k;
  void _t;
  await page('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...up });
}
async function shot(name) {
  const { data } = await page('Page.captureScreenshot', { format: 'png' });
  const file = join(outDir, name);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`screenshot ${file}`);
}

try {
  const titles = ['One', 'Two', 'Three', 'Four', 'Five'];
  const notes = titles.map((t, i) => ({
    id: `n${i + 1}`,
    body: `# ${t}`,
    createdAt: 1,
    updatedAt: 100 - i,
    tags: [],
  }));
  let load = loaded();
  await page('Page.navigate', { url });
  await load;
  await js(
    `localStorage.clear(); localStorage.setItem('quill:v1', ${JSON.stringify(JSON.stringify(notes))})`,
  );
  load = loaded();
  await page('Page.reload');
  await load;
  await js(HELPERS);
  check('rows on load', await js('window.__q.rows()'), titles);

  // Start: enter select mode with the mouse.
  await click(`document.querySelector('.notes-select-toggle')`);
  check(
    'Select pressed',
    await js(
      `document.querySelector('.notes-select-toggle').getAttribute('aria-pressed')`,
    ),
    'true',
  );

  // Tick row 2, then shift-click the title of row 4.
  await click(`window.__q.box('Two')`);
  await click(`window.__q.label('Four')`, 8);
  check('shift-click range', await js('window.__q.ticked()'), [
    'Two',
    'Three',
    'Four',
  ]);
  check(
    'count',
    await js(`document.querySelector('.notes-bulk-count').textContent`),
    '3 selected',
  );
  check(
    'no text selected by shift-click',
    await js('String(getSelection())'),
    '',
  );
  check('focus after shift-click', await js('window.__q.focus()'), 'select:n4');

  // Archive the batch.
  await click(`document.querySelector('[data-focus="bulk-action"]')`);
  check('rows after Archive', await js('window.__q.rows()'), ['One', 'Five']);
  check(
    'toast',
    await js(
      `(() => { const t = document.querySelector('.notes-toast'); return [t.hidden, t.textContent]; })()`,
    ),
    [false, '3 notes archivedUndo'],
  );
  check(
    'live region',
    await js(`document.querySelector('.notes-live').textContent`),
    'Archived 3 notes. Archived (3).',
  );
  check('focus after Archive', await js('window.__q.focus()'), 'select:n1');
  await shot('select-mode-after-archive.png');

  // Keyboard: Tab from Cancel reaches Undo; Enter undoes.
  await js(`document.querySelector('[data-focus="bulk-cancel"]').focus()`);
  await press('Tab');
  check('Tab from Cancel', await js('window.__q.focus()'), 'toast-undo');
  await press('Enter');
  check('rows after Undo', await js('window.__q.rows()'), titles);
  check(
    'live after Undo',
    await js(`document.querySelector('.notes-live').textContent`),
    'Undid archive of 3 notes. Archived (0).',
  );
  check('focus after Undo', await js('window.__q.focus()'), 'view:notes');
  check(
    'toast hidden after Undo',
    await js(`document.querySelector('.notes-toast').hidden`),
    true,
  );

  // Space toggles natively; Shift+Space takes the range without flipping back.
  await js(`window.__q.box('One').focus()`);
  await press('Space');
  check('Space toggles', await js('window.__q.ticked()'), ['One']);
  await press('Tab');
  await press('Tab');
  check('Tab to row 3', await js('window.__q.focus()'), 'select:n3');
  await press('Space', 8);
  check('Shift+Space range', await js('window.__q.ticked()'), [
    'One',
    'Two',
    'Three',
  ]);
  check('focus after Shift+Space', await js('window.__q.focus()'), 'select:n3');

  // Esc exits select mode and focuses the toggle.
  await press('Escape');
  check(
    'Esc exits',
    await js(
      `[document.querySelector('.notes-select-toggle').getAttribute('aria-pressed'), document.querySelectorAll('.notes-select').length]`,
    ),
    ['false', 0],
  );
  check('focus after Esc', await js('window.__q.focus()'), 'select-mode');

  // Narrow viewport: the bar and toast fit, and the toast hides after 5 s.
  await page('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click(`document.querySelector('.notes-select-toggle')`);
  await click(`document.querySelector('[data-focus="bulk-select-all"]')`);
  await click(`document.querySelector('[data-focus="bulk-action"]')`);
  check(
    'no overflow at 360px',
    await js(
      `['.notes-bulk-bar', '.notes-toast'].map((s) => { const e = document.querySelector(s); return e.scrollWidth <= e.clientWidth; }).concat(document.documentElement.scrollWidth <= 360)`,
    ),
    [true, true, true],
  );
  await shot('select-mode-360px.png');
  await sleep(5300);
  check(
    'toast hidden after 5 s',
    await js(`document.querySelector('.notes-toast').hidden`),
    true,
  );
} catch (error) {
  failures++;
  console.error(error);
} finally {
  proc.kill();
}
console.log(failures === 0 ? 'JOURNEY OK' : `JOURNEY FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
