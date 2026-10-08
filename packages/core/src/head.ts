// The head model (ADR 0019): one description of a page's managed <head> elements, shared by the
// server's page shell (@gyral/ssr `page()`) and the router's `setHead()`. Types and a pure
// normalizer only, no DOM, so both halves agree on keys, order and duplicates.
import { DEV } from '#view-dev';
import { scriptSafeJson } from './store-scope.js';

/** A JSON value: what a JSON-LD block holds. */
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** `<meta name content>`, or `<meta property content>` (Open Graph uses `property`). */
export type HeadMeta =
  | { readonly name: string; readonly content: string }
  | { readonly property: string; readonly content: string };

/** A metadata `<link>`: `alternate` (with `hreflang`), `icon`, `manifest`, `prev`/`next`, … */
export interface HeadLink {
  readonly rel: string;
  readonly href: string;
  readonly [attribute: string]: string;
}

/** A page's head: what `page()` writes on the server and `setHead()` applies on the client. */
export interface Head {
  readonly title: string;
  readonly description?: string;
  /** Absolute URL, usually `new URL(match.path, origin).href` (ADR 0009 "Canonical paths"). */
  readonly canonical?: string;
  /** `<meta name="robots">`, e.g. `'noindex, follow'`. */
  readonly robots?: string;
  /** Later entries win over earlier ones with the same name or property. */
  readonly meta?: readonly HeadMeta[];
  /** Later entries win over earlier ones with the same attributes other than `href`. */
  readonly links?: readonly HeadLink[];
  /** Structured data, each written as one `<script type="application/ld+json">`. */
  readonly jsonLd?: readonly JsonValue[];
  /** `<html lang>`. */
  readonly lang?: string;
  /** `<html dir>`. */
  readonly dir?: 'ltr' | 'rtl' | 'auto';
}

/** The attribute that marks an element the head model manages; its value is the entry's key. */
export const HEAD_ATTRIBUTE = 'data-gyral-head';

/** One managed element: its key, tag, attributes (in order) and, for JSON-LD, its text. */
export interface HeadEntry {
  readonly key: string;
  readonly tag: 'meta' | 'link' | 'script';
  readonly attributes: readonly (readonly [name: string, value: string])[];
  readonly text?: string;
}

// Belong to page() itself: changing them per navigation would unstyle the page, refetch
// modules, or apply policy too late. Checked in development only.
const REFUSED_REL = /(^|\s)(stylesheet|preload|modulepreload|canonical)(\s|$)/i;

function check(head: Head): void {
  const refuse = (what: string): never => {
    throw new Error(
      `gyral head: ${what} is not a managed head entry (ADR 0019 "Keys, dedupe and order"). ` +
        'Write it with page() options or extraHead.',
    );
  };
  for (const m of head.meta ?? []) {
    if ('http-equiv' in m || 'charset' in m) refuse('<meta http-equiv> or <meta charset>');
    if ('name' in m && /^viewport$/i.test(m.name)) refuse('<meta name="viewport">');
  }
  for (const link of head.links ?? []) {
    if (REFUSED_REL.test(link.rel)) refuse(`<link rel="${link.rel}">`);
  }
  if (head.canonical !== undefined && !/^[a-z][a-z\d+.-]*:/i.test(head.canonical)) {
    console.warn(
      `gyral head: canonical "${head.canonical}" is not an absolute URL. Build it from a ` +
        'configured origin: new URL(match.path, origin).href (ADR 0019).',
    );
  }
}

/**
 * A head's managed elements, in document order and without duplicates: description, robots,
 * canonical, `meta`, `links`, then JSON-LD. Later `meta`/`links` entries with the same key win
 * (at the later position); the typed description and robots win over `meta` entries. The
 * title, `lang` and `dir` are not elements here.
 */
export function headEntries(head: Head): readonly HeadEntry[] {
  if (DEV) check(head);
  const out = new Map<string, HeadEntry>();
  const add = (
    key: string,
    tag: HeadEntry['tag'],
    attributes: HeadEntry['attributes'],
    text?: string,
  ): void => {
    out.delete(key);
    out.set(key, text === undefined ? { key, tag, attributes } : { key, tag, attributes, text });
  };
  const meta = (attr: string, name: string, content: string): void => {
    add(`${attr}:${name}`, 'meta', [
      [attr, name],
      ['content', content],
    ]);
  };
  if (head.description !== undefined) meta('name', 'description', head.description);
  if (head.robots !== undefined) meta('name', 'robots', head.robots);
  if (head.canonical !== undefined) {
    add('canonical', 'link', [
      ['rel', 'canonical'],
      ['href', head.canonical],
    ]);
  }
  const typed = new Set(out.keys());
  for (const m of head.meta ?? []) {
    const [attr, name] = 'name' in m ? ['name', m.name] : ['property', m.property];
    if (!typed.has(`${attr}:${name}`)) meta(attr, name, m.content);
  }
  for (const link of head.links ?? []) {
    const attributes = Object.entries(link);
    const key = attributes
      .filter(([name]) => name !== 'href')
      .map(([name, value]) => `${name}=${value}`)
      .sort()
      .join(';');
    add(`link:${key}`, 'link', [
      ['rel', link.rel],
      ...attributes.filter(([name]) => name !== 'rel'),
    ]);
  }
  head.jsonLd?.forEach((value, n) => {
    add(`ld:${String(n)}`, 'script', [['type', 'application/ld+json']], scriptSafeJson(value));
  });
  return [...out.values()];
}
