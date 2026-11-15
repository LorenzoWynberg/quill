import { markdownToPlainText } from '../preview';

/** Count the words a reader sees in a markdown body (syntax and link targets excluded). */
export function countWords(body: string): number {
  const t = markdownToPlainText(body).trim();
  return t === '' ? 0 : t.split(/\s+/u).length;
}

/** Count characters of the raw source by code point, so an emoji counts once. */
export function countCharacters(body: string): number {
  return [...body].length;
}

/** Format the footer text for a note body, e.g. "1 word · 5 characters". */
export function formatCount(body: string): string {
  const words = countWords(body);
  const characters = countCharacters(body);
  const w = `${words} ${words === 1 ? 'word' : 'words'}`;
  const c = `${characters} ${characters === 1 ? 'character' : 'characters'}`;
  return `${w} · ${c}`;
}
