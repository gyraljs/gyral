// The server renderer (view/06-server.md "API"): synchronous, chunked, runtime-agnostic (no
// DOM, no Node-only APIs: a JavaScript SHA-256 for the style hashes). `@gyral/core/server` wraps these,
// registering recorded specs first; code outside view/ may import only this module of view/server/.
import { DEV } from '../flags.js';
import { serverComponents } from '../registry.js';
import type { ChildValue } from '../render/values.js';
import { expand, styleText } from './component.js';
import { sha256 } from './sha256.js';
import { ROOT, Writer, type Item } from './writer.js';

export interface ServerRenderOptions {
  /**
   * Development markers (`<!--gyral:ID-->` before each template instance, for hydration's
   * checks, 07) and development checks. Default: on in development builds (the `development`
   * export condition, as for the client), off otherwise.
   */
  readonly dev?: boolean;
}

function push(stack: Item[], items: readonly Item[]): void {
  for (let i = items.length - 1; i >= 0; i--) stack.push(items[i] as Item);
}

/**
 * Renders `value` to HTML chunks, lazily: each step writes up to the next component boundary.
 * Every component's `init` and view run in the step that writes it, so a caller can wrap each
 * step in a per-request scope (ADR 0013).
 */
export function* render(value: ChildValue, options: ServerRenderOptions = {}): Iterable<string> {
  const dev = options.dev ?? DEV;
  const root = new Writer(dev, undefined);
  root.child(value, undefined, ROOT);
  const stack: Item[] = [];
  push(stack, root.done());
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    if (typeof item === 'string') yield item;
    else push(stack, expand(item, dev));
  }
}

/** Renders `value` to one string. */
export function renderToString(value: ChildValue, options?: ServerRenderOptions): string {
  let html = '';
  for (const chunk of render(value, options)) html += chunk;
  return html;
}

const hashes = new Map<string, string>();

/**
 * `'sha256-…'` of a `<style>` element's text, for a CSP `style-src` (cached per text).
 * Synchronous (sha256.ts), so a page can build its policy while it renders.
 */
export function styleHashSync(text: string): string {
  let hash = hashes.get(text);
  if (hash === undefined) {
    // The parser turns CR and CRLF into LF before the browser hashes the element's text.
    const digest = sha256(new TextEncoder().encode(text.replace(/\r\n?/g, '\n')));
    let binary = '';
    for (const byte of digest) binary += String.fromCharCode(byte);
    hash = `'sha256-${btoa(binary)}'`;
    hashes.set(text, hash);
  }
  return hash;
}

/** `styleHashSync`, as a promise (the API before it existed). */
export const styleHash = (text: string): Promise<string> => Promise.resolve(styleHashSync(text));

/** Tag → `<style>` text of every registered shadow component with CSS (08 "Server"). */
export function componentStyles(): ReadonlyMap<string, string> {
  const styles = new Map<string, string>();
  for (const component of serverComponents()) {
    const text = styleText(component);
    if (text !== '') styles.set(component.tag, text);
  }
  return styles;
}

/** The hashes of every registered shadow component's `<style>` (08 "Server"), deduplicated. */
export function styleHashes(): Promise<readonly string[]> {
  return Promise.resolve([...new Set([...componentStyles().values()].map(styleHashSync))]);
}
