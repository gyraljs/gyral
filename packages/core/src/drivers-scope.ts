// Tree-scoped driver overrides (gyral-czi.35, ADR 0006 addendum): which driver a command uses.
// Resolution: el.drivers → nearest driver provider (across shadow roots) → the command's own
// driver; a driver token (defineDriver('name')) has no own implementation. Mirrors <gyral-stores> (ADR 0013) for stores.
import type { AnyDriver, DriverList, DriverOverrides } from './command.js';
import { DEV, message } from './view/index.js';

/** Provider element name: `<gyral-drivers .drivers=${{ http: fake }}>…</gyral-drivers>`. */
export const DRIVERS_ELEMENT = 'gyral-drivers';

/** Drivers as `provideDrivers`, `el.drivers`, `<gyral-drivers>` and stores take them. */
type Supplied = DriverOverrides | DriverList;

// Elements registered with provideDrivers() (any element can act as a provider).
const provided = new WeakMap<Element, Supplied>();

const isList = (drivers: Supplied): drivers is DriverList => Array.isArray(drivers);

/** Development: lists and records already checked (G0044, G0045). */
const checked = new WeakSet<Supplied>();

function check(drivers: Supplied): void {
  checked.add(drivers);
  if (isList(drivers)) {
    const names = new Set<string>();
    for (const { name } of drivers) {
      if (names.has(name)) throw new Error(message(44, name));
      names.add(name);
    }
  } else {
    for (const [key, driver] of Object.entries(drivers)) {
      if (driver.name !== key) console.warn(message(45, key, driver.name));
    }
  }
}

/** The driver named `name` in `drivers`: a list (each driver's own name) or a record (by key). */
export function driverNamed(drivers: Supplied | undefined, name: string): AnyDriver | undefined {
  if (drivers === undefined) return undefined;
  if (DEV && !checked.has(drivers)) check(drivers);
  return isList(drivers) ? drivers.find((driver) => driver.name === name) : drivers[name];
}

/**
 * Makes `element` a driver provider for every Gyral component below it (including inside
 * shadow roots). Returns a function that removes the overrides. Use it on a test container
 * or an app root; a `<gyral-drivers>` element with a `.drivers` property works the same way.
 */
export function provideDrivers(
  element: Element,
  drivers: DriverOverrides | DriverList,
): () => void {
  if (DEV) check(drivers);
  provided.set(element, drivers);
  return () => {
    if (provided.get(element) === drivers) provided.delete(element);
  };
}

function overridesOf(node: Element): Supplied | undefined {
  const registered = provided.get(node);
  if (registered !== undefined) return registered;
  if (node.localName !== DRIVERS_ELEMENT) return undefined;
  return (node as Element & { drivers?: Supplied }).drivers;
}

/**
 * The override for `name` from the nearest provider that has one. Providers nest: an inner
 * provider without that driver lets an outer one supply it. Commands never run on the server,
 * so only the browser calls this.
 */
export function providedDriver(host: Element, name: string): AnyDriver | undefined {
  for (let node: Node | null = host.parentNode; node !== null;) {
    if (node instanceof Element) {
      const driver = driverNamed(overridesOf(node), name);
      if (driver !== undefined) return driver;
    }
    node = node instanceof ShadowRoot ? node.host : node.parentNode;
  }
  return undefined;
}
