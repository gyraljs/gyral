import { describe } from 'vitest';
import { lightHydrationSuite } from './support/light-suite.js';

describe('light-DOM hydration', () => {
  lightHydrationSuite();
});
