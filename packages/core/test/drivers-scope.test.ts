import { afterEach, describe, expect, it } from 'vitest';
import {
  command,
  define,
  defineDriver,
  DRIVERS_ELEMENT,
  html,
  provideDrivers,
  settled,
  type AnyDriver,
} from '../src/index.js';

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
  intent: {},
  update: {
    Go: (s: State) => [s, [echo()]] as const,
    Got: (s: State, m: { readonly text: string }) => ({ got: [...s.got, m.text] }),
  },
};

// A leaf component, and a parent that renders it inside its own shadow root.
const Leaf = define<State, Msg>('test-drivers-leaf', {
  ...spec,
  view: (s) => html`<p>${s.got.join(',')}</p>`,
});
define<State, Msg>('test-drivers-parent', {
  ...spec,
  view: () => html`<test-drivers-leaf></test-drivers-leaf>`,
});
const WithSpec = define<State, Msg>('test-drivers-spec', {
  ...spec,
  view: () => html``,
  drivers: { echo: fake('spec') },
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

  it('resolves el.drivers, then the provider, then spec.drivers, then the command’s driver', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const plain = new Leaf();
    root.append(plain);
    expect(await goOn(plain)).toEqual(['real:x']);

    provideDrivers(root, { echo: fake('tree') });
    const withSpec = new WithSpec();
    root.append(withSpec);
    expect(await goOn(withSpec)).toEqual(['tree:x']);

    const own = new Leaf();
    own.drivers = { echo: fake('own') };
    root.append(own);
    expect(await goOn(own)).toEqual(['own:x']);
  });

  it('falls through to spec.drivers when no provider has the driver', async () => {
    const withSpec = new WithSpec();
    document.body.append(withSpec);
    expect(await goOn(withSpec)).toEqual(['spec:x']);
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
