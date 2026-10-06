import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderToString } from '../src/index.js';
import './support/whitespace.js';

// Re-enable in Phase 4/5 (gyral-g1r.9 / gyral-g1r.10): needs the Gyral server renderer / hydration.
describe.skip('indented templates on the server (gyral-9rf)', () => {
  it('render minified, and write the golden file the hydration test uses', async () => {
    const out = await renderToString(
      html`<test-ws-table></test-ws-table><test-ws-light></test-ws-light>`,
    );
    expect(out).not.toMatch(/<tr>\s+</);
    expect(out).toContain('Hello <b>');
    expect(out).toContain('\n  keep   this\n');
    // Golden file for whitespace-hydration.test.ts (update with `pnpm test -u`).
    await expect(out).toMatchFileSnapshot('./fixtures/whitespace.ssr.html');
  });
});
