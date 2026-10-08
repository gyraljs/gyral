// The browser router's History API path (ADR 0009): pushState/replaceState, popstate, and the
// scroll and focus steps the Navigation API does natively (ADR 0009 "Scroll and focus"). A tier-3
// fallback (ADR 0003): driver.ts loads it with import() only where `navigation` is missing.
// Removal date 2028-07-13, when the Navigation API becomes widely available.
import type { AfterNavigation } from '../source.js';
import type { LocationStream } from '../stream.js';

export interface HistoryPath {
  /** Pushes or replaces an entry for the same-origin `url`, then notifies. */
  readonly navigate: (url: URL, replace: boolean, after: AfterNavigation) => void;
  readonly dispose: () => void;
}

// Entries this router created carry a key, so back/forward can find the scroll position the
// entry was left at. (An entry of an earlier document reloads, and the browser restores it.)
const KEY = 'gyral:entry';
const keyOf = (state: unknown): unknown =>
  typeof state === 'object' && state !== null ? (state as Record<string, unknown>)[KEY] : undefined;
const newKey = (): string => Math.random().toString(36).slice(2);

/**
 * The browser's steps for a push or replace (HTML "scroll to the fragment"): the element whose
 * id is the decoded fragment, scrolled into view (honouring `scroll-margin` and
 * `scroll-behavior`); no fragment or no such element: the top. Only the document is searched,
 * as by the browser, not shadow roots.
 */
function scrollToFragment(win: Window, hash: string): void {
  let target: Element | null = null;
  try {
    target = hash === '' ? null : win.document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    // a malformed escape names no element
  }
  if (target === null) win.scrollTo(0, 0);
  else target.scrollIntoView();
}

/**
 * The Navigation API's focus reset: the first `[autofocus]` element, else the body (through a
 * momentary `tabindex`, since it isn't focusable), so the next Tab starts at the page start.
 */
function resetFocus(doc: Document): void {
  const auto = doc.querySelector('[autofocus]');
  if (auto instanceof HTMLElement) {
    auto.focus();
    return;
  }
  const { body } = doc;
  const had = body.hasAttribute('tabindex');
  if (!had) body.setAttribute('tabindex', '-1');
  body.focus({ preventScroll: true });
  if (!had) body.removeAttribute('tabindex');
}

export function historyPath(
  win: Window,
  stream: LocationStream,
  defaults: () => AfterNavigation,
  // Passed in, not imported: a static import would put rendered → settled → scheduler in both
  // the eager graph and this lazy chunk, and the bundler splits them into extra chunks every
  // page pays for. This module must have no runtime imports (checked by a router test).
  rendered: () => Promise<void>,
): HistoryPath {
  const { history } = win;
  // The scroll position each entry was left at, by key. `here` is the latest position: scroll
  // events arrive after `popstate`, so on popstate it is still the left entry's.
  const positions = new Map<unknown, readonly [number, number]>();
  let entry = keyOf(history.state);
  let here: readonly [number, number] = [win.scrollX, win.scrollY];
  let navigations = 0;
  const onScroll = (): void => {
    here = [win.scrollX, win.scrollY];
  };

  // Once the render has committed, unless a newer navigation started: reset focus when nothing
  // took it meanwhile (a `focus('main h1')` command, as the Navigation API checks), then scroll.
  const afterRender = (after: AfterNavigation, scroll: () => void): void => {
    const started = ++navigations;
    let moved = false;
    const onFocus = (): void => {
      moved = true;
    };
    win.addEventListener('focusin', onFocus, true);
    void rendered().then(() => {
      win.removeEventListener('focusin', onFocus, true);
      if (started !== navigations) return;
      if (after.focusReset && !moved) resetFocus(win.document);
      if (after.scroll) scroll();
    });
  };

  const onPopState = (event: PopStateEvent): void => {
    const from = stream.current();
    if (entry !== undefined) positions.set(entry, here);
    const key = (entry = keyOf(event.state));
    stream.notify();
    const to = stream.current();
    // A fragment-only traversal is the browser's own: no render to wait for.
    if (to.pathname === from.pathname && to.search === from.search) return;
    afterRender(defaults(), () => {
      const at = positions.get(key);
      if (at !== undefined) win.scrollTo(at[0], at[1]);
    });
  };

  win.addEventListener('popstate', onPopState);
  win.addEventListener('scroll', onScroll, { passive: true });

  return {
    navigate: (url, replace, after) => {
      if (entry === undefined && history.state === null) {
        entry = newKey();
        history.replaceState({ [KEY]: entry }, '');
      }
      if (entry !== undefined) positions.set(entry, [win.scrollX, win.scrollY]);
      entry = newKey();
      if (replace) history.replaceState({ [KEY]: entry }, '', url.href);
      else history.pushState({ [KEY]: entry }, '', url.href);
      stream.notify();
      afterRender(after, () => {
        scrollToFragment(win, url.hash);
      });
    },
    dispose: () => {
      win.removeEventListener('popstate', onPopState);
      win.removeEventListener('scroll', onScroll);
    },
  };
}
