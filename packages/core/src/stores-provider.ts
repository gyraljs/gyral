// `<gyral-stores>` on the server (ADR 0013, view/06-server.md "Components"). In the browser a
// provider is a plain element: scopeFor() walks the DOM to it. On the server it is written as a
// plain element too, and the renderer gives its subtree the provider's registry (components'
// `ctx.read` resolves there) and writes its `data-gyral-stores` seed: the states of the
// instances passed in `.instances`. Stores not listed start from `init` on both sides.
import { warnJsonHazard } from './json-safety.js';
import { STORE_SEED_ATTRIBUTE, STORES_ELEMENT, StoreRegistry } from './store-scope.js';
import type { AnyStoreInstance } from './store.js';
import { DEV, type ServerProvider } from './view/index.js';

export const storesProvider: ServerProvider = {
  tag: STORES_ELEMENT,
  open({ properties }) {
    const listed = properties['instances'];
    const instances = Array.isArray(listed) ? (listed as readonly AnyStoreInstance[]) : [];
    const registry = new StoreRegistry(instances);
    if (instances.length === 0) return { scope: registry, attributes: {} };
    const snapshot = registry.snapshot();
    if (DEV) warnJsonHazard(`<${STORES_ELEMENT}>`, snapshot, 'seed');
    return { scope: registry, attributes: { [STORE_SEED_ATTRIBUTE]: JSON.stringify(snapshot) } };
  },
};
