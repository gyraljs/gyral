// Invoker commands as an intent source (gyral-czi.6, ADR 0001 addendum, ADR 0003).
//
//   <button type="button" commandfor="cart" command="--clear">Clear</button>
//   <section id="cart" data-intent=${i.Clear} data-intent-on="command">…</section>
//
// Browsers with invoker commands dispatch a `CommandEvent` on the target. Elsewhere (invokers
// are Baseline newly available, not widely) Gyral dispatches an equivalent `command` event when
// a custom-command (`--…`) invoker inside a component is clicked, so the same markup works:
// invokers-shim.ts, an ADR 0003 tier-3 fallback loaded with import() only there, and only by
// components listening for `command`. Built-in commands (`show-modal`, …) are left to the
// browser.

export interface CommandInfo {
  /** The command, e.g. `--clear`. */
  readonly command: string;
  /** The invoker (the button) that sent it. */
  readonly source: Element | undefined;
}

/** Native invoker commands available? */
export const invokersSupported = (): boolean => 'CommandEvent' in globalThis;

/**
 * The command carried by a `CommandEvent`, or by Gyral's fallback event, which has the same
 * `command` and `source` properties.
 */
export function commandOf(event: Event): CommandInfo | undefined {
  const { type, command, source } = event as Event & { command?: unknown; source?: unknown };
  return type === 'command' && typeof command === 'string'
    ? { command, source: source instanceof Element ? source : undefined }
    : undefined;
}
