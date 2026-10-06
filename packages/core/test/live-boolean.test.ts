// Lit-specific: delete at the view-layer swap (gyral-g1r.12, ADR 0018).
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'lit';
import { html, liveBoolean } from '../src/index.js';

afterEach(() => {
  document.body.replaceChildren();
});

function mount(on: boolean): { input: HTMLInputElement; rerender: (on: boolean) => void } {
  const host = document.createElement('div');
  document.body.append(host);
  const rerender = (value: boolean) => {
    render(html`<input type="checkbox" ?checked=${liveBoolean(value)} />`, host);
  };
  rerender(on);
  const input = host.querySelector('input');
  if (input === null) throw new Error('no input');
  return { input, rerender };
}

describe('liveBoolean() in the browser', () => {
  it('sets both the attribute and the live property', () => {
    const { input, rerender } = mount(true);
    expect(input.checked).toBe(true);
    expect(input.hasAttribute('checked')).toBe(true);
    rerender(false);
    expect(input.checked).toBe(false);
    expect(input.hasAttribute('checked')).toBe(false);
  });

  it('re-applies model state after the user changed the control', () => {
    const { input, rerender } = mount(true);
    input.click(); // the user unchecks it; the attribute no longer controls `checked`
    expect(input.checked).toBe(false);
    rerender(true); // the model still says true (e.g. Back restored an older state)
    expect(input.checked).toBe(true);
  });

  it('works for <option selected>', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const view = (pick: string) =>
      html`<select>
        ${['a', 'b'].map((v) => html`<option ?selected=${liveBoolean(v === pick)}>${v}</option>`)}
      </select>`;
    render(view('b'), host);
    const select = host.querySelector('select');
    expect(select?.value).toBe('b');
    if (select !== null) select.value = 'a';
    render(view('b'), host);
    expect(select?.value).toBe('b');
  });

  it('rejects use outside a boolean attribute', () => {
    const host = document.createElement('div');
    expect(() => {
      render(html`<input checked=${liveBoolean(true)} />`, host);
    }).toThrow(/boolean attribute/);
  });
});
