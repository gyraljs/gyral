// Development build of the devtools hook (ADR 0017). Resolved through the `#devtools` import
// with the `development` condition; production builds get devtools-off.ts instead, so the
// guarded call sites (`if (DEVTOOLS_ENABLED) …`) disappear from the bundle.
import {
  DEVTOOLS_GLOBAL,
  type CommandTrace,
  type DevComponentRef,
  type DevEvent,
  type DevtoolsHook,
} from './devtools-events.js';
import type { Tagged } from './types.js';

export const DEVTOOLS_ENABLED: boolean = true;

const hook = (): DevtoolsHook | undefined =>
  (globalThis as Record<string, unknown>)[DEVTOOLS_GLOBAL] as DevtoolsHook | undefined;

const ids = new WeakMap<Element, number>();
let nextId = 1;

function ref(element: Element, tag: string): DevComponentRef {
  let id = ids.get(element);
  if (id === undefined) {
    id = nextId++;
    ids.set(element, id);
  }
  return { tag, id, element };
}

// Builds nothing unless a listener is installed: zero cost in dev without devtools.
function emit(make: () => DevEvent): void {
  const listener = hook();
  if (listener === undefined) return;
  try {
    listener.emit(make());
  } catch (error) {
    console.error('gyral devtools listener threw', error);
  }
}

const now = (): number => performance.now();

export function devConnect(element: Element, tag: string, connected: boolean): void {
  emit(() => ({
    kind: connected ? 'connect' : 'disconnect',
    component: ref(element, tag),
    at: now(),
  }));
}

export function devUpdate(
  element: Element,
  tag: string,
  msg: Tagged,
  prev: unknown,
  next: unknown,
) {
  emit(() => ({ kind: 'update', component: ref(element, tag), msg, prev, next, at: now() }));
}

export function devHydrated(element: Element, tag: string, serverRendered: boolean): void {
  emit(() => ({ kind: 'hydrated', component: ref(element, tag), serverRendered, at: now() }));
}

export function devStore(store: string, msg: Tagged, prev: unknown, next: unknown): void {
  emit(() => ({ kind: 'store', store, msg, prev, next, at: now() }));
}

/** A command tracer for one owner (`<tag>#id` or `store:name`). */
export function devCommands(owner: () => string): CommandTrace {
  return (event) => {
    emit(() => ({ kind: 'command', owner: owner(), ...event, at: now() }));
  };
}

/** The label the panel shows for a component's commands. */
export function devOwner(element: Element, tag: string): string {
  return `<${tag}>#${String(ref(element, tag).id)}`;
}
