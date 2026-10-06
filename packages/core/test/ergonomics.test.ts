import { afterEach, describe, expect, it } from 'vitest';
import { define, emit, html, prop, runInit, settled, type Stateless } from '../src/index.js';

type Out = { readonly _tag: 'Picked'; readonly value: string };
type BadgeMsg = { readonly _tag: 'Pick' };

// Stateless: no init, a pure view of its props that only reports up.
const Badge = define<Stateless, BadgeMsg, { readonly label: string }, Out>('test-badge', {
  props: { label: prop.string({ required: true }) },
  intent: { Pick: () => ({ _tag: 'Pick' }) },
  update: { Pick: (s, _m, { props }) => [s, [emit({ _tag: 'Picked', value: props.label })]] },
  view: (_s, i, { props }) =>
    html`<button
      data-intent=${i.Pick}
      class=${props.label.length > 3 ? 'long' : ''}
      style="color: rgb(1, 2, 3)"
    >
      ${props.label}
    </button>`,
});

// Controlled input whose model refuses values over 10: `value=` is live form state
// (view/02-bindings.md), so the render after the refused message writes the kept value back.
type FieldMsg = { readonly _tag: 'Typed'; readonly value: number };
const Capped = define<{ readonly value: number }, FieldMsg>('test-capped', {
  init: () => ({ value: 5 }),
  intent: { Typed: ({ value }) => ({ _tag: 'Typed', value: Number(value) }) },
  update: { Typed: (s, m) => (m.value > 10 ? s : { value: m.value }) },
  view: (s, i) => html`<input data-intent=${i.Typed} value=${s.value} />`,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('ergonomics', () => {
  it('lets stateless components omit init', async () => {
    expect(runInit(Badge.spec, { label: 'x' })).toEqual({});
    const el = new Badge();
    el.label = 'gyral';
    document.body.append(el);
    await settled();
    const button = el.shadowRoot?.querySelector('button');
    expect(button?.classList.contains('long')).toBe(true);
    expect(button?.style.color).toBe('rgb(1, 2, 3)');
  });

  it('still requires init when {} is not a valid state', () => {
    // @ts-expect-error: `init` is required for components with state
    define<{ readonly n: number }, never>('test-needs-init', {
      intent: {},
      update: {},
      view: () => html``,
    });
  });

  it('keeps controlled inputs on the model: every message re-renders, live', async () => {
    const el = new Capped();
    document.body.append(el);
    await settled();
    const input = el.shadowRoot?.querySelector('input');
    if (input == null) throw new Error('no input');
    input.value = '99';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settled();
    expect(el.state.value).toBe(5);
    expect(input.value).toBe('5');
  });
});
