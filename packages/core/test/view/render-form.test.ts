// view/02-bindings.md "Live form state" in Chromium: on first creation the attribute (the
// default) and the live state are both set; later commits compare with the live state and
// write only on a difference, so the model wins whenever it renders, even after user edits.
import { afterEach, describe, expect, it } from 'vitest';
import { html, nothing } from '../../src/view/index.js';
import { draw, mount } from './render-helpers.js';

afterEach(() => {
  document.body.replaceChildren();
});

/** Types into a control the way a user does (value set, then `input` fired). */
function type(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('live form state (view/02 "Live form state")', () => {
  it('<input value>: attribute and value first, then the live value only', () => {
    const el = mount();
    const view = (v: unknown) => html`<form><input value=${v} /></form>`;
    draw(el, view('a'));
    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('value')).toBe('a');
    expect(input.value).toBe('a');
    draw(el, view('b'));
    expect(input.value).toBe('b');
    expect(input.getAttribute('value')).toBe('a'); // the default stays the first value
    type(input, 'typed');
    draw(el, view('b')); // the model renders again: it wins over the edit
    expect(input.value).toBe('b');
    draw(el, view(null));
    expect(input.value).toBe('');
    (el.querySelector('form') as HTMLFormElement).reset();
    expect(input.value).toBe('a');
  });

  it('<input value> on a fresh input with no value leaves the attribute out', () => {
    const el = mount();
    draw(el, html`<input value=${undefined} />`);
    expect(el.innerHTML).toBe('<input>');
  });

  it('a checkbox value is a submitted value: a plain attribute', () => {
    const el = mount();
    const view = (v: string) => html`<input type="checkbox" value=${v} />`;
    draw(el, view('x'));
    draw(el, view('y'));
    expect(el.querySelector('input')?.getAttribute('value')).toBe('y');
  });

  it('?checked: attribute and checked first, then the live checkedness only', () => {
    const el = mount();
    const view = (on: boolean) => html`<form><input type="checkbox" ?checked=${on} /></form>`;
    draw(el, view(true));
    const box = el.querySelector('input') as HTMLInputElement;
    expect(box.hasAttribute('checked')).toBe(true);
    expect(box.checked).toBe(true);
    draw(el, view(false));
    expect(box.checked).toBe(false);
    expect(box.hasAttribute('checked')).toBe(true);
    box.click(); // the user checks it; the model still says false
    expect(box.checked).toBe(true);
    draw(el, view(false));
    expect(box.checked).toBe(false);
    (el.querySelector('form') as HTMLFormElement).reset();
    expect(box.checked).toBe(true);
  });

  it('?checked on radios follows the model across the group', () => {
    const el = mount();
    const view = (v: string) =>
      html`<input type="radio" name="g" ?checked=${v === 'a'} /><input
          type="radio"
          name="g"
          ?checked=${v === 'b'}
        />`;
    draw(el, view('a'));
    const [a, b] = [...el.querySelectorAll('input')] as [HTMLInputElement, HTMLInputElement];
    b.click();
    draw(el, view('a'));
    expect([a.checked, b.checked]).toEqual([true, false]);
  });

  it('?indeterminate is the property only, never an attribute', () => {
    const el = mount();
    const view = (on: boolean) => html`<input type="checkbox" ?indeterminate=${on} />`;
    draw(el, view(true));
    const box = el.querySelector('input') as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    expect(box.hasAttribute('indeterminate')).toBe(false);
    box.indeterminate = false;
    draw(el, view(true));
    expect(box.indeterminate).toBe(true);
  });

  it('<textarea>${v}: text content first, then the live value only', () => {
    const el = mount();
    const view = (v: unknown) => html`<form><textarea>${v}</textarea></form>`;
    draw(el, view('first'));
    const area = el.querySelector('textarea') as HTMLTextAreaElement;
    expect(area.defaultValue).toBe('first');
    expect(area.value).toBe('first');
    draw(el, view('second'));
    expect(area.value).toBe('second');
    expect(area.defaultValue).toBe('first');
    type(area, 'typed');
    draw(el, view('second'));
    expect(area.value).toBe('second');
    draw(el, view(nothing));
    expect(area.value).toBe('');
    (el.querySelector('form') as HTMLFormElement).reset();
    expect(area.value).toBe('first');
  });

  it('<textarea> keeps a leading newline of the value', () => {
    const el = mount();
    draw(el, html`<textarea>${'\nx'}</textarea>`);
    expect(el.querySelector('textarea')?.value).toBe('\nx');
  });

  it('?selected: attribute and selectedness first, then live selectedness only', () => {
    const el = mount();
    const view = (v: string) =>
      html`<select>
        <option ?selected=${v === 'a'}>a</option>
        <option ?selected=${v === 'b'}>b</option>
      </select>`;
    draw(el, view('b'));
    const select = el.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('b');
    expect(select.options[1]?.hasAttribute('selected')).toBe(true);
    select.value = 'a'; // the user picks a; the model renders b again
    draw(el, view('b'));
    expect(select.value).toBe('b');
    draw(el, view('a'));
    expect(select.value).toBe('a');
  });

  it('?open on <details> and <dialog> is the attribute, compared with its live presence', () => {
    const el = mount();
    const view = (on: boolean) => html`<details ?open=${on}><summary>s</summary></details>`;
    draw(el, view(true));
    const details = el.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(true);
    details.open = false; // the user closes it
    draw(el, view(true));
    expect(details.open).toBe(true);
    draw(el, view(false));
    expect(details.hasAttribute('open')).toBe(false);
    draw(el, html`<dialog ?open=${true}>d</dialog>`);
    expect(el.querySelector('dialog')?.open).toBe(true);
  });

  it('<title>${v} is text content', () => {
    const el = mount();
    const view = (t: unknown) => html`<title>${t}</title>`;
    draw(el, view('one'));
    draw(el, view(2));
    expect(el.querySelector('title')?.textContent).toBe('2');
  });
});
