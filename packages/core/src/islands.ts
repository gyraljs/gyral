// Lazy hydration islands (gyral-4k7.4, ADR 0012 addendum). A server-rendered component may
// hydrate later than page load: when the browser is idle, when it scrolls into view, or when
// the user first reaches for it. The server marks it with Lit's `defer-hydration` plus the
// strategy; the client removes `defer-hydration` when the strategy fires, and Lit's hydrate
// support hydrates it in place (define() finishes connecting from attributeChangedCallback).

/** When a server-rendered component hydrates. `load` (the default) means right away. */
export type HydrateStrategy = 'load' | 'idle' | 'visible' | 'interaction';

/** Server-written strategy for a deferred island; removed when the island is released. */
export const ISLAND_ATTRIBUTE = 'data-gyral-hydrate';
const DEFER = 'defer-hydration';

/** Events that mean the user is about to interact: they arrive before the click itself. */
const INTERACTION_EVENTS = ['pointerover', 'pointerdown', 'focusin', 'touchstart'] as const;

/** Server side: marks the host as an island unless it hydrates on load. */
export function markIsland(host: Element, strategy: HydrateStrategy | undefined): void {
  if (strategy === undefined || strategy === 'load') return;
  host.setAttribute(DEFER, '');
  host.setAttribute(ISLAND_ATTRIBUTE, strategy);
}

const scheduled = new WeakSet<Element>();

type IdleCallback = (callback: () => void, options?: { timeout: number }) => number;

/** requestIdleCallback is not Baseline widely available; fall back to a short timeout. */
function whenIdle(run: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: IdleCallback }).requestIdleCallback;
  if (idle === undefined) setTimeout(run, 200);
  else idle(run, { timeout: 2000 });
}

/**
 * Client side: if `host` is a deferred island, releases it when its strategy fires. Called on
 * connect; scheduling happens once per element.
 */
export function scheduleIsland(host: HTMLElement): void {
  const strategy = host.getAttribute(ISLAND_ATTRIBUTE);
  if (strategy === null || !host.hasAttribute(DEFER) || scheduled.has(host)) return;
  scheduled.add(host);
  const release = (): void => {
    host.removeAttribute(ISLAND_ATTRIBUTE);
    host.removeAttribute(DEFER); // Lit's hydrate support hydrates it now
  };
  if (strategy === 'idle') {
    whenIdle(release);
  } else if (strategy === 'visible') {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        release();
      }
    });
    observer.observe(host);
  } else {
    const controller = new AbortController();
    const once = (): void => {
      controller.abort();
      release();
    };
    for (const type of INTERACTION_EVENTS) {
      host.addEventListener(type, once, { capture: true, signal: controller.signal });
    }
  }
}
