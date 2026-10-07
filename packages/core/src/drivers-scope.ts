// Tree-scoped driver overrides (gyral-czi.35, ADR 0006 addendum): which driver a command uses.
// Resolution: el.drivers → nearest driver provider (across shadow roots) → spec.drivers →
// the command's own driver. Mirrors <gyral-stores> (ADR 0013) for stores.
import type { AnyDriver, DriverOverrides } from './command.js';

/** Provider element name: `<gyral-drivers .drivers=${{ http: fake }}>…</gyral-drivers>`. */
export const DRIVERS_ELEMENT = 'gyral-drivers';

// Elements registered with provideDrivers() (any element can act as a provider).
const provided = new WeakMap<Element, DriverOverrides>();

/**
 * Makes `element` a driver provider for every Gyral component below it (including inside
 * shadow roots). Returns a function that removes the overrides. Use it on a test container
 * or an app root; a `<gyral-drivers>` element with a `.drivers` property works the same way.
 */
export function provideDrivers(element: Element, drivers: DriverOverrides): () => void {
  provided.set(element, drivers);
  return () => {
    if (provided.get(element) === drivers) provided.delete(element);
  };
}

function overridesOf(node: Element): DriverOverrides | undefined {
  const registered = provided.get(node);
  if (registered !== undefined) return registered;
  if (node.localName !== DRIVERS_ELEMENT) return undefined;
  return (node as Element & { drivers?: DriverOverrides }).drivers;
}

/**
 * The override for `name` from the nearest provider that has one. Providers nest: an inner
 * provider without that driver lets an outer one supply it. Commands never run on the server,
 * so only the browser calls this.
 */
export function providedDriver(host: Element, name: string): AnyDriver | undefined {
  for (let node: Node | null = host.parentNode; node !== null;) {
    if (node instanceof Element) {
      const driver = overridesOf(node)?.[name];
      if (driver !== undefined) return driver;
    }
    node = node instanceof ShadowRoot ? node.host : node.parentNode;
  }
  return undefined;
}
