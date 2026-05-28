/**
 * Returns the default server-side language for static rendering.
 * All pages default to 'es' on the server; LangProvider hydrates
 * the real user preference client-side from the ytubviral_lang cookie.
 *
 * This is a function (not a constant) so TypeScript's control-flow
 * narrowing does not collapse the return type to a literal 'es'.
 */
export type Lang = 'es' | 'en';

export function getServerLang(): Lang {
  return 'es';
}
