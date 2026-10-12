// The public types name only exported types (gyral-7se.30): what `Update`, `IntentParser`,
// `StoreUpdate` and the form helpers are built from can be named in annotations.
import type { StandardSchemaV1 as SpecSchema } from '@standard-schema/spec';
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as core from '../src/index.js';
import {
  defineForm,
  type Ctx,
  type IntentInput,
  type IntentParser,
  type IntentRejected,
  type Next,
  type ParseResult,
  type ParserCtx,
  type Reducer,
  type StandardSchemaV1,
  type StoreUpdate,
  type Update,
  type Variant,
} from '../src/index.js';

interface State {
  readonly items: readonly string[];
}
type Msg = { readonly _tag: 'Add'; readonly item: string } | { readonly _tag: 'Clear' };

describe('public helper types', () => {
  it('Variant picks one member of a message union', () => {
    expectTypeOf<Variant<Msg, 'Add'>>().toEqualTypeOf<{
      readonly _tag: 'Add';
      readonly item: string;
    }>();
    expectTypeOf<Variant<Msg, 'Missing'>>().toBeNever();
  });

  it('Update is built from Reducer and Variant', () => {
    expectTypeOf<Update<State, Msg>['Add']>().toEqualTypeOf<
      Reducer<State, Msg, Variant<Msg, 'Add'>>
    >();
    expectTypeOf<Reducer<State, Msg, Variant<Msg, 'Clear'>>>().toEqualTypeOf<
      (state: State, msg: Variant<Msg, 'Clear'>, ctx: Ctx<object>) => Next<State, Msg>
    >();
    expectTypeOf<NonNullable<Update<State, Msg>['IntentRejected']>>().toEqualTypeOf<
      Reducer<State, Msg, IntentRejected>
    >();
  });

  it('a reducer written outside the spec fits its update entry', () => {
    const add: Reducer<State, Msg, Variant<Msg, 'Add'>> = (s, m) => ({
      items: [...s.items, m.item],
    });
    const update: Update<State, Msg> = { Add: add, Clear: () => ({ items: [] }) };
    expect(
      update.Add({ items: [] }, { _tag: 'Add', item: 'a' }, { props: {}, read: never }),
    ).toEqual({ items: ['a'] });
  });

  it('StoreUpdate entries take one Variant', () => {
    expectTypeOf<StoreUpdate<State, Msg>['Add']>().toEqualTypeOf<
      (state: State, msg: Variant<Msg, 'Add'>) => Next<State, Msg>
    >();
  });

  it('IntentParser returns ParseResult', () => {
    expectTypeOf<ParseResult<Msg>>().toEqualTypeOf<Msg | IntentRejected | undefined>();
    expectTypeOf<IntentParser<Msg>>().toEqualTypeOf<
      (input: IntentInput, ctx: ParserCtx<unknown>) => ParseResult<Msg> | Promise<ParseResult<Msg>>
    >();
  });

  it('StandardSchemaV1 is the Standard Schema interface the form helpers take', () => {
    expectTypeOf<StandardSchemaV1>().toEqualTypeOf<SpecSchema>();
    expectTypeOf<StandardSchemaV1.Issue>().toEqualTypeOf<SpecSchema.Issue>();
    expectTypeOf<Parameters<typeof defineForm>[0]>().toExtend<StandardSchemaV1>();
  });

  it('adds no runtime exports', () => {
    for (const name of ['Reducer', 'Variant', 'ParseResult', 'StandardSchemaV1']) {
      expect(name in core, name).toBe(false);
    }
  });
});

/** A reader that is never called in these tests. */
function never(): never {
  throw new Error('not called');
}
