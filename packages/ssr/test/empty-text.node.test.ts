import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderToString } from '../src/index.js';
import './support/empty-text.js';

// Re-enable in Phase 4/5 (gyral-g1r.9 / gyral-g1r.10): needs the Gyral server renderer / hydration.
describe.skip("text bindings that render '' on the server", () => {
  it('writes the golden file the hydration test uses', async () => {
    const out = await renderToString(
      html`<test-empty-text></test-empty-text><test-empty-light></test-empty-light>`,
    );
    // Golden file for empty-text-hydration.test.ts (update with `pnpm test -u`).
    await expect(out).toMatchFileSnapshot('./fixtures/empty-text.ssr.html');
  });
});
