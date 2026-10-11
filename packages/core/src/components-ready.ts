// `componentsReady()` (ADR 0016 "Automatic components"): wait until the components the page
// renders are defined and have rendered. The loader that gyralVitePreset({ components: true })
// generates registers itself under a well-known symbol; without it (no automatic components,
// or a server render) this is just `settled()`.
import { settled } from './settled.js';

interface ComponentLoader {
  readonly ready: () => Promise<void>;
}

const KEY = Symbol.for('gyral.components');

/**
 * Resolves once every rendered tag the component loader knows (in the document and in the
 * shadow roots of components it defined) is defined, and the page has settled. Await it in
 * browser tests and page scripts after the loader has run (page scripts placed after it; in
 * tests, import `virtual:gyral/components` first).
 */
export async function componentsReady(): Promise<void> {
  const loader = (globalThis as { [KEY]?: ComponentLoader })[KEY];
  if (loader !== undefined) await loader.ready();
  await settled();
}
