import './app.js';
// Route-level code splitting: the About page's component loads on demand, and the entry
// finishes once it is defined (top-level await, as gyral-shop's entry does). A lazy chunk can't
// import from an entry that awaits it, so the bundler moves shared code into a chunk evaluated
// BEFORE this entry's code. `pnpm smoke:prod` builds this to keep that case covered; hydration
// no longer depends on module order (view/07-hydration.md).
await import('./contact.js');
import '../../shared/devtools.js'; // ?devtools opens the panel (dev only)
