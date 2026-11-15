import { describe, expect, it } from 'vitest';

describe('smoke', () => {
  it('runs in a DOM environment', () => {
    document.body.innerHTML = '<main data-pane="edit"></main>';
    expect(document.querySelector('main')?.dataset.pane).toBe('edit');
  });
});
