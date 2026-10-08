// Drivers and fakes go wherever drivers are substituted with no cast (gyral-dyn.20): typed
// inputs, outputs and errors, `toError`, `retry`, a run that names its `DriverContext<O>`,
// subscriptions and fakes, into `el.drivers`, `withDrivers`, `provideDrivers` and a
// `DriverOverrides` map.
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  command,
  define,
  defineDriver,
  html,
  provideDrivers,
  settled,
  subscription,
  type AnyDriver,
  type Driver,
  type DriverContext,
  type DriverOverrides,
} from '@gyral/core';
import { fakeDriver, withDrivers, type FakeDriver } from '../src/index.js';

afterEach(() => {
  document.body.replaceChildren();
});

const urls: (string | null)[] = [];
const savedQuery = defineDriver<undefined, string | null>({
  name: 'saved-query',
  run: () => 'gyral',
});
const urlSync = defineDriver<string | null, undefined>({
  name: 'url-sync',
  run: (query) => void urls.push(query),
  concurrency: 'queue',
});
const clipboard = defineDriver<string, undefined, string>({
  name: 'clipboard',
  run: () => Promise.resolve(undefined),
  toError: (cause) => (cause instanceof Error ? cause.message : String(cause)),
  retry: { times: 2, delayMs: 10, backoff: 'exponential' },
});
const ticks = defineDriver<number, number>({
  name: 'ticks',
  run: (from: number, ctx: DriverContext<number>) => {
    ctx.emit(from + 1);
    return from;
  },
});
const session = subscription<{ readonly turn: number }>('session', () => () => {});

type Msg = { readonly _tag: 'Restored'; readonly query: string };
const Search = define<{ readonly query: string }, Msg>('test-driver-types-search', {
  init: () => [
    { query: '' },
    [
      command<undefined, string | null, unknown, Msg>(savedQuery, undefined, {
        onSuccess: (query) => (query === null ? undefined : { _tag: 'Restored', query }),
      }),
    ],
  ],
  intent: {},
  update: { Restored: (_s, m) => ({ query: m.query }) },
  view: (s) => html`<output>${s.query}</output>`,
});

describe('driver substitution needs no cast', () => {
  it('takes typed drivers and fakes in el.drivers', async () => {
    const el = new Search();
    el.drivers = {
      'saved-query': defineDriver<undefined, string | null>({
        name: 'saved-query',
        run: () => 'web',
      }),
      'url-sync': defineDriver<string | null, undefined>({
        name: 'url-sync',
        run: () => undefined,
      }),
      clipboard: fakeDriver<string, undefined, string>('clipboard', () => undefined),
      ticks,
      session,
    };
    document.body.append(el);
    await settled();
    expect(el.state).toEqual({ query: 'web' });
  });

  it('takes them in withDrivers, provideDrivers and a DriverOverrides map', async () => {
    const fake = fakeDriver<undefined, string | null>('saved-query', () => 'from-tree');
    const overrides: DriverOverrides = { 'saved-query': fake, urlSync, clipboard, ticks, session };
    const all: Record<string, AnyDriver> = { savedQuery, urlSync, clipboard, ticks, session };
    const container = document.createElement('main');
    document.body.append(container);
    provideDrivers(document.createElement('section'), all)();
    const stop = withDrivers(container, overrides);
    const el = new Search();
    container.append(el);
    await settled();
    expect(el.state).toEqual({ query: 'from-tree' });
    expect(fake.inputs).toEqual([undefined]);
    stop();
  });

  it('types every driver shape as assignable to AnyDriver', () => {
    expectTypeOf(savedQuery).toExtend<AnyDriver>();
    expectTypeOf(urlSync).toExtend<AnyDriver>();
    expectTypeOf(clipboard).toExtend<AnyDriver>();
    expectTypeOf(ticks).toExtend<AnyDriver>();
    expectTypeOf(session).toExtend<AnyDriver>();
    expectTypeOf(fakeDriver(clipboard)).toExtend<AnyDriver>();
    expectTypeOf<FakeDriver<{ readonly id: number }, string, Error>>().toExtend<AnyDriver>();
    // The trap: a map typed with `unknown` inputs rejects drivers whose input is typed.
    // @ts-expect-error: Driver<string | null, undefined> takes only its own input
    const wrong: Record<string, Driver<unknown, unknown>> = { urlSync };
    expect(wrong).toBeDefined();
  });
});

describe('fakeDriver(name, run)', () => {
  it('answers every call with run and records the inputs', async () => {
    const seen: (string | null)[] = [];
    const fake = fakeDriver<string | null, undefined>('url-sync', (q) => void seen.push(q));
    expectTypeOf(fake).toEqualTypeOf<FakeDriver<string | null, undefined, unknown>>();
    await fake.run('A1', { signal: new AbortController().signal, emit: () => {} });
    expect(seen).toEqual(['A1']);
    expect(fake.inputs).toEqual(['A1']);
    expect(fake.name).toBe('url-sync');
  });

  it('infers input and output from run', () => {
    const fake = fakeDriver('length', (text: string) => text.length);
    expectTypeOf(fake).toEqualTypeOf<FakeDriver<string, number, unknown>>();
    // @ts-expect-error: run returns a number
    fakeDriver<string, string>('length', (text: string) => text.length);
  });
});
