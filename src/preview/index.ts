import MarkdownIt from 'markdown-it';

const md = new MarkdownIt('commonmark', {
  html: false,
  linkify: false,
  typographer: false,
}).enable(['table', 'strikethrough']);

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return self.renderToken(tokens, idx, options);
};

/** Render a markdown note body to safe HTML (raw HTML is escaped, script links dropped). */
export function renderMarkdown(body: string): string {
  return md.render(body);
}

type Tok = ReturnType<typeof md.parse>[number];

function collect(tokens: Tok[], out: string[]): void {
  for (const t of tokens) {
    if (t.type === 'text' || t.type === 'code_inline') out.push(t.content);
    else if (t.type === 'fence' || t.type === 'code_block') {
      out.push(' ', t.content, ' ');
    } else if (t.type === 'softbreak' || t.type === 'hardbreak') out.push(' ');
    else if (t.children) collect(t.children, out);
    else out.push(' ');
  }
}

/** Reduce a markdown note body to the plain text a reader sees (no syntax, no link targets). */
export function markdownToPlainText(body: string): string {
  const out: string[] = [];
  collect(md.parse(body, {}), out);
  return out.join('').replace(/\s+/gu, ' ').trim();
}
