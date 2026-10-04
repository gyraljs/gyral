// In-memory history: tests and servers route without touching window.location (ADR 0009).
import { capturedUrl } from './links.js';
import { locationStream } from './stream.js';
import type { Source } from './source.js';

export interface MemoryOptions {
  /** Starting URL, absolute or relative to `origin`. Default `'/'`. */
  readonly initial?: string;
  /** Origin that relative URLs resolve against. Default `'http://localhost'`. */
  readonly origin?: string;
  /**
   * Where to capture same-origin link clicks. Default: the global `document` when there is one
   * (browser tests), none on a server. Pass `null` to disable.
   */
  readonly linkRoot?: EventTarget | null;
}

export function createMemorySource(options: MemoryOptions): Source {
  const base = new URL(options.origin ?? 'http://localhost');
  let entries = [new URL(options.initial ?? '/', base)];
  let index = 0;
  let title = '';
  const at = (): URL => entries[index] ?? base;
  const stream = locationStream(at);

  const navigate = (url: string, replace: boolean) => {
    const target = new URL(url, at());
    if (target.origin !== base.origin) {
      console.warn(`gyral router (memory): ignoring navigation to another origin: ${target.href}`);
      return undefined;
    }
    if (replace) entries = entries.map((entry, n) => (n === index ? target : entry));
    else {
      entries = [...entries.slice(0, index + 1), target];
      index = entries.length - 1;
    }
    stream.notify();
    return stream.current();
  };

  const linkRoot =
    options.linkRoot === undefined
      ? (globalThis as { document?: Document }).document
      : (options.linkRoot ?? undefined);
  const onClick = (event: Event): void => {
    if (!(event instanceof MouseEvent)) return;
    const url = capturedUrl(event, at());
    if (url === undefined) return;
    event.preventDefault();
    navigate(url.href, false);
  };
  linkRoot?.addEventListener('click', onClick);

  return {
    subscribe: stream.subscribe,
    navigate,
    traverse: (delta) => {
      const next = Math.min(Math.max(index + delta, 0), entries.length - 1);
      if (next === index) return;
      index = next;
      stream.notify();
    },
    setTitle: (text) => {
      title = text;
    },
    snapshot: () => ({ href: at().href, title, length: entries.length }),
    dispose: () => {
      linkRoot?.removeEventListener('click', onClick);
      stream.clear();
    },
  };
}
