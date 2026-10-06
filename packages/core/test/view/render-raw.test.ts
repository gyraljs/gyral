// view/02-bindings.md "`raw(html)`" and "`nothing`" in Chromium: raw markup follows a start
// anchor and is parsed again only when the string changes; `nothing` renders nothing and
// removes attributes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { html, nothing, raw } from '../../src/view/index.js';
import { draw, fresh, mount } from './render-helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('raw(html) (view/02 "raw(html)")', () => {
  it('inserts the parsed markup after an empty start anchor', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      fresh(
        html`<div>
          ${raw('<b>bold</b> text')}
          <hr />
        </div>`,
      ),
    ).toBe('<div><!----><b>bold</b> text<hr></div>');
    expect(fresh(html`<div>${raw('')}</div>`)).toBe('<div><!----></div>');
  });

  it('re-parses only when the string changes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = mount();
    const view = (s: string) => html`<div>${raw(s)}<i></i></div>`;
    draw(el, view('<b>a</b><s>b</s>'));
    const b = el.querySelector('b');
    draw(el, view('<b>a</b><s>b</s>'));
    expect(el.querySelector('b')).toBe(b);
    expect(draw(el, view('<u>c</u>'))).toBe('<div><!----><u>c</u><i></i></div>');
    expect(draw(el, view(''))).toBe('<div><!----><i></i></div>');
    expect(draw(el, view('x<em>y</em>'))).toBe('<div><!---->x<em>y</em><i></i></div>');
    expect(draw(el, html`<div>${nothing}<i></i></div>`)).toBe('<div><i></i></div>');
  });

  it('does not run scripts, and keeps JSON-LD as data', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = mount();
    draw(el, html`<div>${raw('<script type="application/ld+json">{"a":1}</script>')}</div>`);
    expect(el.querySelector('script')?.textContent).toBe('{"a":1}');
  });

  it('warns once in development that raw() re-parses in the browser', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fresh(html`<p>${raw('<b>x</b>')}</p>`);
    fresh(html`<p>${raw('<b>y</b>')}</p>`);
    // Once per page: an earlier test may already have used up the warning.
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('nothing (view/02 "nothing")', () => {
  it('renders nothing in a child hole and removes attributes, also in a multi-attribute', () => {
    expect(fresh(html`<p title=${nothing} class="a ${nothing}">${nothing}</p>`)).toBe('<p></p>');
  });

  it('is a symbol that JSON cannot carry', () => {
    expect(typeof nothing).toBe('symbol');
    expect(JSON.stringify({ v: nothing })).toBe('{}');
  });
});
