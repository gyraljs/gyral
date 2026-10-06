import { describe } from 'vitest';
import { lightHydrationSuite } from './support/light-suite.js';

// Re-enable in Phase 4/5 (gyral-g1r.9 / gyral-g1r.10): needs the Gyral server renderer / hydration.
describe.skip('light-DOM hydration', () => {
  lightHydrationSuite();
});
