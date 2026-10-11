// view/01-templates.md "Source locations" (gyral-g1r.24), production build of core: no
// locations are recorded and messages carry none, and the development transform's call-site
// rewrite, `(html.at?.(loc) ?? html)`, still renders (`html.at` doesn't exist there; the same
// for svg).
import { describe, expect, it } from 'vitest';
import { html, render, svg } from '../../src/view/index.js';
import { templateOf } from '../../src/view/template.js';
import { mount } from './render-helpers.js';

describe('source locations in production', () => {
  it('records none, and the rewritten call sites still render', () => {
    expect((html as typeof html & { at?: unknown }).at).toBeUndefined();
    const result = html`<p>${'ok'}</p>`;
    expect(templateOf(result).loc).toBeUndefined();
    const el = mount();
    render(result, el);
    expect(el.innerHTML).toBe('<p>ok</p>');
  });

  it('records none for svg templates either', () => {
    expect((svg as typeof svg & { at?: unknown }).at).toBeUndefined();
    const fragment = svg`<g>${'ok'}</g>`;
    expect(templateOf(fragment).loc).toBeUndefined();
    const el = mount();
    render(html`<svg>${fragment}</svg>`, el);
    expect(el.querySelector('g')?.textContent).toBe('ok');
  });
});
