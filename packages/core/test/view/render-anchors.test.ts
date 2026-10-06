// view/02-bindings.md "The anchor rule" in Chromium: a child part inserts before the next
// static element or comment, at the end of its parent, or before the anchor the template has;
// root-level holes, rows and items take their position from the instance or list around them.
// Every case goes from empty to content and back, and must match a fresh render.
import { afterEach, describe, expect, it } from 'vitest';
import { each, html, nothing, type ChildValue } from '../../src/view/index.js';
import { draw, fresh, mount } from './render-helpers.js';

afterEach(() => {
  document.body.replaceChildren();
});

const values: readonly ChildValue[] = [
  nothing,
  'text',
  html`<b>t</b>`,
  html`${'x'}${'y'}`,
  [html`<i>1</i>`, 'two'],
  nothing,
  html`<b>again</b>`,
];

/** Cycles `view` through every value in one root, comparing each step with a fresh render. */
function cycle(view: (v: ChildValue) => ChildValue): void {
  const el = mount();
  for (const v of values) expect(draw(el, view(v))).toBe(fresh(view(v)));
}

describe('the anchor rule (view/02)', () => {
  it('inserts before the next static element', () => {
    cycle((v) => html`<p>${v}<b>static</b></p>`);
    expect(fresh(html`<p>${'a'}<b>s</b></p>`)).toBe('<p>a<b>s</b></p>');
  });

  it('inserts before the next static comment', () => {
    cycle((v) => html`<p>${v}<!-- note --></p>`);
  });

  it('inserts at the end of the parent for a last hole', () => {
    cycle((v) => html`<p><b>x</b> and ${v}</p>`);
  });

  it('inserts before its anchor when static text or another hole follows', () => {
    cycle((v) => html`<p>Hello ${v}!</p>`);
    cycle((v) => html`<p>${v}${v}</p>`);
    expect(fresh(html`<p>Hello ${'Bob'}!</p>`)).toBe('<p>Hello Bob<!---->!</p>');
  });

  it('needs no anchor for sole holes, attributes or rows', () => {
    const row = (r: { id: number }) =>
      html`<tr class=${'r'}>
        <td>${r.id}</td>
        <td><a>${'label'}</a></td>
      </tr>`;
    const out = fresh(
      html`<table>
        <tbody>
          ${each([{ id: 1 }, { id: 2 }], (r) => r.id, row)}
        </tbody>
      </table>`,
    );
    expect(out).not.toContain('<!--');
  });

  it('places root-level holes at the start, middle, end and as the whole template', () => {
    cycle((v) => html`<div>${html`${v}<i>end</i>`}</div>`);
    cycle((v) => html`<div>${html`<i>start</i>${v}`}</div>`);
    cycle((v) => html`<div>${html`<i>a</i>${v}<i>b</i>`}</div>`);
    cycle(
      (v) =>
        html`<div>
          ${html`${v}`}
          <hr />
        </div>`,
    );
    cycle((v) => html`<div>x ${html`${html`${v}`}`} y</div>`);
  });

  it('places a root-level hole between siblings rendered by the parent', () => {
    cycle((v) => html`<div><b>1</b>${html`<i>a</i>${v}`}<b>2</b>${html`${v}`}<b>3</b></div>`);
    cycle((v) => html`${html`${v}`}${v}`);
  });

  it('places rows whose template is a single hole, and empty rows', () => {
    const Row = (n: number) =>
      n % 2 === 0 ? html`${html`<b>${n}</b>`}` : n % 3 === 0 ? nothing : html`${n}`;
    const el = mount();
    const view = (ns: number[]) => html`<p>${each(ns, (n) => n, Row)}<i></i></p>`;
    for (const ns of [[1, 2, 3], [3, 1, 2, 4], [4], [], [6, 9, 2, 7], [2, 6, 7, 9]]) {
      expect(draw(el, view(ns))).toBe(fresh(view(ns)));
    }
  });
});
