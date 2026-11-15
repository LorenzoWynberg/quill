import { describe, expect, it } from 'vitest';
import { deriveTitle } from './title';

describe('deriveTitle', () => {
  it('uses the first line', () =>
    expect(deriveTitle('Hello\nworld')).toBe('Hello'));
  it('strips heading hashes and whitespace', () =>
    expect(deriveTitle('##   Heading\nx')).toBe('Heading'));
  it('falls back to Untitled for empty body', () =>
    expect(deriveTitle('')).toBe('Untitled'));
  it('falls back to Untitled when only hashes remain', () =>
    expect(deriveTitle('# \nbody')).toBe('Untitled'));
});
