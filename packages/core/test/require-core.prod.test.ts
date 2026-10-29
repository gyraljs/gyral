// A Gyral package of another release in production (browser-prod project, ADR 0033): requireCore
// warns with its code instead of throwing, since an app that loaded already has users.
import { expect, it, vi } from 'vitest';
import { requireCore } from '../src/internal.js';
import { DEV } from '../src/view/index.js';
import { VERSION } from '../src/view/version.js';

it.runIf(!DEV)('warns G0016 with both versions', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    expect(() => {
      requireCore('@gyral/http', '0.0.1');
    }).not.toThrow();
    expect(warn.mock.calls).toEqual([
      [`Gyral G0016 @gyral/http 0.0.1 ${VERSION} https://gyral.dev/errors/#G0016`],
    ]);
  } finally {
    warn.mockRestore();
  }
});
