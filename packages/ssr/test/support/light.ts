// Components for the light-DOM SSR tests (ADR 0014): rendered on the server
// (light.node.test.ts), then hydrated in the browser (light-hydration.test.ts).
import { child, define, emit, html } from '@gyral/core';

type Bump = { readonly _tag: 'Bumped'; readonly by: string };
type ItemMsg = { readonly _tag: 'Inc' };
interface ItemState {
  readonly count: number;
}

const item = (tag: string, shadow: boolean) =>
  define<ItemState, ItemMsg, object, Bump>(tag, {
    shadow,
    init: () => ({ count: 0 }),
    intent: { Inc: () => ({ _tag: 'Inc' }) },
    update: { Inc: (s) => [{ count: s.count + 1 }, [emit({ _tag: 'Bumped', by: tag })]] },
    view: (s) => html`<button class="inc" data-intent="Inc">${tag} ${s.count}</button>`,
  });

/** A light-DOM child and a shadow child, nested in the light page below. */
export const LightItem = item('test-light-item', false);
export const ShadowItem = item('test-shadow-item', true);

interface PageState {
  readonly more: number;
  readonly bumps: readonly string[];
  readonly hydrated: boolean;
}
type PageMsg =
  | { readonly _tag: 'More' }
  | { readonly _tag: 'Bumped'; readonly by: string }
  | { readonly _tag: 'Noop' };

/** A page-level light-DOM component: its heading and content are plain children. */
export const LightPage = define<PageState, PageMsg>('test-light-page', {
  shadow: false,
  init: () => ({ more: 0, bumps: [], hydrated: false }),
  states: (s) => ({ live: s.hydrated }),
  intent: {
    More: () => ({ _tag: 'More' }),
    // Outputs from either child kind (child() would accept only one class).
    Bumped: ({ detail }) => {
      const by = (detail as Partial<Bump> | undefined)?.by;
      return typeof by === 'string' ? { _tag: 'Bumped', by } : undefined;
    },
    Noop: () => ({ _tag: 'Noop' }),
  },
  update: {
    More: (s) => ({ ...s, more: s.more + 1 }),
    Bumped: (s, m) => ({ ...s, bumps: [...s.bumps, m.by] }),
    Noop: (s) => s,
    Hydrated: (s) => ({ ...s, hydrated: true }),
  },
  view: (s, i) =>
    html`<h1 class="light-title">Light page</h1>
      <button class="more" data-intent=${i.More}>more ${s.more}</button>
      <test-light-item data-intent=${i.Bumped}></test-light-item>
      <test-shadow-item data-intent=${i.Bumped}></test-shadow-item>`,
});

interface HostState {
  readonly bumps: readonly string[];
}
type HostMsg = { readonly _tag: 'Bumped'; readonly by: string };

/** A shadow-DOM component whose server-rendered shadow root contains a light-DOM child. */
export const ShadowHost = define<HostState, HostMsg>('test-shadow-host', {
  init: () => ({ bumps: [] }),
  intent: { Bumped: child(LightItem, (out) => ({ _tag: 'Bumped', by: out.by })) },
  update: { Bumped: (s, m) => ({ bumps: [...s.bumps, m.by] }) },
  view: (_s, i) => html`<test-light-item data-intent=${i.Bumped}></test-light-item>`,
});
