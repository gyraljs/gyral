// Calling a method on an element from the model (gyral-1zd.27, view/05-element.md "Calling an
// element's method"). Telling a child component, a media element or a widget to do something
// (play, reset, open a room) is a side effect, so the model asks for it with a command, as it
// does for focus: `call(selector, method, ...args)`. It runs as post-render work against the
// component's own tree, so the element already exists. Gyral's answer to refs and ports: the
// request is plain data, so a model test reads it with `callsIn` (@gyral/testing).
import type { Command } from './command.js';
import { fail } from './errors.js';
import type { LocalHost } from './features.js';
import { afterRender, POST_FOCUS } from './scheduler.js';
import { DEV, message } from './view/index.js';

/** The input of a `call()` command. */
export interface CallInput {
  readonly selector: string;
  readonly method: string;
  readonly args: readonly unknown[];
}

/** Marker driver: the host runs call commands itself (`local`), after the render. */
export const CALL = {
  name: '@gyral/call',
  run: () => undefined,
  local: (host: LocalHost, input: unknown) => {
    afterRender(POST_FOCUS, () => {
      const root = host.root();
      if (host.el.isConnected && root !== undefined)
        runCall(root, host.el, host.tag, input as CallInput);
    });
  },
} as const;

/**
 * A command that calls `method` with `args` on the first element matching `selector` inside
 * this component (its shadow root, or its own children in light-DOM mode) once the current
 * update has rendered:
 *
 *   Start: (s) => [{ ...s, playing: true }, [call('video', 'play')]]
 *   Join: (s, m) => [s, [call('room-stage', 'join', m.room)]]
 *
 * `args` must be plain data (structured-cloneable), so the command stays data a test can
 * compare. A missing element or method, or a method that throws or rejects, is reported
 * through the error channel (ADR 0024); the error's cause says which.
 */
export function call(
  selector: string,
  method: string,
  ...args: readonly unknown[]
): Command<never> {
  if (DEV) {
    try {
      structuredClone(args);
    } catch {
      throw new TypeError(message(86, selector, method));
    }
  }
  const input: CallInput = { selector, method, args };
  return { driver: CALL, input, onSuccess: () => undefined };
}

/**
 * Runs a call command against `root`. No element, no such method, or a method that throws or
 * rejects: reported with `host` (the cause says which).
 */
export function runCall(root: ParentNode, host: Element, tag: string, input: CallInput): void {
  const { selector, method, args } = input;
  const failed = (cause: unknown): void => {
    fail(cause, 'command', message(85, tag, selector, method), { host, tag, msg: method });
  };
  try {
    const target = root.querySelector(selector) as Record<string, unknown> | null;
    if (target === null) throw new Error(`no element matches ${selector}`);
    const result: unknown = (target[method] as (...a: unknown[]) => unknown).apply(target, [
      ...args,
    ]);
    if (result instanceof Promise) result.catch(failed);
  } catch (cause) {
    failed(cause);
  }
}
