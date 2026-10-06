import { describe } from 'vitest';
import { lightHydrationSuite } from './support/light-suite.js';

// Re-enable in Phase 5 (gyral-g1r.10): needs hydration. Its server markup (the fixture) comes from Phase 4.
describe.skip('light-DOM hydration', () => {
  lightHydrationSuite();
});
