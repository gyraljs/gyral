// The reconciliation benchmark (view/03-lists.md "Reconciliation"): one keyed list of 1,000
// rows, reordered without changing any item (every row is skipped), so the time is matching,
// bookkeeping and DOM moves. Each candidate runs in its own test file (vi.mock swaps
// render/reorder.ts); results are checked against the expected order after each run.
import { expect } from 'vitest';
import { each, html, render } from '../src/view/index.js';
import { buildRows, median, shuffle, type Row } from './rows.js';

const row = (r: Row) =>
  html`<tr>
    <td>${r.id}</td>
    <td>${r.label}</td>
  </tr>`;
const view = (rows: readonly Row[]) =>
  html`<table>
    <tbody>
      ${each(rows, (r) => r.id, row)}
    </tbody>
  </table>`;

type Change = (rows: readonly Row[]) => Row[];

export const CHANGES: readonly (readonly [string, Change])[] = [
  [
    'swap rows 1 and 998',
    (rows) => {
      const out = [...rows];
      [out[1], out[998]] = [rows[998] as Row, rows[1] as Row];
      return out;
    },
  ],
  ['remove one (500)', (rows) => rows.filter((_, i) => i !== 500)],
  [
    'insert one in the middle',
    (rows) => [...rows.slice(0, 500), ...buildRows(1), ...rows.slice(500)],
  ],
  ['reverse', (rows) => [...rows].reverse()],
  ['shuffle', (rows) => shuffle(rows)],
  ['replace first and last', (rows) => [...buildRows(1), ...rows.slice(1, -1), ...buildRows(1)]],
  ['prepend 10', (rows) => [...buildRows(10), ...rows]],
  [
    'move one 10 → 900',
    (rows) => {
      const out = rows.filter((_, i) => i !== 10);
      out.splice(899, 0, rows[10] as Row);
      return out;
    },
  ],
];

const WARMUP = 5;
const RUNS = 61;

/** One sample: 1,000 fresh rows, then the timed render of `change`'s order. */
function sample(host: HTMLElement, change: Change): number {
  const rows = buildRows(1000);
  render(view([]), host);
  render(view(rows), host);
  const next = change(rows);
  const start = performance.now();
  render(view(next), host);
  const time = performance.now() - start;
  const ids = [...host.querySelectorAll('tr')].map((tr) => Number(tr.firstChild?.textContent));
  expect(ids).toEqual(next.map((r) => r.id));
  return time;
}

/**
 * Times every change for every candidate, interleaved round by round so drift and GC affect
 * all candidates alike. `use(k)` switches the reordering step to candidate `k`.
 */
export function runListBench(candidates: readonly string[], use: (k: number) => void): void {
  const host = document.createElement('div');
  document.body.append(host);
  const head = candidates.map((c) => c.padStart(12)).join('');
  const lines = [
    `moveBefore: ${String('moveBefore' in Element.prototype)}`,
    `${'change'.padEnd(26)}${head}`,
  ];
  for (const [name, change] of CHANGES) {
    const samples = candidates.map((): number[] => []);
    for (let k = 0; k < WARMUP + RUNS; k++) {
      candidates.forEach((_, c) => {
        use(c);
        const time = sample(host, change);
        if (k >= WARMUP) samples[c]?.push(time);
      });
    }
    lines.push(
      `${name.padEnd(26)}${samples.map((s) => `${median(s).toFixed(3)} ms`.padStart(12)).join('')}`,
    );
  }
  console.log(lines.join('\n'));
}
