// Lazy hydration islands (gyral-4k7.4): rendered by islands.node.test.ts, hydrated by
// islands-hydration.test.ts.
import { define, defineStore, html, type HydrateStrategy } from '@gyral/core';

interface State {
  readonly count: number;
  readonly hydrated: boolean;
}
type Msg = { readonly _tag: 'Inc' };

const island = (tag: string, hydrate: HydrateStrategy) =>
  define<State, Msg>(tag, {
    hydrate,
    init: () => ({ count: 0, hydrated: false }),
    intent: { Inc: () => ({ _tag: 'Inc' }) },
    update: {
      Inc: (s) => ({ ...s, count: s.count + 1 }),
      Hydrated: (s) => ({ ...s, hydrated: true }),
    },
    view: (s, i) => html`<button data-intent=${i.Inc}>${tag} ${s.count}</button>`,
  });

export const Eager = island('test-island-load', 'load');
export const Idle = island('test-island-idle', 'idle');
export const Visible = island('test-island-visible', 'visible');
export const Interaction = island('test-island-interaction', 'interaction');

/** A store an island reads after it hydrates late. */
export const counter = defineStore<{ readonly n: number }, { readonly _tag: 'Bump' }>(
  'island-counter',
  {
    init: () => ({ n: 0 }),
    update: { Bump: (s) => ({ n: s.n + 1 }) },
  },
);

export const StoreIsland = define<{ readonly seen: boolean }, never>('test-island-store', {
  hydrate: 'idle',
  stores: [counter],
  init: () => ({ seen: false }),
  intent: {},
  update: {},
  view: (_s, _i, { read }) => html`<output>${read(counter).n}</output>`,
});

/** An island whose shadow root holds a nested Gyral child: the child hydrates on its own. */
export const ParentIsland = define<{ readonly label: string }, never>('test-island-parent', {
  hydrate: 'interaction',
  init: () => ({ label: 'parent' }),
  intent: {},
  update: {},
  view: (s) =>
    html`<p>${s.label}</p>
      <test-island-load class="nested"></test-island-load>`,
});

/** A component (hydrated at load) whose shadow root holds an island: islands sit anywhere. */
export const IslandHost = define<{ readonly n: number }, never>('test-island-host', {
  init: () => ({ n: 1 }),
  intent: {},
  update: {},
  view: (s) =>
    html`<p>host ${s.n}</p>
      <test-island-interaction class="inner"></test-island-interaction>`,
});
