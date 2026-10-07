// view/01-templates.md "Source locations" (gyral-g1r.24), production build of core: no
// locations are recorded and messages carry none, and the development transform's call-site
// rewrite, `(html.at?.(loc) ?? html)`, still renders (`html.at` doesn't exist there).
import { describe, expect, it } from 'vitest';
import { html, render } from '../../src/view/index.js';
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
});
