import { describe, expect, it } from 'vitest';
import { define, html, prop, defineStore } from '@gyral/core';
import { renderToString } from '@gyral/ssr';
import { parse, viewOf } from '@gyral/testing';

const score = defineStore<number, { readonly _tag: 'Add' }>('view-helper-score', {
  init: () => 3,
  update: { Add: (n) => n + 1 },
});
type State = { readonly selected: boolean };
type Msg = { readonly _tag: 'Pick' } | { readonly _tag: 'Moved'; readonly key: string };
const Card = define<State, Msg, { readonly label: string }>()('test-view-helper', {
  props: { label: prop.string({ default: 'Card' }) },
  stores: [score],
  init: () => ({ selected: false }),
  intent: {
    Pick: true,
    Keyboard: ({ key }, { state }) =>
      !state.selected && key === 'ArrowRight' ? { _tag: 'Moved', key } : undefined,
  },
  update: { Pick: (s) => ({ ...s, selected: true }), Moved: (s) => s },
  view: (s, i, ctx) =>
    html`<button
      type="button"
      aria-pressed=${s.selected}
      data-intent=${i.Pick}
      data-intent-keydown=${i.Keyboard}
    >
      ${ctx.props.label} ${ctx.read(score)}
    </button>`,
});

describe('pure views and keyboard parsers in Node', () => {
  it('renders named intents with explicit state, props and stores without casts', async () => {
    const value = viewOf(
      Card,
      { selected: true },
      { props: { label: 'Ace' }, stores: [score.instance(7)] },
    );
    expect(await renderToString(value, { dev: false })).toBe(
      '<button type="button" aria-pressed="true" data-intent="Pick" data-intent-keydown="Keyboard">Ace<!----> 7</button>',
    );
    expect(
      await renderToString(
        viewOf(
          Card.spec,
          { selected: false },
          { props: { label: 'King' }, stores: [score.instance()] },
        ),
        { dev: false },
      ),
    ).toContain('King<!----> 3');
  });

  it('uses the existing partial parser input for keyboard contexts', () => {
    expect(parse(Card, 'Keyboard', { key: 'ArrowRight' }, { state: { selected: false } })).toEqual({
      _tag: 'Moved',
      key: 'ArrowRight',
    });
    expect(
      parse(Card, 'Keyboard', { key: 'ArrowRight' }, { state: { selected: true } }),
    ).toBeUndefined();
    expect(parse(Card, 'Keyboard', { key: 'Enter' })).toBeUndefined();
  });

  it('requires explicit instances for stores the view reads', () => {
    expect(() => viewOf(Card, { selected: false })).toThrow('pass an instance');
  });
});
