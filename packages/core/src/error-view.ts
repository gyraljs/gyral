// Optional error handling a component asks for by name (ADR 0024, gyral-1zd.17): the `error`
// fallback view and the `Errored` framework message. Reached through `#spec-features`, so a
// compiled build bundles each only when some module names `error` or `Errored`
// (compiler/features.ts); the reporting channel itself (errors.ts) is in every app.
import { fail, type ErrorPhase, type GyralError } from './errors.js';
import type { Tagged } from './types.js';
import { message, render, type ChildValue, type SeenMarkup } from './view/index.js';

/**
 * Renders a component's `error` view into `root`; true when it rendered (a hydrating root is
 * cleared first). A view that throws too is reported and changes nothing.
 */
export function renderErrorView(
  view: (error: GyralError, state: never) => unknown,
  root: ShadowRoot | HTMLElement,
  error: GyralError,
  state: unknown,
  hydrating: boolean,
  seen: SeenMarkup,
  host: HTMLElement,
  tag: string,
): boolean {
  try {
    const value = view(error, state as never) as ChildValue;
    if (hydrating) root.replaceChildren();
    render(value, root, seen);
    return true;
  } catch (cause) {
    fail(cause, 'view', message(31, tag), { host, tag });
    return false;
  }
}

/** Sends `Errored` to a component whose `update` handles it (a failed update, parse or command). */
export function sendErrored(
  dispatch: (msg: Tagged) => unknown,
  phase: ErrorPhase,
  error: GyralError,
): void {
  if (phase === 'update' || phase === 'parse' || phase === 'command') {
    dispatch({ _tag: 'Errored', phase, error } as Tagged);
  }
}
