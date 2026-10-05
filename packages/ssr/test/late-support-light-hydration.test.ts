// ORDER IS DELIBERATELY WRONG (gyral-czi.41): Lit loads (through the suite's imports) BEFORE
// `@gyral/ssr/hydrate`, so Lit's hydrate support never patches LitElement. Gyral must still
// defer nested children and hydrate light and shadow views in place.
import { lightHydrationSuite } from './support/light-suite.js';
import '../src/hydrate.js';

lightHydrationSuite(' with Lit loaded before hydrate support');
