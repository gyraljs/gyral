// Typed driver provision (gyral-337.2, ADR 0006 addendum "Typed provision"): a token provides
// its own implementation (`token.provide(run)`, `subscription(token, …)`), and drivers are
// supplied as a list, each under its own name, so there is no key to mistype. Development
// rejects two drivers of one name in a list (G0044) and warns when a record's key isn't its
// driver's name (G0045).
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  command,
  define,
  defineDriver,
  html,
  provideDrivers,
  settled,
  subscription,
  type Driver,
} from '../src/index.js';

type Msg = { readonly _tag: 'Go' } | { readonly _tag: 'Got'; readonly text: string };

const shout = defineDriver<string, string>({ name: 'shout', concurrency: 'switch' });
const feed = defineDriver<undefined, string>('feed');

const Speaker = define<{ readonly got: readonly string[] }, Msg>()('test-provision', {
  init: () => [
    { got: [] },
    [command(feed, undefined, { onSuccess: (text) => ({ _tag: 'Got', text }) })],
  ],
  update: {
    Go: (s) => [s, [command(shout, 'hi', { onSuccess: (text) => ({ _tag: 'Got', text }) })]],
    Got: (s, m) => ({ got: [...s.got, m.text] }),
  },
  view: () => html``,
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('token.provide(run)', () => {
  it("gives a driver with the token's name and policy, and a run typed by it", async () => {
    const driver = shout.provide((text) => text.toUpperCase());
    expectTypeOf(driver).toEqualTypeOf<Driver<string, string>>();
    expect(driver.name).toBe('shout');
    expect(driver.concurrency).toBe('switch');
    expect(driver).not.toHaveProperty('provide');
    expect(
      await driver.run('hi', { signal: new AbortController().signal, emit: () => undefined }),
    ).toBe('HI');
    // @ts-expect-error -- run must take the token's input (string) and give its output (string)
    shout.provide((n: number) => n);
  });

  it('keeps ReturnType<typeof defineDriver<I, O>> a Driver, which a driver with run fits', () => {
    expectTypeOf<ReturnType<typeof defineDriver<string, string>>>().toEqualTypeOf<
      Driver<string, string>
    >();
    const fields: { readonly shout: ReturnType<typeof defineDriver<string, string>> } = {
      shout: defineDriver<string, string>({ name: 'shout', run: (text) => text }),
    };
    expect(fields.shout.name).toBe('shout');
  });
});

describe('a list of drivers', () => {
  it('supplies each driver under its own name, from provideDrivers or el.drivers', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    provideDrivers(root, [
      shout.provide((text) => `${text}!`),
      subscription(feed, (emit) => {
        emit('first');
        return () => undefined;
      }),
    ]);
    const el = new Speaker();
    root.append(el);
    await settled();
    el.send({ _tag: 'Go' });
    await settled();
    expect(el.state.got).toEqual(['first', 'hi!']);

    const own = new Speaker();
    own.drivers = [shout.provide((text) => `own ${text}`)];
    root.append(own);
    own.send({ _tag: 'Go' });
    await settled();
    expect(own.state.got).toContain('own hi');
  });

  it('rejects two drivers of one name in development (G0044)', () => {
    const root = document.createElement('div');
    expect(() => provideDrivers(root, [shout.provide((t) => t), shout.provide((t) => t)])).toThrow(
      'Two drivers named "shout" in one list of drivers',
    );
  });
});

describe('subscription(token, subscribe)', () => {
  it("takes the token's name and policy", () => {
    const ticks = defineDriver<undefined, number, string>({ name: 'ticks', concurrency: 'merge' });
    const driver = subscription(ticks, () => () => undefined);
    expectTypeOf(driver).toEqualTypeOf<Driver<undefined, number, string>>();
    expect(driver.name).toBe('ticks');
    expect(driver.concurrency).toBe('merge');
    expect(driver).not.toHaveProperty('provide');
  });
});

describe('a record of drivers', () => {
  it("warns once in development when a key isn't its driver's name (G0045)", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const root = document.createElement('div');
    document.body.append(root);
    // A typo: commands of "shout" miss it.
    const drivers = {
      shuot: shout.provide((t) => t),
      feed: subscription(feed, () => () => undefined),
    };
    provideDrivers(root, drivers);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      'A driver supplied as "shuot" is named "shout"',
    );
    root.append(new Speaker());
    await settled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
