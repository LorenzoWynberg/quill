import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './index';

const dom = (md: string) => {
  const el = document.createElement('div');
  el.innerHTML = renderMarkdown(md);
  return el;
};

describe('renderMarkdown', () => {
  it('escapes script tags', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(dom('<script>alert(1)</script>').querySelector('script')).toBeNull();
  });

  it('escapes inline html', () => {
    expect(renderMarkdown('<b>x</b>')).toContain('&lt;b&gt;');
    expect(dom('<b>x</b>').querySelector('b')).toBeNull();
  });

  it('escapes raw img with handlers', () => {
    const el = dom('<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
  });

  it.each([
    '[x](javascript:alert(1))',
    '[x](vbscript:x)',
    '[x](data:text/html;base64,PHNjcmlwdD4=)',
  ])('drops unsafe link %s', (src) => {
    const a = dom(src).querySelector('a');
    expect(a?.getAttribute('href') ?? '').not.toMatch(/script|data:/i);
  });

  it('opens safe links in a new tab with rel', () => {
    const a = dom('[a](https://example.com)').querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://example.com');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('sets target and rel on every link', () => {
    const links = dom(
      '[a](https://a.com) and [b](/b)\n\n[c](https://c.com)',
    ).querySelectorAll('a');
    expect(links).toHaveLength(3);
    links.forEach((a) => {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    });
  });

  it('renders tables', () => {
    const el = dom('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(el.querySelector('table')).not.toBeNull();
    expect(el.querySelector('th')).not.toBeNull();
  });

  it('renders strikethrough', () => {
    expect(renderMarkdown('~~gone~~')).toContain('<s>gone</s>');
  });

  it('leaves task lists as text', () => {
    const el = dom('- [ ] task');
    expect(el.querySelector('input')).toBeNull();
    expect(el.textContent).toContain('[ ] task');
  });
});

describe('dependencies', () => {
  it('uses markdown-it with no sanitizer or plugin', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const names = Object.keys(pkg.dependencies);
    expect(names).toContain('markdown-it');
    expect(names).not.toContain('dompurify');
    expect(names).not.toContain('sanitize-html');
    expect(names.filter((n) => n.startsWith('markdown-it-'))).toEqual([]);
  });
});
