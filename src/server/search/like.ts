/** Escapes LIKE/ILIKE metacharacters (`\`, `%`, `_`) so user input only ever matches literally (backslash is PostgreSQL's default escape). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
