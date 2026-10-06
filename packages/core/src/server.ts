// `@gyral/core/server` (docs/design-docs/view/06-server.md): renders template results and Gyral
// components to HTML without a DOM. Server-only: never import it from client code. Every
// render first registers the specs define() recorded outside the browser, and the
// `<gyral-stores>` provider.
import { registerRecordedSpecs } from './server-component.js';
import { storesProvider } from './stores-provider.js';
import { DEV, registerServerProvider, type ChildValue } from './view/index.js';
import {
  componentStyles as styles,
  render as renderChunks,
  renderToString as renderString,
  styleHash,
  styleHashes as hashes,
  styleHashSync,
  type ServerRenderOptions,
} from './view/server/index.js';

export type { ServerRenderOptions };
export { styleHash, styleHashSync };

/**
 * Whether `@gyral/core` resolved with the `development` condition (Vite's dev server and its
 * SSR, Vitest): the default of `render`'s `dev` option (view/06-server.md "Development markers").
 */
export const development: boolean = DEV;
export { StoreRegistry, withStoreScope } from './store-scope.js';

function prepare(): void {
  registerServerProvider(storesProvider);
  registerRecordedSpecs();
}

/**
 * Renders `value` to HTML chunks, synchronously and lazily: each step of the iterator writes up
 * to the next component boundary, running that component's `init` and view. Wrap each step in
 * `withStoreScope(registry, …)` to give components the request's stores (ADR 0013).
 */
export function render(value: ChildValue, options?: ServerRenderOptions): Iterable<string> {
  prepare();
  return renderChunks(value, options);
}

/** Renders `value` to one HTML string. */
export function renderToString(value: ChildValue, options?: ServerRenderOptions): string {
  prepare();
  return renderString(value, options);
}

/**
 * `'sha256-…'` hashes of every registered shadow component's declarative-shadow-root `<style>`,
 * for a `Content-Security-Policy` `style-src` (view/08-styles.md "Server").
 */
export function styleHashes(): Promise<readonly string[]> {
  prepare();
  return hashes();
}

/**
 * Tag → declarative-shadow-root `<style>` text of every registered shadow component with CSS
 * (recorded specs registered first), for checking or building a CSP at render time.
 */
export function componentStyles(): ReadonlyMap<string, string> {
  prepare();
  return styles();
}
