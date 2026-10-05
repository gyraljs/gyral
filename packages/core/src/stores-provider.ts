// `<gyral-stores>` as a real element for server rendering (gyral-czi.20, ADR 0013 addendum).
// On the client a provider is a plain element (scopeFor walks the DOM). On the server it must
// be a registered element: components find it through Lit's SSR event path, and its instances'
// states are written to `data-gyral-stores` for the client to restore.
import { css, html, isServer, LitElement } from 'lit';
import { warnJsonHazard } from './json-safety.js';
import type { AnyStoreInstance } from './store.js';
import {
  providerScope,
  STORE_SEED_ATTRIBUTE,
  STORES_ELEMENT,
  STORES_REQUEST,
  type StoresRequest,
} from './store-scope.js';

const onServer: boolean = isServer;

/** Server-only element: renders `<slot>` in Declarative Shadow DOM, so children show as-is. */
class GyralStores extends LitElement {
  static override styles = css`
    :host {
      display: contents;
    }
  `;

  #instances: readonly AnyStoreInstance[] | undefined;

  /** This subtree's store instances; stores not listed start from their seed or `init`. */
  get instances(): readonly AnyStoreInstance[] | undefined {
    return this.#instances;
  }

  set instances(value: readonly AnyStoreInstance[] | undefined) {
    this.#instances = value;
    // Written before the attributes render; the client restores it (providerScope()).
    if (value !== undefined && value.length > 0) {
      const seed = Object.fromEntries(value.map((i) => [i.store.name, i.state]));
      for (const [name, state] of Object.entries(seed)) {
        warnJsonHazard(`store "${name}" in <${STORES_ELEMENT}>`, state, 'state');
      }
      this.setAttribute(STORE_SEED_ATTRIBUTE, JSON.stringify(seed));
    }
  }

  constructor() {
    super();
    // Lit's SSR routes a slotted child's events slot → getRootNode() → host, and the root is
    // only this element's shadow root if one exists; the renderer never calls connectedCallback
    // (which would create it), so attach it here.
    this.attachShadow({ mode: 'open' });
    this.addEventListener(STORES_REQUEST, (event) => {
      event.stopPropagation();
      (event as CustomEvent<StoresRequest>).detail.registry = providerScope(this);
    });
  }

  protected override render(): unknown {
    return html`<slot></slot>`;
  }
}

/**
 * Registers `<gyral-stores>` for server renders; `@gyral/ssr` calls it. A no-op in the browser,
 * where a plain `<gyral-stores>` element already scopes stores and the server's shadow root
 * (a `<slot>`) needs no JavaScript. Idempotent.
 */
export function defineStoresProvider(): void {
  if (onServer && customElements.get(STORES_ELEMENT) === undefined) {
    customElements.define(STORES_ELEMENT, GyralStores);
  }
}
