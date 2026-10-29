// A component for the render-skip tests (render-skip.test.ts, render-skip.prod.test.ts): its view
// reads its state, a prop and a store, and counts its calls.
import { define, defineStore, html, prop, send } from '../src/index.js';

export const views = { count: 0 };

export const level = defineStore<
  { readonly n: number },
  { readonly _tag: 'Up' } | { readonly _tag: 'Keep' }
>('test-skip-level', {
  init: () => ({ n: 0 }),
  update: { Up: (s) => ({ n: s.n + 1 }), Keep: (s) => s },
});

export type Msg =
  | { readonly _tag: 'Same' }
  | { readonly _tag: 'Next' }
  | { readonly _tag: 'Break' }
  | { readonly _tag: 'Mend' }
  | { readonly _tag: 'Raise' }
  | { readonly _tag: 'Hold' };

export const Counter = define<
  { readonly n: number; readonly broken: boolean },
  Msg,
  { readonly label: string }
>()('test-skip', {
  props: { label: prop.string({ default: '' }) },
  stores: [level],
  init: () => ({ n: 0, broken: false }),
  update: {
    Same: (s) => s,
    Next: (s) => ({ ...s, n: s.n + 1 }),
    Break: (s) => ({ ...s, broken: true }),
    Mend: (s) => ({ ...s, broken: false }),
    Raise: (s) => [s, [send(level, { _tag: 'Up' })]],
    Hold: (s) => [s, [send(level, { _tag: 'Keep' })]],
  },
  view: (s, _i, { props, read }) => {
    views.count += 1;
    if (s.broken) throw new Error('broken view');
    return html`<p>${props.label}:${String(s.n)}:${String(read(level).n)}</p>`;
  },
  error: () => html`<p>error</p>`,
});

export const text = (el: Element): string => el.shadowRoot?.textContent ?? '';
