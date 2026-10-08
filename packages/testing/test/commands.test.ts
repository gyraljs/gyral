// outputsIn and focusTargetsIn (gyral-dyn.8): what a reducer emitted to its parent and where it
// asked focus to go, without naming core's internal marker drivers.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { command, define, defineDriver, emit, focus, html, outputs } from '@gyral/core';
import { focusTargetsIn, inputsFor, outputsIn, step, type FocusTarget } from '../src/index.js';

type Out = { readonly _tag: 'Picked'; readonly id: number } | { readonly _tag: 'Cleared' };
type Msg = { readonly _tag: 'Pick'; readonly id: number } | { readonly _tag: 'Clear' };

const send = outputs<Out>();
const log = defineDriver<string, undefined>({ name: 'log', run: () => undefined });

const Picker = define<{ readonly id: number }, Msg, object, Out>('test-commands-picker', {
  init: () => ({ id: 0 }),
  intent: {},
  update: {
    Pick: (s, m) => [
      { id: m.id },
      [
        command(log, `picked ${String(m.id)}`, { onSuccess: (): Msg => ({ _tag: 'Clear' }) }),
        send({ _tag: 'Picked', id: m.id }),
        focus('#done', { preventScroll: true }),
      ],
    ],
    Clear: (s) => [s, [send({ _tag: 'Cleared' }), focus('input', { select: true })]],
  },
  view: (s) => html`<p>${s.id}</p>`,
});

describe('outputsIn', () => {
  it('returns the emitted outputs in order, skipping other commands', () => {
    const next = step(Picker.spec, { id: 0 }, { _tag: 'Pick', id: 7 });
    expect(outputsIn(next.commands, Picker)).toEqual([{ _tag: 'Picked', id: 7 }]);
    expect(inputsFor(next.commands, log)).toEqual(['picked 7']);
    const both = [...next.commands, emit({ _tag: 'Untyped' })];
    expect(outputsIn(both)).toEqual([{ _tag: 'Picked', id: 7 }, { _tag: 'Untyped' }]);
  });

  it('is empty when nothing was emitted', () => {
    expect(outputsIn([focus('h1')])).toEqual([]);
    expect(outputsIn([])).toEqual([]);
  });

  it("types outputs by the component's union, or by the one you name", () => {
    const { commands } = step(Picker.spec, { id: 0 }, { _tag: 'Clear' });
    expectTypeOf(outputsIn(commands, Picker)).toEqualTypeOf<readonly Out[]>();
    expectTypeOf(outputsIn<Out>(commands)).toEqualTypeOf<readonly Out[]>();
    const [first] = outputsIn(commands, Picker);
    if (first?._tag === 'Picked') expectTypeOf(first.id).toBeNumber();
    // A component without outputs emits nothing:
    const Plain = define<{ readonly id: number }, Msg>('test-commands-plain', Picker.spec);
    expectTypeOf(outputsIn(commands, Plain)).toEqualTypeOf<readonly never[]>();
    // @ts-expect-error: not a component class
    outputsIn(commands, { outputs: 1 });
  });
});

describe('focusTargetsIn', () => {
  it('returns each focus request with its options, in order', () => {
    const picked = step(Picker.spec, { id: 0 }, { _tag: 'Pick', id: 1 });
    expect(focusTargetsIn(picked.commands)).toEqual([{ selector: '#done', preventScroll: true }]);
    const cleared = step(Picker.spec, { id: 1 }, { _tag: 'Clear' });
    expect(focusTargetsIn([...picked.commands, ...cleared.commands])).toEqual([
      { selector: '#done', preventScroll: true },
      { selector: 'input', select: true },
    ]);
    expect(focusTargetsIn([focus('h2')])).toEqual([{ selector: 'h2' }]);
    expect(focusTargetsIn([emit({ _tag: 'Cleared' })])).toEqual([]);
  });

  it('is typed as selector plus focus options', () => {
    expectTypeOf(focusTargetsIn([])).toEqualTypeOf<readonly FocusTarget[]>();
    expectTypeOf<FocusTarget>().toEqualTypeOf<{
      readonly selector: string;
      readonly preventScroll?: boolean;
      readonly select?: boolean;
    }>();
  });
});
