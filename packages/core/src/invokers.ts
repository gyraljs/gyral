// Invoker commands as an intent source (gyral-czi.6, ADR 0001 addendum, ADR 0003).
//
//   <button type="button" commandfor="cart" command="--clear">Clear</button>
//   <section id="cart" data-intent=${i.Clear} data-intent-on="command">…</section>
//
// Browsers with invoker commands dispatch a `CommandEvent` on the target. Elsewhere (invokers
// are Baseline newly available, not widely) Gyral dispatches an equivalent `command` event when
// a custom-command (`--…`) invoker inside a component is clicked, so the same markup works.
// Built-in commands (`show-modal`, `toggle-popover`, …) are left to the browser.

export interface CommandInfo {
  /** The command, e.g. `--clear`. */
  readonly command: string;
  /** The invoker (the button) that sent it. */
  readonly source: Element | undefined;
}

/** Native invoker commands available? */
export const invokersSupported = (): boolean => 'CommandEvent' in globalThis;

/** The command carried by a native `CommandEvent` or by Gyral's fallback event. */
export function commandOf(event: Event): CommandInfo | undefined {
  if (event.type !== 'command') return undefined;
  if (event instanceof CustomEvent) {
    const detail = event.detail as Partial<CommandInfo> | null;
    return typeof detail?.command === 'string'
      ? { command: detail.command, source: detail.source }
      : undefined;
  }
  const native = event as Event & { command?: unknown; source?: unknown };
  return typeof native.command === 'string'
    ? {
        command: native.command,
        source: native.source instanceof Element ? native.source : undefined,
      }
    : undefined;
}

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
 * `root` dispatches a `command` CustomEvent on its `commandfor` target (same tree scope).
 */
export function shimInvokers(root: Node): void {
  root.addEventListener('click', (event) => {
    if (invokersSupported()) return;
    const invoker = invokerIn(event);
    const id = invoker?.getAttribute('commandfor');
    const command = invoker?.getAttribute('command');
    if (invoker === undefined || id == null || command == null) return;
    const scope = invoker.getRootNode() as Document | ShadowRoot;
    const target = scope.getElementById(id);
    if (target === null) return;
    target.dispatchEvent(
      new CustomEvent<CommandInfo>('command', {
        detail: { command, source: invoker },
        cancelable: true,
      }),
    );
  });
}
