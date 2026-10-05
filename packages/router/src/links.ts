// Same-origin link capture (docs/design-docs/0009-router.md).
import type { LocationLike } from './stream.js';

const isModified = (event: MouseEvent): boolean =>
  event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

function anchorOf(event: Event): HTMLAnchorElement | undefined {
  // composedPath() sees anchors inside (open) shadow roots; event.target is retargeted.
  for (const node of event.composedPath()) {
    if (node instanceof HTMLAnchorElement && node.hasAttribute('href')) return node;
  }
  return undefined;
}

/**
 * The URL a click should navigate to in-app, or `undefined` to let the browser handle it.
 * Skips: already-handled clicks, modified or non-primary clicks, `target` other than
 * `_self`, `download`, `rel="external"`, other origins, and same-page hash links.
 */
export function capturedUrl(event: MouseEvent, location: LocationLike): URL | undefined {
  if (event.defaultPrevented || isModified(event)) return undefined;
  const anchor = anchorOf(event);
  if (anchor === undefined) return undefined;
  const target = anchor.getAttribute('target');
  if (target !== null && target !== '' && target !== '_self') return undefined;
  if (anchor.hasAttribute('download') || anchor.relList.contains('external')) return undefined;
  // Resolve the attribute against the router's location, not the document's (memory history
  // routes against its own origin; `anchor.href` is already absolute for the real page).
  const url = new URL(anchor.getAttribute('href') ?? '', location.href);
  if (url.origin !== location.origin) return undefined;
  const samePage = url.pathname === location.pathname && url.search === location.search;
  if (samePage && url.hash !== '') return undefined;
  return url;
}

// Routers capturing clicks on each root right now (dev warning on overlap, gyral-ud5.10).
const capturing = new Map<EventTarget, number>();

type Subscribe<T> = (emit: (value: T) => void, signal: AbortSignal) => Promise<never>;

export interface LinkCapture {
  /** Wraps `subscribe`: capture is on only while at least one `listen` stream is running. */
  readonly track: <T>(subscribe: Subscribe<T>) => Subscribe<T>;
  readonly dispose: () => void;
}

/**
 * Link capture tied to the router's listeners (ADR 0009 addendum, gyral-ud5.10): the click
 * listener is added when the first `listen` stream starts and removed when the last one ends,
 * so a router whose components have disconnected (or a leftover router from an earlier test)
 * can never claim clicks. Warns when two routers capture on the same root at once.
 */
export function linkCapture(
  root: EventTarget | undefined,
  onClick: (event: Event) => void,
): LinkCapture {
  let listeners = 0;
  let active = false;

  const start = (): void => {
    if (root === undefined || active) return;
    const others = capturing.get(root) ?? 0;
    if (others > 0) {
      console.warn(
        'gyral router: two routers are capturing link clicks on the same root; only the ' +
          'first one to see a click navigates. Dispose the old router, or give each router its ' +
          'own `linkRoot` (ADR 0009).',
      );
    }
    capturing.set(root, others + 1);
    root.addEventListener('click', onClick);
    active = true;
  };

  const stop = (): void => {
    if (root === undefined || !active) return;
    root.removeEventListener('click', onClick);
    const left = (capturing.get(root) ?? 1) - 1;
    if (left > 0) capturing.set(root, left);
    else capturing.delete(root);
    active = false;
  };

  return {
    track:
      <T>(subscribe: Subscribe<T>): Subscribe<T> =>
      (emit, signal) => {
        if (!signal.aborted) {
          listeners += 1;
          start();
          signal.addEventListener(
            'abort',
            () => {
              listeners -= 1;
              if (listeners === 0) stop();
            },
            { once: true },
          );
        }
        return subscribe(emit, signal);
      },
    dispose: () => {
      listeners = 0;
      stop();
    },
  };
}
