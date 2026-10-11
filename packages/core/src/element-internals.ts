// Native features share one attachment: attachInternals() may only be called once per host.
const internals = new WeakMap<HTMLElement, ElementInternals>();

export function internalsOf(host: HTMLElement): ElementInternals {
  let value = internals.get(host);
  if (value === undefined) {
    value = host.attachInternals();
    internals.set(host, value);
  }
  return value;
}
