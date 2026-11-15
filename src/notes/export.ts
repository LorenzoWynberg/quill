import { strToU8, zipSync } from 'fflate';
import { deriveTitle } from './title';
import type { Note } from './store';

const MAX_BASE = 80;

const YAML_ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  '"': '\\"',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

function escapeYamlTag(t: string): string {
  return t.replace(/[\\"\p{Cc}\u2028\u2029]/gu, (ch) => {
    const known = YAML_ESCAPES[ch];
    if (known !== undefined) return known;
    return `\\x${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(2, '0')}`;
  });
}

type Exportable = Pick<Note, 'body'> & { tags?: readonly string[] };

export function noteMarkdown(note: Exportable): string {
  const tags = note.tags ?? [];
  if (tags.length === 0) return note.body;
  const lines = tags.map((t) => `  - "${escapeYamlTag(t)}"\n`);
  return `---\ntags:\n${lines.join('')}---\n${note.body}`;
}
const ILLEGAL = '/\\:*?"<>|';

export function noteFilename(note: Pick<Note, 'body'>): string {
  const cleaned = Array.from(deriveTitle(note.body)).filter((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code > 0x1f && code !== 0x7f && !ILLEGAL.includes(ch);
  });
  const collapsed = cleaned
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.\s]+$/u, '');
  const base = Array.from(collapsed)
    .slice(0, MAX_BASE)
    .join('')
    .replace(/[.\s]+$/u, '');
  return `${base === '' ? 'Untitled' : base}.md`;
}

export function uniqueFilenames(
  notes: readonly Pick<Note, 'body'>[],
): string[] {
  const seen = new Set<string>();
  return notes.map((note) => {
    const name = noteFilename(note);
    const stem = name.slice(0, -3);
    let candidate = name;
    let n = 2;
    while (seen.has(candidate.toLowerCase())) {
      candidate = `${stem} (${n}).md`;
      n += 1;
    }
    seen.add(candidate.toLowerCase());
    return candidate;
  });
}

export function zipFilename(date: Date = new Date()): string {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `quill-notes-${y}-${m}-${d}.zip`;
}

export function buildNotesZip(notes: readonly Exportable[]): Uint8Array {
  const names = uniqueFilenames(notes);
  const files: Record<string, Uint8Array> = {};
  notes.forEach((note, i) => {
    files[names[i] as string] = strToU8(noteMarkdown(note));
  });
  return zipSync(files);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportNote(note: Exportable): void {
  downloadBlob(
    new Blob([noteMarkdown(note)], { type: 'text/markdown;charset=utf-8' }),
    noteFilename(note),
  );
}

export function exportAllNotes(notes: readonly Exportable[]): void {
  if (notes.length === 0) return;
  const bytes = buildNotesZip(notes);
  downloadBlob(
    new Blob([bytes as BlobPart], { type: 'application/zip' }),
    zipFilename(),
  );
}
