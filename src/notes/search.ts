import { deriveTitle } from './title';

export function matchesQuery(body: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    body.toLowerCase().includes(q) ||
    deriveTitle(body).toLowerCase().includes(q)
  );
}
