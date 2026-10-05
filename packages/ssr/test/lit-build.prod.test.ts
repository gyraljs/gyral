// Proves the `browser-prod` project really runs Lit's production build (gyral-czi.38):
// Lit's development build records the warnings it issues, its production build has no
// such registry. Without this check the production project could silently test dev Lit.
import { LitElement } from 'lit';
import { expect, it } from 'vitest';

it('runs against the production build of Lit', () => {
  expect(LitElement).toBeDefined();
  expect((globalThis as { litIssuedWarnings?: unknown }).litIssuedWarnings).toBeUndefined();
});
