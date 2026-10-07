// The `labelledBy` element hook (src/hooks/labelled-by.ts; view/02-bindings.md "Element
// hooks", gyral-czi.26) rendered with the new view layer in Chromium.
import { afterEach, describe, expect, it } from 'vitest';
import { findInScope, labelledBy } from '../../src/hooks/labelled-by.js';
import { hookSpec } from '../../src/view/render/hooks.js';
import { html, render } from '../../src/view/index.js';

afterEach(() => {
  document.body.replaceChildren();
});

type Reflecting = Element & { ariaLabelledByElements?: readonly Element[] | null };

const supported = 'ariaLabelledByElements' in Element.prototype;

/** A form rendered into a shadow root of a host in the page. */
function shadowForm(id: string, fallback?: string): Reflecting {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  render(html`<form ${labelledBy(id, fallback)}><button>Go</button></form>`, root);
  return root.querySelector('form') as Reflecting;
}

describe('labelledBy() as an element hook', () => {
  it('names a shadow-root form after a heading in the page', () => {
    document.body.innerHTML = '<h1 id="page-title">Sign in</h1>';
    const form = shadowForm('page-title');
    if (supported) {
      expect(form.ariaLabelledByElements?.[0]).toBe(document.getElementById('page-title'));
    } else {
      expect(form.getAttribute('aria-label')).toBe('Sign in');
    }
  });

  it('resolves the id through nested shadow roots', () => {
    document.body.innerHTML = '<h1 id="page-title">Checkout</h1>';
    const outer = document.createElement('div');
    document.body.append(outer);
    const inner = document.createElement('div');
    outer.attachShadow({ mode: 'open' }).append(inner);
    const root = inner.attachShadow({ mode: 'open' });
    render(html`<form ${labelledBy('page-title')}></form>`, root);
    const form = root.querySelector('form') as Reflecting;
    const heading = document.getElementById('page-title');
    expect(findInScope(form, 'page-title')).toBe(heading);
    if (supported) expect(form.ariaLabelledByElements?.[0]).toBe(heading);
  });

  it('falls back to aria-label text when the target is missing', async () => {
    const form = shadowForm('nowhere', 'Account form');
    await Promise.resolve();
    expect(form.getAttribute('aria-label')).toBe('Account form');
  });

  it('tries again once when the target appears after the render', async () => {
    const form = shadowForm('late-title');
    document.body.insertAdjacentHTML('afterbegin', '<h2 id="late-title">Late</h2>');
    await Promise.resolve();
    if (supported) expect(form.ariaLabelledByElements?.[0]?.id).toBe('late-title');
    else expect(form.getAttribute('aria-label')).toBe('Late');
  });

  it('has no server half: the page renders a plain aria-label before scripts run', () => {
    expect('server' in (hookSpec(labelledBy('x', 'Name')) ?? {})).toBe(false);
  });
});
