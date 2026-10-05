// ORDER IS LOAD-BEARING: hydrate support before anything that imports `lit` (ADR 0012).
import '../src/hydrate.js';
import { lightHydrationSuite } from './support/light-suite.js';

lightHydrationSuite();
