/**
 * Sanitiserar errors innan de skickas till klienten.
 *
 * Bakgrund: Prisma och liknande libs kastar errors med detaljerade
 * meddelanden som kan läcka schema-info (kolumnnamn, foreign-key-constraints,
 * SQL-detaljer). Att returnera `error.message` rakt till klienten ger
 * en angripare gratis intel om databasstruktur.
 *
 * - I dev: returnera full message så developern ser exakt vad som gick fel.
 * - I prod: logga fulla detaljer server-side (console.error) och returnera
 *   bara generisk text till klienten.
 */
export function sanitizeError(error: unknown, fallback = 'Serverfel'): string {
  if (process.env.NODE_ENV !== 'production') {
    return error instanceof Error ? error.message : String(error);
  }
  // Prod: logga server-side med fulla detaljer, returnera generisk text.
  console.error('[error]', error);
  return fallback;
}
