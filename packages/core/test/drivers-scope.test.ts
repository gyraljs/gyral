import { afterEach, describe, expect, it } from 'vitest';
import {
  command,
  define,
  defineDriver,
  html,
  provideDrivers,
  settled,
  type AnyDriver,
} from '../src/index.js';
import { DRIVERS_ELEMENT } from '../src/internal.js';
import { collectErrors } from './collect-errors.js';

const real = defineDriver<string, string>({ name: 'echo', run: (s) => `real:${s}` });
const fake = (label: string): AnyDriver =>
  defineDriver<string, string>({ name: 'echo', run: (s) => `${label}:${s}` });

type Msg = { readonly _tag: 'Go' } | { readonly _tag: 'Got'; readonly text: string };
interface State {
  readonly got: readonly string[];
}

const echo = () => command(real, 'x', { onSuccess: (text): Msg => ({ _tag: 'Got', text }) });

const spec = {
  init: (): State => ({ got: [] }),
  update: {
    Go: (s: State) => [s, [echo()]] as const,
    Got: (s: State, m: { readonly text: string }) => ({ got: [...s.got, m.text] }),
  },
};

// A leaf component, and a parent that renders it inside its own shadow root.
const Leaf = define<State, Msg>()('test-drivers-leaf', {
  ...spec,
  view: (s) => html`<p>${s.got.join(',')}</p>`,
});
define<State, Msg>()('test-drivers-parent', {
  ...spec,
  view: () => html`<test-drivers-leaf></test-drivers-leaf>`,
});
// A component whose driver is a token: it has no implementation until a provider names one.
const echoToken = defineDriver<string, string>('echo-token');
const TokenUser = define<State, Msg>()('test-drivers-token', {
  ...spec,
  update: {
    Go: (s: State) =>
      [s, [command(echoToken, 'x', { onSuccess: (text) => ({ _tag: 'Got', text }) })]] as const,
    Got: spec.update.Got,
  },
  view: () => html``,
});
// Fire-and-forget: a command with no handlers answers with nothing.
const logged: string[] = [];
const log = defineDriver<string, undefined>({
  name: 'log',
  run: (line) => {
    logged.push(line);
  },
});
const Logger = define<State, Msg>()('test-drivers-logger', {
  ...spec,
  update: { Go: (s: State) => [s, [command(log, 'hello')]] as const, Got: spec.update.Got },
  view: () => html``,
});

type GyralEl = HTMLElement & {
  readonly state: State;
  send(msg: Msg): void;
};

const settle = () => new Promise((r) => setTimeout(r, 0));

async function goOn(el: GyralEl): Promise<readonly string[]> {
  await settled();
  el.send({ _tag: 'Go' });
  await settle();
  return el.state.got;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('tree-scoped driver overrides (gyral-czi.35)', () => {
  it('reaches a component nested in another component’s shadow root', async () => {
    const root = document.createElement('div');
    provideDrivers(root, { echo: fake('tree') });
    root.innerHTML = '<test-drivers-parent></test-drivers-parent>';
    document.body.append(root);
    const parent = root.firstElementChild as GyralEl;
    await settled();
    const leaf = parent.shadowRoot?.querySelector('test-drivers-leaf');
    if (!(leaf instanceof Leaf)) throw new Error('no leaf');
    expect(await goOn(leaf)).toEqual(['tree:x']);
  });

  it('resolves el.drivers, then the nearest provider, then the command’s own driver', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const plain = new Leaf();
    root.append(plain);
    expect(await goOn(plain)).toEqual(['real:x']);

    provideDrivers(root, { echo: fake('tree') });
    const provided = new Leaf();
    root.append(provided);
    expect(await goOn(provided)).toEqual(['tree:x']);

    const own = new Leaf();
    own.drivers = { echo: fake('own') };
    root.append(own);
    expect(await goOn(own)).toEqual(['own:x']);
  });

  it('runs a driver token only with an implementation from a provider or el.drivers', async () => {
    const root = document.createElement('div');
    provideDrivers(root, {
      'echo-token': defineDriver<string, string>({ name: 'echo-token', run: (s) => `tok:${s}` }),
    });
    const viaProvider = new TokenUser();
    root.append(viaProvider);
    document.body.append(root);
    expect(await goOn(viaProvider)).toEqual(['tok:x']);

    const viaOwn = new TokenUser();
    viaOwn.drivers = {
      'echo-token': defineDriver<string, string>({ name: 'echo-token', run: (s) => `own:${s}` }),
    };
    document.body.append(viaOwn);
    expect(await goOn(viaOwn)).toEqual(['own:x']);
  });

  it('reports G0043, naming the driver and component, when nothing provides a token', async () => {
    const errors = collectErrors();
    try {
      const orphan = new TokenUser();
      document.body.append(orphan);
      expect(await goOn(orphan)).toEqual([]);
      expect(errors.errors).toHaveLength(1);
      expect(errors.errors[0]?.phase).toBe('command');
      expect(errors.text()).toMatch(/<test-drivers-token>: no driver provides "echo-token"/);
    } finally {
      errors.stop();
    }
  });

  it('runs a command with no handlers and sends no message', async () => {
    logged.length = 0;
    const el = new Logger();
    document.body.append(el);
    expect(await goOn(el)).toEqual([]);
    expect(logged).toEqual(['hello']);
  });

  it('lets an outer provider supply drivers an inner one lacks; <gyral-drivers> works too', async () => {
    const outer = document.createElement(DRIVERS_ELEMENT) as HTMLElement & { drivers: unknown };
    outer.drivers = { echo: fake('outer') };
    const inner = document.createElement(DRIVERS_ELEMENT) as HTMLElement & { drivers: unknown };
    inner.drivers = { other: fake('inner') };
    const leaf = new Leaf();
    inner.append(leaf);
    outer.append(inner);
    document.body.append(outer);
    expect(await goOn(leaf)).toEqual(['outer:x']);
  });

  it('removes overrides with the returned function', async () => {
    const root = document.createElement('div');
    const remove = provideDrivers(root, { echo: fake('tree') });
    const leaf = new Leaf();
    root.append(leaf);
    document.body.append(root);
    remove();
    expect(await goOn(leaf)).toEqual(['real:x']);
  });
});
