// view/03-lists.md "Rows must be pure" in Chromium: the development check re-evaluates skipped
// rows (at most 200 per render call, rotating) and warns once per row function.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { each, html, render } from '../../src/view/index.js';
import { mount } from './render-helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

interface Item {
  readonly id: number;
  readonly label: string;
}

const items = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `L${String(i + 1)}` }));

describe('the development check (view/03 "Rows must be pure")', () => {
  it('warns once per row function when a skipped row would render differently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let suffix = '';
    // eslint-disable-next-line gyral/each-row-purity -- an impure row on purpose: the dev check must catch it
    const Impure = (r: Item) => html`<li>${r.label}${suffix}</li>`;
    const view = (l: readonly Item[]) =>
      html`<ul>
        ${each(l, (r) => r.id, Impure)}
      </ul>`;
    const el = mount();
    const list = items(3);
    render(view(list), el);
    expect(warn).not.toHaveBeenCalled();
    suffix = '!';
    render(view(list), el);
    render(view(list), el);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('Impure depends on something not passed');
  });

  it('checks at most 200 rows per render call, rotating through the list', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const list = items(500);
    let stale = false;
    // eslint-disable-next-line gyral/each-row-purity -- an impure row on purpose: the dev check must catch it
    const Late = (r: Item) => html`<li>${r.id === 450 && stale ? 'stale' : r.label}</li>`;
    const view = html`<ul>
      ${each(list, (r) => r.id, Late)}
    </ul>`;
    const el = mount();
    render(view, el); // checks rows 0–199
    stale = true;
    render(
      html`<ul>
        ${each(list, (r) => r.id, Late)}
      </ul>`,
      el,
    ); // rows 200–399
    expect(warn).not.toHaveBeenCalled();
    render(
      html`<ul>
        ${each(list, (r) => r.id, Late)}
      </ul>`,
      el,
    ); // rows 400–499, 0–99
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('shares the 200 rows between all lists in one render call', () => {
    let renders = 0;
    const Row = (n: number) => {
      // eslint-disable-next-line gyral/each-row-purity -- counts row renders on purpose
      renders++;
      return html`<i>${n}</i>`;
    };
    const nums = Array.from({ length: 150 }, (_, i) => i);
    const view = html`<p>${each(nums, (n) => n, Row)}</p>
      <p>${each(nums, (n) => n, Row)}</p>`;
    const el = mount();
    render(view, el);
    renders = 0;
    render(
      html`<p>${each(nums, (n) => n, Row)}</p>
        <p>${each(nums, (n) => n, Row)}</p>`,
      el,
    );
    expect(renders).toBe(200);
  });
});
