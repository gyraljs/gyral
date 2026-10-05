// ORDER IS LOAD-BEARING: hydrate support must load before anything that imports `lit`.
import '@gyral/ssr/hydrate';
import './app.js';
// Route-level code splitting: the About page's component loads on demand, and the entry
// finishes once it is defined (top-level await, as gyral-shop's entry does). A lazy chunk can't
// import from an entry that awaits it, so the bundler moves Lit into a chunk shared by both and
// evaluates it BEFORE this entry's code — the order that broke production hydration before
// gyral-czi.41. `pnpm smoke:prod` builds this to keep that case covered.
await import('./contact.js');
import '../../shared/devtools.js'; // ?devtools opens the panel (dev only)
