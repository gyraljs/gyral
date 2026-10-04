// ORDER IS LOAD-BEARING: hydrate support must load before anything that imports `lit`.
import '@gyral/ssr/hydrate';
import './app.js';
