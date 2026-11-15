import { afterEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import {
  buildNotesZip,
  downloadBlob,
  noteFilename,
  uniqueFilenames,
  zipFilename,
} from './export';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('noteFilename', () => {
  it('strips illegal and control characters', () => {
    expect(noteFilename({ body: '# a/b\\c:d*e?f"g<h>i|j' })).toBe(
      'abcdefghij.md',
    );
    expect(noteFilename({ body: 'x\ty\u0007z' })).toBe('xyz.md');
  });

  it('caps the base at 80 characters and falls back to Untitled', () => {
    expect(noteFilename({ body: 'a'.repeat(200) })).toBe(
      `${'a'.repeat(80)}.md`,
    );
    expect(noteFilename({ body: '' })).toBe('Untitled.md');
    expect(noteFilename({ body: '###' })).toBe('Untitled.md');
  });
});

describe('uniqueFilenames', () => {
  it('dedupes case-insensitively', () => {
    expect(
      uniqueFilenames([{ body: 'Todo' }, { body: 'todo' }, { body: 'Todo' }]),
    ).toEqual(['Todo.md', 'todo (2).md', 'Todo (3).md']);
    expect(uniqueFilenames([{ body: '' }, { body: '' }, { body: '' }])).toEqual(
      ['Untitled.md', 'Untitled (2).md', 'Untitled (3).md'],
    );
  });
});

describe('zip', () => {
  it('names the archive by local date', () => {
    expect(zipFilename(new Date(2026, 0, 5))).toBe(
      'quill-notes-2026-01-05.zip',
    );
  });

  it('round-trips note bodies', () => {
    const notes = [{ body: '# Café ✓\nhi' }, { body: '# Café ✓\nother' }];
    const out = unzipSync(buildNotesZip(notes));
    expect(Object.keys(out)).toEqual(['Café ✓.md', 'Café ✓ (2).md']);
    expect(strFromU8(out['Café ✓.md'] as Uint8Array)).toBe(notes[0]?.body);
  });
});

describe('downloadBlob', () => {
  it('clicks a download anchor and revokes the url', () => {
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    downloadBlob(new Blob(['a']), 'a.md');
    expect(create).toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:x');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
