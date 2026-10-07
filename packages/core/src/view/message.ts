// Diagnostic text (gyral-c5d.13): the full message in development, a code and the docs URL in
// production, so production bundles carry no message table. Every error and warning core can
// raise in production goes through `message()` (or, for a hydration mismatch, which keeps its
// sentence, `docsLink()`); development-only checks keep their own text behind `DEV`. The codes
// and texts are in messages.ts.
import { DEV } from '#view-dev';
import { MESSAGES } from './messages.js';

/** A diagnostic's code (messages.ts). */
export type MessageCode = keyof typeof MESSAGES;

/** Where production messages point: the docs page generated from messages.ts. */
export const ERRORS_URL = 'https://gyral.dev/errors/#';

/** `G0010` for code 10. */
export const codeName = (code: number): string => `G${String(code).padStart(4, '0')}`;

/** Development: the table's text with `args` in its placeholders. */
function fullText(code: MessageCode, args: readonly unknown[]): string {
  const names: string[] = [];
  return MESSAGES[code].replace(/\{(\w+)\}/g, (_, name: string) => {
    let at = names.indexOf(name);
    if (at < 0) at = names.push(name) - 1;
    return String(args[at]);
  });
}

/**
 * `Gyral G0062 https://gyral.dev/errors/#G0062`, for a message that keeps a sentence of its own
 * in production (a hydration mismatch names the node in words) and points to the docs there.
 */
export const docsLink = (code: MessageCode): string => {
  const id = codeName(code);
  return `Gyral ${id} ${ERRORS_URL}${id}`;
};

/**
 * The text of diagnostic `code` with its arguments: in development the full message, in
 * production `Gyral G0010 <args…> https://gyral.dev/errors/#G0010`.
 */
export function message(code: MessageCode, ...args: readonly unknown[]): string {
  if (DEV) return fullText(code, args);
  const id = codeName(code);
  return [`Gyral ${id}`, ...args, ERRORS_URL + id].join(' ');
}
