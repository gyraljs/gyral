// js-framework-benchmark style data for the view benchmarks: rows of { id, label }.
export interface Row {
  readonly id: number;
  readonly label: string;
}

const A = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain'];
const C = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'white', 'black'];
const N = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich'];

let nextId = 1;
let seed = 1;
const random = (max: number): number => {
  seed = (seed * 16807) % 2147483647;
  return seed % max;
};

export function buildRows(count: number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    const label = `${A[random(A.length)] ?? ''} ${C[random(C.length)] ?? ''} ${N[random(N.length)] ?? ''}`;
    rows.push({ id: nextId++, label });
  }
  return rows;
}

/** Deterministic shuffle (Fisher–Yates with the seeded generator). */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function median(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? NaN;
}
