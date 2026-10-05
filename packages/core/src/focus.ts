// Focus management from the model (gyral-czi.28). Moving focus is a side effect, so the model
// asks for it with a command; define() runs it against the component's own render root after
// the render that the same reducer caused, so the element to focus already exists.
import type { Command } from './command.js';

/** Marker driver: `define()` handles focus commands itself. */
export const FOCUS = {
  name: '@gyral/focus',
  run: () => undefined,
} as const;

export interface FocusOptions {
  /** Don't scroll the element into view (default `false`: the browser scrolls if needed). */
  readonly preventScroll?: boolean;
  /** Also select the text of an input or textarea. */
  readonly select?: boolean;
}

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

/** Runs a focus command against `root` (called by define() after the update completes). */
export function runFocus(root: ParentNode, tag: string, input: FocusInput): void {
  const target = root.querySelector(input.selector);
  if (!(target instanceof HTMLElement || target instanceof SVGElement)) {
    console.warn(`<${tag}> focus("${input.selector}") matched no focusable element.`);
    return;
  }
  target.focus({ preventScroll: input.preventScroll ?? false });
  if (input.select === true && 'select' in target && typeof target.select === 'function') {
    (target as HTMLInputElement).select();
  }
}
