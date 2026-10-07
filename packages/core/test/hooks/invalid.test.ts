// The `invalid` element hook (src/hooks/invalid.ts; view/02-bindings.md "Element hooks",
// ADR 0008) rendered with the new view layer in Chromium.
import { afterEach, describe, expect, it } from 'vitest';
import { invalid } from '../../src/hooks/invalid.js';
import { hookSpec } from '../../src/view/render/hooks.js';
import { html, render } from '../../src/view/index.js';

afterEach(() => {
  document.body.replaceChildren();
});

type Errors = readonly string[] | string | undefined;

function mountForm(): { host: HTMLDivElement; draw: (errors: Errors) => HTMLInputElement } {
  const host = document.createElement('div');
  document.body.append(host);
  const draw = (errors: Errors) => {
    render(html`<form><input name="email" ${invalid(errors)} /></form>`, host);
    return host.querySelector('input') as HTMLInputElement;
  };
  return { host, draw };
}

describe('invalid() as an element hook', () => {
  it('mirrors errors to custom validity and aria-invalid, and clears them', () => {
    const { draw } = mountForm();
    let input = draw(['Required', 'Too short']);
    expect(input.validationMessage).toBe('Required Too short');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    input = draw([]);
    expect(input.validity.valid).toBe(true);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    input = draw('Bad');
    expect(input.validationMessage).toBe('Bad');
    input = draw(undefined);
    expect(input.validity.valid).toBe(true);
  });

  it('clears when the user edits the control, and applies again only for new errors', () => {
    const { draw } = mountForm();
    const errors = ['Required'];
    const input = draw(errors);
    input.value = 'x';
    input.dispatchEvent(new Event('input'));
    expect(input.validity.valid).toBe(true);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    draw(errors); // the same errors value: client doesn't run again
    expect(input.validity.valid).toBe(true);
    draw(['Required']); // a new value
    expect(input.validity.valid).toBe(false);
  });

  it('drops a stale error on submit and submits again once', async () => {
    const { host, draw } = mountForm();
    const input = draw(['Taken']);
    const form = host.querySelector('form') as HTMLFormElement;
    let submits = 0;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submits++;
    });
    input.value = 'changed from code';
    form.requestSubmit();
    await Promise.resolve();
    await Promise.resolve();
    expect(submits).toBe(1);
    expect(input.validity.valid).toBe(true);
  });

  it('has a server half that writes aria-invalid only with errors', () => {
    const spec = hookSpec(invalid(['x']));
    expect(spec?.server?.([['x']])).toEqual({ 'aria-invalid': 'true' });
    expect(spec?.server?.([[]])).toEqual({});
    expect(spec?.server?.([undefined])).toEqual({});
  });
});
