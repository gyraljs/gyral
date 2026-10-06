// Lit-specific: delete at the view-layer swap (gyral-g1r.12, ADR 0018).
import { describe, expect, it } from 'vitest';
import { html, textareaMarkup } from '@gyral/core';
import { renderToString } from '../src/index.js';
import './support/textarea.js';

describe('textarea() on the server (gyral-czi.34)', () => {
  it('renders escaped content and attributes without SSR errors', async () => {
    const out = await renderToString(html`<test-note></test-note>`);
    expect(out).toContain(
      '<textarea id="msg" name="message" rows="3" required data-intent="Typed">' +
        'Hello &lt;/textarea&gt;&lt;b&gt;x&lt;/b&gt; &amp; "q"</textarea>',
    );
    expect(out).not.toContain('aria-invalid');
    // Golden file for textarea-hydration.test.ts (update with `pnpm test -u`).
    await expect(out).toMatchFileSnapshot('./fixtures/textarea.ssr.html');
  });

  it('escapes attribute values and rejects unsafe attribute names', () => {
    expect(textareaMarkup({ value: '', attrs: { placeholder: '"><script>' } })).toBe(
      '<textarea placeholder="&quot;&gt;&lt;script&gt;"></textarea>',
    );
    expect(() => textareaMarkup({ value: '', attrs: { 'on"x': 'y' } })).toThrow(/invalid/);
  });
});
