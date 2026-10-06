import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderToString } from '../src/index.js';
import { echoCalls } from './support/nested.js';

// Re-enable in Phase 4/5 (gyral-g1r.9 / gyral-g1r.10): needs the Gyral server renderer / hydration.
describe.skip('a Gyral child inside a server-rendered shadow root', () => {
  it('renders both with seeds, defers the child, runs no commands', async () => {
    const out = await renderToString(html`<test-nest-parent></test-nest-parent>`);
    expect(out).toMatch(/<test-nest-child[^>]*defer-hydration/);
    expect(out.match(/data-gyral-seed/g)).toHaveLength(2);
    expect(echoCalls).toEqual([]);
    // Golden file for nested-hydration.test.ts (update with `pnpm test -u`).
    await expect(out).toMatchFileSnapshot('./fixtures/nested.ssr.html');
  });
});
