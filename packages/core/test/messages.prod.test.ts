// Production diagnostics (gyral-c5d.13): the code, the arguments and the docs URL, no table.
// Runs in the browser-prod project (core's production build).
import { describe, expect, it } from 'vitest';
import { DEV, message } from '../src/view/index.js';

describe.runIf(!DEV)('message() in production', () => {
  it('prints the code, the arguments and the docs URL', () => {
    expect(message(10, 'x-cart', 'Add')).toBe(
      'Gyral G0010 x-cart Add https://gyral.dev/errors/#G0010',
    );
    expect(message(61)).toBe('Gyral G0061 https://gyral.dev/errors/#G0061');
  });
});
