// The reconciliation benchmark (view/03-lists.md "Reconciliation"): the shipped hybrid against
// candidates (a) key map + LIS and (b) a two-ended scan that moves as it matches, with a key
// map; the last column is (c) moving with insertBefore instead of moveBefore. vi.mock routes
// render/reorder.ts through a switch so all of them run interleaved.
import { it, vi } from 'vitest';
import type { reorder as Reorder } from '../src/view/render/reorder.js';
import { runListBench } from './lists.js';

const state = vi.hoisted(() => ({ impls: [] as (typeof Reorder)[], current: 0, noMove: false }));

// Lets the last column measure the shipped plan with insertBefore instead of moveBefore.
vi.mock('../src/view/render/nodes.js', async (original) => {
  const nodes = await original<typeof import('../src/view/render/nodes.js')>();
  return { ...nodes, canMove: (parent: Node) => !state.noMove && nodes.canMove(parent) };
});

vi.mock('../src/view/render/reorder.js', () => ({
  reorder: (...args: Parameters<typeof Reorder>) => {
    (state.impls[state.current] as typeof Reorder)(...args);
  },
}));

it('reconciles 1,000 rows', async () => {
  const shipped = await vi.importActual<{ reorder: typeof Reorder }>(
    '../src/view/render/reorder.js',
  );
  state.impls = [
    (await import('./reorder-lis.js')).reorder,
    (await import('./reorder-two-ended.js')).reorder,
    shipped.reorder,
  ];
  runListBench(['(a) LIS', '(b) 2-ended', '(c) hybrid', '(c) insert'], (k) => {
    state.current = Math.min(k, 2);
    state.noMove = k === 3;
  });
});
