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
