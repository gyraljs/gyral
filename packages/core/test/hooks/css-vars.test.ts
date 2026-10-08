// The `cssVars` element hook (src/hooks/css-vars.ts; view/02-bindings.md "Element hooks",
// gyral-dyn.19): named custom properties through the CSSOM, other inline styles kept, and
// allowed by a CSP whose `style-src` blocks inline style attributes.
import { afterEach, describe, expect, it } from 'vitest';
import { cssVars, type CssVars } from '../../src/hooks/css-vars.js';
import { html, render } from '../../src/view/index.js';

afterEach(() => {
  document.body.replaceChildren();
});

const view = (vars: CssVars) => html`<div ${cssVars(vars)}>x</div>`;

describe('cssVars() as an element hook', () => {
  it('sets, updates and removes only the named custom properties', () => {
    render(view({ '--x': 1, '--y': '2px' }), document.body);
    const div = document.querySelector('div') as HTMLDivElement;
    div.style.color = 'red'; // someone else's inline style
    expect(div.style.getPropertyValue('--x')).toBe('1');
    expect(div.style.getPropertyValue('--y')).toBe('2px');

    render(view({ '--x': 3 }), document.body);
    expect(div.style.getPropertyValue('--x')).toBe('3');
    expect(div.style.getPropertyValue('--y')).toBe('');

    render(view({ '--x': null, '--z': false }), document.body);
    expect(div.style.getPropertyValue('--x')).toBe('');
    expect(div.style.getPropertyValue('--z')).toBe('');
    expect(div.style.color).toBe('red');
  });

  it("writes through the CSSOM, which a style-src without 'unsafe-inline' allows", async () => {
    const iframe = document.createElement('iframe');
    iframe.srcdoc =
      `<!doctype html><meta http-equiv="Content-Security-Policy" content="style-src 'self'">` +
      `<main></main>`;
    const loaded = new Promise((resolve) => {
      iframe.addEventListener('load', resolve);
    });
    document.body.append(iframe);
    await loaded;
    const doc = iframe.contentDocument as Document;
    const violations: string[] = [];
    doc.addEventListener('securitypolicyviolation', (e) => {
      violations.push(e.violatedDirective);
    });
    const win = iframe.contentWindow as Window & typeof globalThis;
    const sheet = new win.CSSStyleSheet(); // constructed sheets aren't inline: allowed
    sheet.replaceSync('div { width: calc(var(--w, 0) * 1px); }');
    doc.adoptedStyleSheets = [sheet];
    const main = doc.querySelector('main') as HTMLElement;

    // The policy is in force: a style attribute is blocked.
    const probe = doc.createElement('p');
    probe.setAttribute('style', '--w: 9');
    main.append(probe);
    expect(probe.style.getPropertyValue('--w')).toBe('');

    render(view({ '--w': 40 }), main);
    const div = main.querySelector('div') as HTMLDivElement;
    expect(div.style.getPropertyValue('--w')).toBe('40');
    expect(win.getComputedStyle(div).width).toBe('40px');
    await new Promise((resolve) => setTimeout(resolve, 0)); // violation reports are queued
    expect(violations).toHaveLength(1); // the probe's attribute only
  });
});
