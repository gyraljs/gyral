// ORDER MATTERS: hydrate support must load before anything that imports `lit` or @gyral/core.
import '@gyral/ssr/hydrate';
import './home-page.js';
