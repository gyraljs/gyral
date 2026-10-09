// Parsers read the component's state through ctx (gyral-1zd.14): `(input, { props, state, read })`,
// so whether to take over a key can depend on where the user is. A grid keeps Tab inside it
// until the last cell; there Tab keeps its default and focus leaves the grid.
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { define, html, settled, type ParserCtx } from '../src/index.js';

interface Grid {
  readonly cell: number;
  readonly cells: number;
}
type Msg = { readonly _tag: 'Next' } | { readonly _tag: 'Grow' };

const Cells = define<Grid, Msg>()('test-parser-state', {
  init: () => ({ cell: 0, cells: 3 }),
  intent: {
    Next: ({ key, event }, { state }) => {
      expectTypeOf(state).toEqualTypeOf<Readonly<Grid>>();
      if (key !== 'Tab' || state.cell === state.cells - 1) return undefined;
      event.preventDefault();
      return { _tag: 'Next' };
    },
    Grow: () => ({ _tag: 'Grow' }),
  },
  update: {
    Next: (s) => ({ ...s, cell: s.cell + 1 }),
    Grow: (s) => ({ ...s, cells: s.cells + 1 }),
  },
  view: (s, i) => html`
    <div role="grid" tabindex="0" data-intent-keydown=${i.Next}>cell ${s.cell}</div>
    <button type="button" data-intent=${i.Grow}>add a cell</button>
  `,
});

type CellsElement = HTMLElement & {
  readonly state: Grid;
  send(msg: Msg): void;
};

const tab = (el: HTMLElement): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  el.shadowRoot?.querySelector('[role="grid"]')?.dispatchEvent(event);
  return event;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('parsers read state', () => {
  it('sees the state when the event fires, with no render in between', async () => {
    const el = new Cells() as CellsElement;
    document.body.append(el);
    await settled();

    expect(tab(el).defaultPrevented).toBe(true);
    expect(tab(el).defaultPrevented).toBe(true);
    expect(el.state.cell).toBe(2);
    // The last cell: Tab keeps its default, so focus can leave the grid.
    expect(tab(el).defaultPrevented).toBe(false);
    expect(el.state.cell).toBe(2);

    // A message sent synchronously, before any render, is already visible to the next parse.
    el.send({ _tag: 'Grow' });
    expect(tab(el).defaultPrevented).toBe(true);
    expect(el.state.cell).toBe(3);
  });

  it('types state as the component state, read-only', () => {
    expectTypeOf<ParserCtx<object, Grid>['state']>().toEqualTypeOf<Readonly<Grid>>();
  });
});
