// Gyral's renderer on the js-framework-benchmark row template: `pnpm bench:view`. Times the
// synchronous render call (DOM work included; layout and paint excluded), median of several
// runs after warm-up. Not part of `pnpm check`. Compare runs of this file before and after a
// renderer change; comparisons with other frameworks live in the gyral-benchmarks repository
// (the last in-repo comparison, against lit-html 3.3.0, is recorded in view/03-lists.md).
import { it } from 'vitest';
import { each, html, render } from '../src/view/index.js';
import { buildRows, median, type Row } from './rows.js';

interface Lib {
  readonly name: string;
  draw(rows: readonly Row[], selected: number): void;
}

function gyral(host: HTMLElement): Lib {
  const row = (r: Row, selected: boolean) =>
    html`<tr class=${selected ? 'danger' : ''}>
      <td class="col-md-1">${r.id}</td>
      <td class="col-md-4"><a data-intent="select">${r.label}</a></td>
      <td class="col-md-1">
        <a data-intent="remove"
          ><span class="glyphicon glyphicon-remove" aria-hidden="true"></span
        ></a>
      </td>
      <td class="col-md-6"></td>
    </tr>`;
  const app = (rows: readonly Row[], selected: number) =>
    html`<table class="table table-hover table-striped test-data">
      <tbody>
        ${each(
          rows,
          (r) => r.id,
          row,
          (r) => r.id === selected,
        )}
      </tbody>
    </table>`;
  return {
    name: 'gyral',
    draw: (rows, selected) => {
      render(app(rows, selected), host);
    },
  };
}

interface Op {
  readonly name: string;
  /** Prepares the DOM and returns the timed step. */
  setup(lib: Lib): () => void;
}

const thousand = (lib: Lib): Row[] => {
  const rows = buildRows(1000);
  lib.draw(rows, 0);
  return rows;
};

const OPS: readonly Op[] = [
  {
    name: 'create 1k rows',
    setup: (lib) => {
      lib.draw([], 0);
      const rows = buildRows(1000);
      return () => {
        lib.draw(rows, 0);
      };
    },
  },
  {
    name: 'replace 1k rows',
    setup: (lib) => {
      thousand(lib);
      const rows = buildRows(1000);
      return () => {
        lib.draw(rows, 0);
      };
    },
  },
  {
    name: 'update every 10th row',
    setup: (lib) => {
      const rows = thousand(lib).map((r, i) =>
        i % 10 === 0 ? { ...r, label: `${r.label} !!!` } : r,
      );
      return () => {
        lib.draw(rows, 0);
      };
    },
  },
  {
    name: 'swap rows (1, 998)',
    setup: (lib) => {
      const rows = thousand(lib);
      const swapped = [...rows];
      [swapped[1], swapped[998]] = [rows[998] as Row, rows[1] as Row];
      return () => {
        lib.draw(swapped, 0);
      };
    },
  },
  {
    name: 'select row',
    setup: (lib) => {
      const rows = thousand(lib);
      const id = (rows[5] as Row).id;
      return () => {
        lib.draw(rows, id);
      };
    },
  },
  {
    name: 'remove row',
    setup: (lib) => {
      const rows = thousand(lib).filter((_, i) => i !== 500);
      return () => {
        lib.draw(rows, 0);
      };
    },
  },
  {
    name: 'append 1k rows',
    setup: (lib) => {
      const rows = [...thousand(lib), ...buildRows(1000)];
      return () => {
        lib.draw(rows, 0);
      };
    },
  },
  {
    name: 'clear 1k rows',
    setup: (lib) => {
      thousand(lib);
      return () => {
        lib.draw([], 0);
      };
    },
  },
];

const WARMUP = 5;
const RUNS = 25;

function measure(lib: Lib, op: Op): number {
  const samples: number[] = [];
  for (let k = 0; k < WARMUP + RUNS; k++) {
    const run = op.setup(lib);
    const start = performance.now();
    run();
    const time = performance.now() - start;
    if (k >= WARMUP) samples.push(time);
  }
  return median(samples);
}

it('renders the benchmark rows', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const lib = gyral(host);
  const lines = [`${'operation'.padEnd(24)}${'gyral ms'.padStart(10)}`];
  for (const op of OPS) {
    lines.push(`${op.name.padEnd(24)}${measure(lib, op).toFixed(2).padStart(10)}`);
  }
  console.log(`crossOriginIsolated: ${String(crossOriginIsolated)}\n${lines.join('\n')}`);
});
