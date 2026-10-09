// Typed outputs (`outputs<Out>()`, gyral-c5d.4) and listening to a Gyral child's outputs from
// a parent that isn't a Gyral component (`OUTPUT_EVENT`, gyral-c5d.3). ADR 0010.
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  child,
  define,
  emit,
  html,
  OUTPUT_EVENT,
  outputs,
  prop,
  settled,
  type Command,
  type OutputEvent,
  type OutputsOf,
} from '../src/index.js';

type PickerOut = { readonly _tag: 'Picked'; readonly id: number } | { readonly _tag: 'Cleared' };
type PickerMsg = { readonly _tag: 'Pick'; readonly id: number } | { readonly _tag: 'Clear' };

const emitPicker = outputs<PickerOut>();

const Picker = define<object, PickerMsg, { readonly label: string }, PickerOut>()('test-picker', {
  props: { label: prop.string({ default: 'pick' }) },
  init: () => ({}),
  intent: {
    Pick: ({ value }) => ({ _tag: 'Pick', id: Number(value) }),
    Clear: () => ({ _tag: 'Clear' }),
  },
  update: {
    Pick: (s, m) => [s, [emitPicker({ _tag: 'Picked', id: m.id })]],
    Clear: (s) => [s, [emitPicker({ _tag: 'Cleared' })]],
  },
  view: (_s, i, { props }) => html`
    <button type="button" value="7" data-intent=${i.Pick}>${props.label}</button>
    <button type="button" class="clear" data-intent=${i.Clear}>clear</button>
  `,
});

type ParentMsg = { readonly _tag: 'FromPicker'; readonly out: PickerOut };
const Parent = define<{ readonly log: readonly string[] }, ParentMsg>()('test-picker-parent', {
  init: () => ({ log: [] }),
  intent: { FromPicker: child(Picker, (out) => ({ _tag: 'FromPicker', out })) },
  update: {
    FromPicker: (s, { out }) => ({
      log: [...s.log, out._tag === 'Picked' ? `picked ${String(out.id)}` : 'cleared'],
    }),
  },
  view: (s, i) => html`
    <test-picker data-intent=${i.FromPicker}></test-picker>
    <output>${s.log.join(', ')}</output>
  `,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('outputs<Out>()', () => {
  it('is emit itself, typed by the output union', () => {
    expect(outputs<PickerOut>()).toBe(emit);
    expectTypeOf(emitPicker).parameter(0).toEqualTypeOf<PickerOut>();
    expectTypeOf(emitPicker).returns.toEqualTypeOf<Command<never>>();
    // @ts-expect-error: not a variant of PickerOut
    emitPicker({ _tag: 'Picke', id: 1 });
    // @ts-expect-error: `id` must be a number
    emitPicker({ _tag: 'Picked', id: '1' });
    // @ts-expect-error: `Picked` needs its `id`
    emitPicker({ _tag: 'Picked' });
  });

  it('accepts interfaces, which emit() rejects for lacking an index signature', () => {
    interface Saved {
      readonly _tag: 'Saved';
      readonly at: number;
    }
    const emitSaved = outputs<Saved>();
    const saved: Saved = { _tag: 'Saved', at: 1 };
    expect(emitSaved(saved).input).toBe(saved);
  });

  it("types the define() class's outputs, which child() reads", () => {
    expectTypeOf<OutputsOf<typeof Picker>>().toEqualTypeOf<PickerOut>();
    expectTypeOf<OutputsOf<typeof Parent>>().toEqualTypeOf<never>();
  });

  it('reaches a Gyral parent through child()', async () => {
    const parent = new Parent();
    document.body.append(parent);
    await settled();
    const picker = parent.shadowRoot?.querySelector('test-picker');
    picker?.shadowRoot?.querySelector('button')?.click();
    picker?.shadowRoot?.querySelector<HTMLButtonElement>('.clear')?.click();
    await settled();
    expect(parent.state.log).toEqual(['picked 7', 'cleared']);
  });
});

describe('OUTPUT_EVENT', () => {
  it('is the event name a non-Gyral parent listens for; detail is the output', async () => {
    expect(OUTPUT_EVENT).toBe('gyral-output');
    const seen: PickerOut[] = [];
    // Plain DOM: a page script, or a component from another library, listening on an ancestor
    // in the same tree (the event bubbles but isn't composed).
    const section = document.createElement('section');
    section.addEventListener(OUTPUT_EVENT, (event) => {
      const { detail } = event as OutputEvent<OutputsOf<typeof Picker>>;
      seen.push(detail);
    });
    const picker = new Picker();
    section.append(picker);
    document.body.append(section);
    await settled();
    picker.shadowRoot?.querySelector('button')?.click();
    await settled();
    expect(seen).toEqual([{ _tag: 'Picked', id: 7 }]);
  });
});
