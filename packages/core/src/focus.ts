// Focus management from the model (gyral-czi.28). Moving focus is a side effect, so the model
// asks for it with a command; define() queues it as the scheduler's first post-render work
// (view/04-scheduler.md "Post-render queue"), against the component's own root, so the element
// to focus already exists.
import type { Command } from './command.js';
import type { LocalHost } from './features.js';
import { afterRender, POST_FOCUS } from './scheduler.js';
import { message } from './view/index.js';

/** Marker driver: the host runs focus commands itself (`local`). */
export const FOCUS = {
  name: '@gyral/focus',
  run: () => undefined,
  local: (host: LocalHost, input: unknown) => {
    queueFocus(host.el, host.root, host.tag, input as FocusInput);
  },
} as const;

export interface FocusOptions {
  /** Don't scroll the element into view (default `false`: the browser scrolls if needed). */
  readonly preventScroll?: boolean;
  /** Also select the text of an input or textarea. */
  readonly select?: boolean;
  /**
   * If nothing matches after this render, keep the request and focus the target as soon as a
   * later render of this component produces it; a newer `focus()` from the component replaces
   * it, and after one second it gives up with the usual warning. `settled()` doesn't wait for it.
   */
  readonly wait?: boolean;
}

// How long `focus(selector, { wait: true })` waits for its target to appear.
const FOCUS_WAIT_MS = 1000;

// A component's waiting focus request, so the next focus() can cancel it.
const waiting = new WeakMap<Element, () => void>();

/** The input of a `focus()` command. */
export interface FocusInput extends FocusOptions {
  readonly selector: string;
}

/**
 * A command that focuses the first element matching `selector` inside this component (its
 * shadow root, or its own children in light-DOM mode) once the current update has rendered:
 *
 *   NextPage: (s, m) => [{ ...s, page: m.page }, [focus('h2', { preventScroll: true })]]
 *
 * Non-focusable targets (a heading) need `tabindex="-1"` in the view.
 */
export function focus(selector: string, options: FocusOptions = {}): Command<never> {
  const input: FocusInput = { selector, ...options };
  return { driver: FOCUS, input, onSuccess: () => undefined };
}

/** Runs a focus command against `root` (the scheduler calls it after the render). */
export function runFocus(root: ParentNode, tag: string, input: FocusInput): void {
  const target = root.querySelector(input.selector);
  if (!(target instanceof HTMLElement || target instanceof SVGElement)) {
    console.warn(message(13, tag, input.selector));
    return;
  }
  target.focus({ preventScroll: input.preventScroll ?? false });
  if (input.select === true && 'select' in target && typeof target.select === 'function') {
    (target as HTMLInputElement).select();
  }
}

/**
 * Runs a focus command after the flush that renders the same update, view transition
 * included: it is post-render work, so the DOM already shows the new state.
 */
export function queueFocus(
  host: Element,
  root: () => ParentNode | undefined,
  tag: string,
  input: FocusInput,
): void {
  afterRender(POST_FOCUS, () => {
    waiting.get(host)?.();
    const target = root();
    if (!host.isConnected || target === undefined) return;
    if (input.wait !== true || target.querySelector(input.selector) !== null) {
      runFocus(target, tag, input);
      return;
    }
    // Not rendered yet: watch the component's own DOM (renders are the only writers) until the
    // target appears, a newer focus() cancels, or time runs out. settled() doesn't wait for it.
    const stop = (): void => {
      observer.disconnect();
      clearTimeout(timer);
      waiting.delete(host);
    };
    const observer = new MutationObserver(() => {
      if (target.querySelector(input.selector) !== null) {
        stop();
        if (host.isConnected) runFocus(target, tag, input);
      }
    });
    const timer = setTimeout(() => {
      stop();
      runFocus(target, tag, input);
    }, FOCUS_WAIT_MS);
    observer.observe(target, { childList: true, subtree: true, attributes: true });
    waiting.set(host, stop);
  });
}
