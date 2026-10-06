import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderToString } from '../src/index.js';
import './support/invalid.js';

// Re-enable in Phase 4/5 (gyral-g1r.9 / gyral-g1r.10): needs the Gyral server renderer / hydration.
describe.skip('invalid() on the server', () => {
  it('renders nothing for the directive: native validity is applied after hydration', async () => {
    const out = await renderToString(html`<test-invalid-form></test-invalid-form>`);
    expect(out).toContain('name="email"');
    expect(out).not.toContain('aria-invalid');
    // Golden file for invalid-hydration.test.ts (update with `pnpm test -u`).
    await expect(out).toMatchFileSnapshot('./fixtures/invalid.ssr.html');
  });
});
