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
