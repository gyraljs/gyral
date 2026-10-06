// Lit-specific: delete at the view-layer swap (gyral-g1r.12, ADR 0018).
// `@gyral/ssr/hydrate` registers Lit's public hydrate() where core looks for it
// (gyral-czi.38). Runs in both the development and production browser projects.
import '../src/hydrate.js';
import { hydrate } from '@lit-labs/ssr-client';
import { HYDRATE_KEY } from '@gyral/core';
import { expect, it } from 'vitest';

it("registers Lit's public hydrate() under core's key", () => {
  expect(HYDRATE_KEY).toBe(Symbol.for('gyral.hydrate'));
  expect((globalThis as Record<symbol, unknown>)[HYDRATE_KEY]).toBe(hydrate);
});
