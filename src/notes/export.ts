import { strToU8, zipSync } from 'fflate';
import { deriveTitle } from './title';
import type { Note } from './store';

const MAX_BASE = 80;
const ILLEGAL = '/\\:*?"<>|';

export function noteFilename(note: Pick<Note, 'body'>): string {
  const cleaned = Array.from(deriveTitle(note.body))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f && !ILLEGAL.includes(ch);
    })
    .join('');
  const base = cleaned.slice(0, MAX_BASE).trim();
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

export function buildNotesZip(
  notes: readonly Pick<Note, 'body'>[],
): Uint8Array {
  const names = uniqueFilenames(notes);
  const files: Record<string, Uint8Array> = {};
  notes.forEach((note, i) => {
    files[names[i] as string] = strToU8(note.body);
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

export function exportNote(note: Pick<Note, 'body'>): void {
  downloadBlob(
    new Blob([note.body], { type: 'text/markdown;charset=utf-8' }),
    noteFilename(note),
  );
}

export function exportAllNotes(notes: readonly Pick<Note, 'body'>[]): void {
  if (notes.length === 0) return;
  const bytes = buildNotesZip(notes);
  downloadBlob(
    new Blob([bytes as BlobPart], { type: 'application/zip' }),
    zipFilename(),
  );
}
