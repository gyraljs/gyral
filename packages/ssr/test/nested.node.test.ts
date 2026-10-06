import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderToString } from '../src/index.js';
import { echoCalls } from './support/nested.js';

describe('a Gyral child inside a server-rendered shadow root', () => {
  it('renders both with seeds, does not defer the child, runs no commands', async () => {
    const out = await renderToString(html`<test-nest-parent></test-nest-parent>`);
    // Each component hydrates on its own (view/07-hydration.md): no defer-hydration for nesting.
    expect(out).toMatch(/<test-nest-child data-intent="Child" data-gyral-seed='/);
    expect(out).not.toContain('defer-hydration');
    expect(out.match(/data-gyral-seed/g)).toHaveLength(2);
    expect(echoCalls).toEqual([]);
    // Golden file for nested-hydration.test.ts (update with `pnpm test -u`).
    await expect(out).toMatchFileSnapshot('./fixtures/nested.ssr.html');
  });
});
