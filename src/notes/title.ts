export function deriveTitle(body: string): string {
  const first = body.split(/\r?\n/, 1)[0] ?? '';
  const title = first.replace(/^[#\s]+/, '').trim();
  return title === '' ? 'Untitled' : title;
}
