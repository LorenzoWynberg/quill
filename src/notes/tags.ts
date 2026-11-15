export const MAX_TAG_LENGTH = 32;

export function normaliseTag(raw: string): string | null {
  const t = raw.trim();
  if (t === '' || t.includes(',') || Array.from(t).length > MAX_TAG_LENGTH)
    return null;
  if (/[\p{Cc}\u2028\u2029]/u.test(t)) return null;
  return t;
}

export function sameTag(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function normaliseTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = normaliseTag(r);
    if (t === null) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
