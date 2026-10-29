// Gyral's packages run only with the core of their own release (ADR 0033, gyral-337.5): each
// calls requireCore() when it loads. Development throws G0016; require-core.prod.test.ts covers
// production's warning.
import { afterEach, expect, it, vi } from 'vitest';
import { requireCore } from '../src/internal.js';
import { VERSION } from '../src/view/version.js';

afterEach(() => {
  vi.restoreAllMocks();
});

it('says nothing for a package of the same release', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  expect(() => {
    requireCore('@gyral/http', VERSION);
  }).not.toThrow();
  expect(warn).not.toHaveBeenCalled();
});

it('throws G0016, naming both versions, for a package of another release', () => {
  expect(() => {
    requireCore('@gyral/http', '0.0.1');
  }).toThrow(
    `@gyral/http 0.0.1 needs @gyral/core 0.0.1, but this app has @gyral/core ${VERSION}. ` +
      "Gyral's packages are released together: install the same version of every @gyral package.",
  );
});
