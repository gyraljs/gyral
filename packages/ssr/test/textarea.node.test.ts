import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderToString } from '../src/index.js';
import './support/textarea.js';

describe('<textarea> content on the server (gyral-czi.34)', () => {
  it('renders escaped content and attributes without SSR errors', async () => {
    const out = await renderToString(html`<test-note></test-note>`);
    expect(out).toContain(
      '<textarea id="msg" name="message" rows="3" required ' +
        'placeholder="Say &lt;hi&gt; &amp; &quot;bye&quot;" data-intent="Typed">\n' +
        'Hello &lt;/textarea&gt;&lt;b&gt;x&lt;/b&gt; &amp; "q"</textarea>',
    );
    expect(out).not.toContain('aria-invalid');
    // Golden file for textarea-hydration.test.ts (update with `pnpm test -u`).
    await expect(out).toMatchFileSnapshot('./fixtures/textarea.ssr.html');
  });
});
