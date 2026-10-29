// each(items, key, row, { pick, equals }) (gyral-337.1, view/03 "Row skipping"): `equals`
// replaces the one-level comparison of picked values, for a pick that builds what it returns.
// Production (browser-prod project): development's row check re-runs rows on purpose.
import { afterEach, expect, it } from 'vitest';
import { DEV, each, html, render } from '../src/view/index.js';

afterEach(() => {
  document.body.replaceChildren();
});

const rows = { count: 0 };
const Row = (n: number, picked: { readonly columns: readonly string[] }) => {
  rows.count += 1;
  return html`<li>${n} ${picked.columns.join(',')}</li>`;
};
const sameColumns = (a: { readonly columns: readonly string[] }, b: typeof a) =>
  a.columns.length === b.columns.length && a.columns.every((c, i) => c === b.columns[i]);

it.runIf(!DEV)(
  'skips rows whose picked value equals the last by `equals`, though rebuilt each render',
  () => {
    const root = document.createElement('div');
    document.body.append(root);
    const view = (columns: readonly string[], equals?: typeof sameColumns) =>
      html`<ul>
        ${each([1, 2, 3], (n) => n, Row, { pick: () => ({ columns: [...columns] }), ...(equals === undefined ? {} : { equals }) })}
      </ul>`;
    render(view(['a', 'b'], sameColumns), root);
    rows.count = 0;
    render(view(['a', 'b'], sameColumns), root); // a new array, the same columns
    expect(rows.count).toBe(0);
    render(view(['a', 'c'], sameColumns), root);
    expect(rows.count).toBe(3);
    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '1 a,c',
      '2 a,c',
      '3 a,c',
    ]);
    rows.count = 0;
    render(view(['a', 'c']), root); // without equals, the one-level comparison sees a new array
    expect(rows.count).toBe(3);
  },
);
