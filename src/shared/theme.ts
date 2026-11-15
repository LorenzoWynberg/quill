export const THEME_STORAGE_KEY = 'quill:theme';

export type ThemeChoice = 'light' | 'dark' | 'system';

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // storage unavailable: the choice still applies for this page view
  }
}

const OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function mountThemeControl(container: HTMLElement): void {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'theme-control';
  const legend = document.createElement('legend');
  legend.textContent = 'Theme';
  fieldset.append(legend);
  const current = readThemeChoice();
  for (const { value, label } of OPTIONS) {
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'theme';
    input.value = value;
    input.checked = value === current;
    wrap.append(input, document.createTextNode(label));
    fieldset.append(wrap);
  }
  fieldset.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.checked) {
      applyThemeChoice(target.value as ThemeChoice);
    }
  });
  container.append(fieldset);
}
