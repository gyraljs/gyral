// ORDER IS LOAD-BEARING: hydrate support must load before anything that imports `lit`.
import '@gyral/ssr/hydrate';
import './register.js';
import '../../shared/devtools.js'; // ?devtools opens the panel (dev only)
