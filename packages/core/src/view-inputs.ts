// What a host's view reads (gyral-337.1, view/04 "Marking", ADR 0018 addendum "Render
// skipping"): its state, each declared prop and the value of each declared store. With none of
// them changed since its last render that succeeded, a render would write nothing, so the host
// skips it; development re-runs the skipped view and warns when it differs (G0017, render.ts
// `recheckView`).
import type { AnyStore } from './store.js';
import type { StoreReader } from './types.js';

/** The values the view reads, in a fixed order. */
export function viewInputs(
  state: unknown,
  names: readonly string[],
  ctx: { readonly props: unknown; readonly read: StoreReader },
  stores: readonly AnyStore[] | undefined,
): readonly unknown[] {
  const props = ctx.props as Readonly<Record<string, unknown>>;
  return [state, ...names.map((name) => props[name]), ...(stores ?? []).map(ctx.read)];
}

/** Whether `next` equals `last` (`Object.is` each): nothing the view reads changed. */
export function sameInputs(
  next: readonly unknown[],
  last: readonly unknown[] | undefined,
): boolean {
  return last?.length === next.length && next.every((value, i) => Object.is(value, last[i]));
}
