// Compile the consumer boundaries before proposing wider native events or new driver APIs.
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  command,
  define,
  defineDriver,
  html,
  intentsOf,
  type IntentInput,
  type IntentNames,
  type Command,
} from '@gyral/core';
import { commandsFor, inputsFor, parse } from '@gyral/testing';

function camera(value: unknown): value is { readonly angle: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'angle' in value &&
    typeof value.angle === 'number' &&
    Number.isFinite(value.angle)
  );
}
const Camera = define<
  { readonly angle: number },
  { readonly _tag: 'Turn'; readonly angle: number }
>()('test-guarded-camera', {
  init: () => ({ angle: 0 }),
  intent: {
    Camera: ({ detail }) => (camera(detail) ? { _tag: 'Turn', angle: detail.angle } : undefined),
  },
  update: { Turn: (_s, m) => ({ angle: m.angle }) },
  view: (s, i) => html`<output data-intent-camera=${i.Camera}>${s.angle}</output>`,
});
type Snapshot = { readonly _tag: 'Snapshot'; readonly revision: number };
type Receipt = { readonly _tag: 'Receipt'; readonly committed: boolean };
type Operation = { readonly _tag: 'Load' } | { readonly _tag: 'Save'; readonly key: string };
const combined = defineDriver<Operation, Snapshot | Receipt>({
  name: 'combined',
  run: (input) =>
    input._tag === 'Load'
      ? { _tag: 'Snapshot', revision: 1 }
      : { _tag: 'Receipt', committed: true },
});
const load = defineDriver<undefined, Snapshot>({
  name: 'snapshot:load',
  run: () => ({ _tag: 'Snapshot', revision: 1 }),
});
const save = defineDriver<{ readonly key: string }, Receipt>({
  name: 'snapshot:save',
  run: () => ({ _tag: 'Receipt', committed: true }),
});

describe('native event and operation types', () => {
  it('keeps native detail unknown and validates the payload at the parser boundary', () => {
    expectTypeOf<IntentInput['detail']>().toEqualTypeOf<unknown>();
    expect(parse(Camera, 'Camera', { detail: { angle: 45 } })).toEqual({ _tag: 'Turn', angle: 45 });
    for (const detail of [undefined, null, {}, { angle: '45' }, { angle: Infinity }])
      expect(parse(Camera, 'Camera', { detail })).toBeUndefined();
  });

  it('uses existing intent-name inference without another exported alias', () => {
    type Names = ReturnType<typeof intentsOf<typeof Camera>>;
    expectTypeOf<Names>().toEqualTypeOf<IntentNames<'Camera'>>();
    expect(intentsOf<typeof Camera>().Camera).toBe('Camera');
  });

  it('guards combined operation results and precisely types separate drivers', () => {
    const request = command(
      combined,
      { _tag: 'Load' },
      {
        onSuccess: (result) => {
          expectTypeOf(result).toEqualTypeOf<Snapshot | Receipt>();
          return result._tag === 'Snapshot'
            ? { _tag: 'Loaded', revision: result.revision }
            : undefined;
        },
      },
    );
    expect(inputsFor([request], combined)).toEqual([{ _tag: 'Load' }]);
    const loading = command(load, undefined, {
      onSuccess: (result) => {
        expectTypeOf(result).toEqualTypeOf<Snapshot>();
        return { _tag: 'Loaded', revision: result.revision };
      },
    });
    const saving = command(
      save,
      { key: 'retry-key' },
      {
        onSuccess: (result) => {
          expectTypeOf(result).toEqualTypeOf<Receipt>();
          return { _tag: 'Saved', committed: result.committed };
        },
      },
    );
    type WorkMsg =
      | { readonly _tag: 'Loaded'; readonly revision: number }
      | { readonly _tag: 'Saved'; readonly committed: boolean };
    const commands: readonly Command<WorkMsg>[] = [loading, saving];
    expect(inputsFor(commands, save)).toEqual([{ key: 'retry-key' }]);
    expect(commandsFor(commands, load)).toHaveLength(1);
  });
});
