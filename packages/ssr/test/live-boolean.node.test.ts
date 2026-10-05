import { describe, expect, it } from 'vitest';
import { html, liveBoolean } from '@gyral/core';
import { renderToString } from '../src/index.js';

const box = (on: boolean) => html`<input type="checkbox" ?checked=${liveBoolean(on)} />`;

describe('liveBoolean() on the server (ADR 0012)', () => {
  it('omits the attribute for false instead of writing checked="false"', async () => {
    const out = await renderToString(box(false));
    expect(out).not.toMatch(/checked/);
  });

  it('writes the bare boolean attribute for true', async () => {
    const out = await renderToString(box(true));
    expect(out).toMatch(/<input type="checkbox"\s+checked\s*\/?>/);
  });

  it('documents the property-binding bug it replaces', async () => {
    // Lit SSR serializes a false property binding as an attribute, which checks the box.
    // eslint-disable-next-line no-restricted-syntax
    const out = await renderToString(html`<input type="checkbox" .checked=${false} />`);
    expect(out).toContain('checked="false"');
  });
});
