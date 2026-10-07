// The invoker-command fallback (gyral-czi.6, ADR 0003 tier 3): loaded with import() by a
// component that listens for `command` intents in a browser without `CommandEvent`
// (intent.ts). Remove it when invoker commands are widely available (2028-06-12).
import type { CommandInfo } from './invokers.js';

/** The custom-command invoker an event passed through, if any. */
function invokerIn(event: Event): Element | undefined {
  for (const node of event.composedPath()) {
    if (
      node instanceof Element &&
      node.getAttribute('command')?.startsWith('--') === true &&
      node.hasAttribute('commandfor')
    ) {
      return node;
    }
  }
  return undefined;
}

/**
 * Fallback for browsers without invoker commands: a click on a `command="--…"` invoker inside
 * `root` dispatches a `command` event on its `commandfor` target (same tree scope), with the
 * `command` and `source` properties a native `CommandEvent` has.
 */
export function shimInvokers(root: Node): void {
  root.addEventListener('click', (event) => {
    const invoker = invokerIn(event);
    const id = invoker?.getAttribute('commandfor');
    const command = invoker?.getAttribute('command');
    if (invoker === undefined || id == null || command == null) return;
    const scope = invoker.getRootNode() as Document | ShadowRoot;
    const target = scope.getElementById(id);
    if (target === null) return;
    const info: CommandInfo = { command, source: invoker };
    target.dispatchEvent(Object.assign(new Event('command', { cancelable: true }), info));
  });
}
