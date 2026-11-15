/** Count whitespace-separated words in plain text. */
export function countWords(plain: string): number {
  const t = plain.trim();
  return t === '' ? 0 : t.split(/\s+/u).length;
}

/** Count characters by code point, so an emoji counts once. */
export function countCharacters(body: string): number {
  return [...body].length;
}

/** Format the footer text, e.g. "1 word · 5 characters". */
export function formatCount(words: number, characters: number): string {
  const w = `${words} ${words === 1 ? 'word' : 'words'}`;
  const c = `${characters} ${characters === 1 ? 'character' : 'characters'}`;
  return `${w} · ${c}`;
}
