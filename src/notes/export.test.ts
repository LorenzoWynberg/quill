import { afterEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import {
  buildNotesZip,
  downloadBlob,
  noteFilename,
  noteMarkdown,
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
    expect(noteFilename({ body: '# /\\:*?"<>|' })).toBe('Untitled.md');
  });

  it('never cuts an astral character in half', () => {
    const name = noteFilename({ body: `${'a'.repeat(79)}😀tail` });
    expect(name).toBe(`${'a'.repeat(79)}😀.md`);
    expect(name).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });

  it('collapses whitespace and drops trailing dots', () => {
    expect(noteFilename({ body: '# Plan  for  May...' })).toBe(
      'Plan for May.md',
    );
    expect(noteFilename({ body: '# Draft. . .' })).toBe('Draft.md');
    expect(noteFilename({ body: '# a   b\t   c' })).toBe('a b c.md');
    expect(noteFilename({ body: '# v1.2 notes' })).toBe('v1.2 notes.md');
  });

  it('falls back to Untitled for dots-only titles', () => {
    expect(noteFilename({ body: '# ...' })).toBe('Untitled.md');
    expect(noteFilename({ body: '# . . .' })).toBe('Untitled.md');
  });

  it('strips trailing dots or spaces exposed by the cap', () => {
    for (const sep of ['.', ' ']) {
      const name = noteFilename({
        body: `# ${'a'.repeat(79)}${sep}${'b'.repeat(120)}`,
      });
      expect(name).not.toMatch(/[.\s]\.md$/);
      expect(name.length).toBeLessThanOrEqual(83);
    }
  });
});

describe('uniqueFilenames', () => {
  it('dedupes names that differ only by trailing dots', () => {
    expect(uniqueFilenames([{ body: 'Plan' }, { body: 'Plan...' }])).toEqual([
      'Plan.md',
      'Plan (2).md',
    ]);
  });

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

describe('starred notes', () => {
  it('produce the same filename and zip as unstarred notes', () => {
    const plain = { body: '# Hi', createdAt: 1, updatedAt: 2 };
    const starred = { ...plain, starred: true };
    expect(noteFilename(starred)).toBe(noteFilename(plain));
    expect(buildNotesZip([starred])).toEqual(buildNotesZip([plain]));
  });
});

describe('tags in markdown', () => {
  it('escapes control characters so each tag stays on one line', () => {
    const out = noteMarkdown({
      body: 'B',
      tags: ['a\nb\rc\td\u2028e\u2029f', 'g\u0000h\u007fi\u0085j'],
    });
    expect(out).toBe(
      '---\ntags:\n  - "a\\nb\\rc\\td\\u2028e\\u2029f"\n  - "g\\x00h\\x7Fi\\x85j"\n---\nB',
    );
    expect(out.split('\n')).toHaveLength(6);
  });

  it('cannot forge a frontmatter delimiter through a tag', () => {
    const out = noteMarkdown({ body: 'B', tags: ['x\n---\ny'] });
    const lines = out.split('\n');
    expect(lines.filter((l) => l === '---')).toHaveLength(2);
  });

  it('writes YAML frontmatter with escaped tags', () => {
    expect(noteMarkdown({ body: '# Hi', tags: ['a', 'b"c\\d'] })).toBe(
      '---\ntags:\n  - "a"\n  - "b\\"c\\\\d"\n---\n# Hi',
    );
  });

  it('leaves untagged bodies untouched', () => {
    expect(noteMarkdown({ body: 'x' })).toBe('x');
    expect(noteMarkdown({ body: 'x', tags: [] })).toBe('x');
  });

  it('zips the frontmatter and keeps the title filename', () => {
    const files = unzipSync(buildNotesZip([{ body: '# Hi', tags: ['t'] }]));
    expect(Object.keys(files)).toEqual(['Hi.md']);
    expect(strFromU8(files['Hi.md'] as Uint8Array)).toBe(
      '---\ntags:\n  - "t"\n---\n# Hi',
    );
  });
});

describe('archived notes', () => {
  it('export like any other note', () => {
    const archived = { body: '# A', tags: [], archivedAt: 5 };
    const files = unzipSync(
      buildNotesZip([archived, { body: '# B', tags: [] }]),
    );
    expect(Object.keys(files)).toHaveLength(2);
    expect(strFromU8(files['A.md']!)).toBe(noteMarkdown(archived));
  });
});
