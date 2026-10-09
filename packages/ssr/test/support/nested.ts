// Components shared by the nested-SSR tests: rendered on the server (nested.node.test.ts),
// then hydrated in the browser (nested-hydration.test.ts).
import { child, command, define, defineDriver, emit, html } from '@gyral/core';

/** Answers synchronously, like the router's first location. Records every call. */
export const echoCalls: string[] = [];
export const echo = defineDriver<string, string>({
  name: 'echo',
  run: (input) => {
    echoCalls.push(input);
    return input;
  },
});

interface ChildState {
  readonly count: number;
  readonly heard: readonly string[];
  readonly hydrated: boolean | undefined;
}
type ChildMsg = { readonly _tag: 'Inc' } | { readonly _tag: 'Heard'; readonly value: string };
type ChildOut = { readonly _tag: 'Bumped'; readonly count: number };

/** A Gyral child with an intent, an init command and an output. */
export const NestChild = define<ChildState, ChildMsg, object, ChildOut>()('test-nest-child', {
  init: () => [
    { count: 0, heard: [], hydrated: undefined },
    [command(echo, 'child-ready', { onSuccess: (value) => ({ _tag: 'Heard', value }) })],
  ],
  intent: { Inc: () => ({ _tag: 'Inc' }) },
  update: {
    Inc: (s) => [{ ...s, count: s.count + 1 }, [emit({ _tag: 'Bumped', count: s.count + 1 })]],
    Heard: (s, m) => ({ ...s, heard: [...s.heard, m.value] }),
    Hydrated: (s, m) => ({ ...s, hydrated: m.serverRendered }),
  },
  view: (s) => html`<button class="inc" data-intent="Inc">child ${s.count}</button>`,
});

interface ParentState {
  readonly clicks: number;
  readonly bumps: readonly number[];
}
type ParentMsg = { readonly _tag: 'Click' } | { readonly _tag: 'Child'; readonly count: number };

/** A shadow-DOM parent whose server-rendered shadow root contains the child. */
export const NestParent = define<ParentState, ParentMsg>()('test-nest-parent', {
  init: () => ({ clicks: 0, bumps: [] }),
  intent: {
    Click: () => ({ _tag: 'Click' }),
    Child: child(NestChild, (out) => ({ _tag: 'Child', count: out.count })),
  },
  update: {
    Click: (s) => ({ ...s, clicks: s.clicks + 1 }),
    Child: (s, m) => ({ ...s, bumps: [...s.bumps, m.count] }),
  },
  view: (s, i) =>
    html`<button class="click" data-intent=${i.Click}>parent ${s.clicks}</button>
      <test-nest-child data-intent=${i.Child}></test-nest-child>`,
});
