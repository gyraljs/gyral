// In-memory history: tests and servers route without touching window.location (ADR 0009).
import { capturedUrl, linkCapture } from './links.js';
import { locationStream } from './stream.js';
import type { Source } from './source.js';

export interface MemoryOptions {
  /** Starting URL, absolute or relative to `origin`. Default `'/'`. */
  readonly initial?: string;
  /** Origin that relative URLs resolve against. Default `'http://localhost'`. */
  readonly origin?: string;
  /**
   * Intercept same-origin link clicks. **Default `false`** (opt in): a router that captures
   * every link on the page breaks multi-page apps where only one component routes (ADR 0009).
   */
  readonly captureLinks?: boolean;
  /**
   * Where to capture link clicks when `captureLinks` is on. Default: the (global, or the
   * browser history's) `document`. Passing an element also turns capture on and limits it to
   * that subtree; `null` turns it off. Capture is only active while a component listens.
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
      ? options.captureLinks === true
        ? (globalThis as { document?: Document }).document
        : undefined
      : (options.linkRoot ?? undefined);
  const onClick = (event: Event): void => {
    if (!(event instanceof MouseEvent)) return;
    const url = capturedUrl(event, at());
    if (url === undefined) return;
    event.preventDefault();
    navigate(url.href, false);
  };
  // Only while a component listens (gyral-ud5.10): a leftover router never claims clicks.
  const capture = linkCapture(linkRoot, onClick);

  return {
    subscribe: capture.track(stream.subscribe),
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
      capture.dispose();
      stream.clear();
    },
  };
}
