// Which store instance a component uses (docs/design-docs/0013-shared-state.md):
// el.stores override → nearest <gyral-stores> ancestor → the document default (client), or the
// request scope set by @gyral/ssr around each render step (server).
import { isServer } from 'lit';
import type { AnyStore, AnyStoreInstance } from './store.js';

const onServer: boolean = isServer;

/** Page-level seed written by @gyral/ssr: `<script type="application/json" data-gyral-stores>`. */
export const STORE_SEED_ATTRIBUTE = 'data-gyral-stores';

/** Provider element name. Set `.instances=${[cart.instance()]}`, or let it create its own. */
export const STORES_ELEMENT = 'gyral-stores';

/** A set of store instances by store name, created on demand from optional seeds. */
export class StoreRegistry {
  readonly #instances = new Map<string, AnyStoreInstance>();
  readonly #seeds: Readonly<Record<string, unknown>>;

  constructor(
    instances: readonly AnyStoreInstance[] = [],
    seeds: Readonly<Record<string, unknown>> = {},
  ) {
    for (const instance of instances) this.#instances.set(instance.store.name, instance);
    this.#seeds = seeds;
  }

  /** The instance for `store`, creating it (from its seed, if any) on first use. */
  get(store: AnyStore): AnyStoreInstance {
    let instance = this.#instances.get(store.name);
    if (instance === undefined) {
      const seed = this.#seeds[store.name];
      // Sound: a seed is this store's own state, serialized by serializeStores().
      instance = seed === undefined ? store.instance() : store.instance(seed as never);
      this.#instances.set(store.name, instance);
    }
    return instance;
  }

  /** Every instance's state by store name (what the SSR seed carries). */
  snapshot(): Readonly<Record<string, unknown>> {
    return Object.fromEntries([...this.#instances].map(([name, i]) => [name, i.state]));
  }

  /** Disposes every instance (stops their commands). */
  dispose(): void {
    for (const instance of this.#instances.values()) instance.dispose();
    this.#instances.clear();
  }
}

let serverScope: StoreRegistry | undefined;

/**
 * Runs `fn` with `registry` as the server's store scope. Server renders are synchronous per
 * render step, so @gyral/ssr wraps every step: interleaved requests never see each other's
 * stores, without AsyncLocalStorage (works on any runtime).
 */
export function withStoreScope<T>(registry: StoreRegistry, fn: () => T): T {
  const previous = serverScope;
  serverScope = registry;
  try {
    return fn();
  } finally {
    serverScope = previous;
  }
}

/** JSON for an inline `<script type="application/json">`: `</script>` and friends escaped. */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
}

let documentRegistry: StoreRegistry | undefined;

function readSeeds(): Readonly<Record<string, unknown>> {
  const script = document.querySelector(`script[${STORE_SEED_ATTRIBUTE}]`);
  if (script === null) return {};
  try {
    const parsed = JSON.parse(script.textContent) as unknown;
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch (error) {
    console.error(`unreadable ${STORE_SEED_ATTRIBUTE} seed`, error);
    return {};
  }
}

/** The client's default scope, restored from the server's page seed on first use. */
function documentScope(): StoreRegistry {
  documentRegistry ??= new StoreRegistry([], readSeeds());
  return documentRegistry;
}

const providers = new WeakMap<Element, StoreRegistry>();

function providerScope(el: Element): StoreRegistry {
  let registry = providers.get(el);
  if (registry === undefined) {
    const { instances } = el as { instances?: readonly AnyStoreInstance[] };
    registry = new StoreRegistry(instances ?? []);
    providers.set(el, registry);
  }
  return registry;
}

/** The scope for a component: its nearest provider (across shadow roots) or the default. */
export function scopeFor(host: Element, tag: string, store: AnyStore): StoreRegistry {
  if (onServer) {
    if (serverScope !== undefined) return serverScope;
    throw new Error(
      `<${tag}> reads store "${store.name}" during a server render without a store scope. ` +
        "Pass the request's store instances to page({ stores }) or renderToString(value, { stores }).",
    );
  }
  for (let node: Node | null = host.parentNode; node !== null;) {
    if (node instanceof Element && node.localName === STORES_ELEMENT) return providerScope(node);
    node = node instanceof ShadowRoot ? node.host : node.parentNode;
  }
  return documentScope();
}

/** Tests only: forget the document default so each test starts clean. */
export function resetDocumentStores(): void {
  documentRegistry?.dispose();
  documentRegistry = undefined;
}
