// A host the server marked data-gyral-error (ADR 0024) starts fresh in the browser: its
// fallback content is replaced, init runs, and the marker goes. Runs in development and
// production builds (browser and browser-prod).
import { afterEach, describe, expect, it } from 'vitest';
import { define, html, settled } from '../src/index.js';

type Msg = { readonly _tag: 'X' };
define<number, Msg>()('err-hy-shadow', {
  intent: {},
  init: () => 5,
  update: { X: (s) => s },
  view: (s) => html`<p>fresh ${s}</p>`,
});
define<number, Msg>()('err-hy-light', {
  intent: {},
  init: () => 6,
  update: { X: (s) => s },
  view: (s) => html`<p>fresh ${s}</p>`,
  shadow: false,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('a host that failed on the server', () => {
  it('renders fresh in the browser, shadow and light DOM', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    root.setHTMLUnsafe(
      '<err-hy-shadow data-gyral-error><template shadowrootmode="open"><p role="alert">oops</p></template></err-hy-shadow>' +
        '<err-hy-light data-gyral-light data-gyral-error><p role="alert">oops</p></err-hy-light>',
    );
    await settled();
    const [shadow, light] = [...root.children];
    expect(shadow?.shadowRoot?.textContent).toBe('fresh 5');
    expect(light?.textContent).toBe('fresh 6');
    expect(shadow?.hasAttribute('data-gyral-error')).toBe(false);
    expect(light?.hasAttribute('data-gyral-error')).toBe(false);
  });
});
