import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderToString } from '../src/index.js';
import './support/invalid.js';

describe('invalid() on the server', () => {
  it("writes the hook's server half: aria-invalid once, native validity after hydration", async () => {
    const out = await renderToString(html`<test-invalid-form></test-invalid-form>`);
    expect(out).toContain(
      '<input id="email" name="email" value="taken@example.com" aria-invalid="true">',
    );
    expect(out.match(/aria-invalid/g)).toHaveLength(1);
    // Golden file for invalid-hydration.test.ts (update with `pnpm test -u`).
    await expect(out).toMatchFileSnapshot('./fixtures/invalid.ssr.html');
  });
});
