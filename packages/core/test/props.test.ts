import { afterEach, describe, expect, it } from 'vitest';
import { command, define, defineDriver, html, prop, settled } from '../src/index.js';

interface Props {
  readonly userId: string;
  readonly label: string;
}
interface State {
  readonly draft: string;
  readonly loadedFor: string;
  readonly saved: readonly string[];
  readonly fetched: readonly string[];
}
type Msg =
  | { readonly _tag: 'Edit' }
  | { readonly _tag: 'Save' }
  | { readonly _tag: 'Loaded'; readonly id: string };

const changes: { props: Props; prev: Props }[] = [];
/** Each render as `props.userId>state.loadedFor:state.fetched`. */
let renders: string[] = [];

const load = defineDriver<string, string>({ name: 'load', run: (id) => id });

const Card = define<State, Msg, Props>()('test-card', {
  props: { userId: prop.string({ required: true }), label: prop.string({ required: true }) },
  init: (props) => ({ draft: '', loadedFor: props.userId, saved: [], fetched: [] }),
  intent: { Save: true },
  update: {
    Edit: (s) => ({ ...s, draft: 'edited' }),
    Save: (s, _m, { props }) => ({ ...s, saved: [...s.saved, `${props.userId}:${s.draft}`] }),
    Loaded: (s, m) => ({ ...s, fetched: [...s.fetched, m.id] }),
    PropsChanged: (s, m) => {
      changes.push({ props: m.props, prev: m.prev });
      if (m.props.userId === m.prev.userId) return s;
      return [
        { ...s, draft: '', loadedFor: m.props.userId },
        [command(load, m.props.userId, { onSuccess: (id) => ({ _tag: 'Loaded', id }) })],
      ];
    },
  },
  view: (s, i, { props }) => {
    renders.push(`${props.userId}>${s.loadedFor}:${s.fetched.join()}`);
    return html`<h2>${props.label}</h2>
      <p>${s.loadedFor}|${s.draft}</p>
      <button data-intent=${i.Save}>Save</button>`;
  },
});

const Plain = define<{ readonly n: number }, never, { readonly label: string }>()('test-plain', {
  props: { label: prop.string({ required: true }) },
  init: () => ({ n: 0 }),
  view: (_s, _i, { props }) => html`<p>${props.label}</p>`,
});

async function mount(): Promise<InstanceType<typeof Card>> {
  const el = new Card();
  Object.assign(el, { userId: 'u1', label: 'First' });
  document.body.append(el);
  await settled();
  return el;
}

const text = (el: Element, sel: string) => el.shadowRoot?.querySelector(sel)?.textContent;

afterEach(() => {
  document.body.replaceChildren();
  changes.length = 0;
  renders = [];
});

describe('props (ADR 0007)', () => {
  it('reads props as context in view and reducers, without PropsChanged on first render', async () => {
    const el = await mount();
    expect(text(el, 'h2')).toBe('First');
    el.send({ _tag: 'Edit' });
    el.send({ _tag: 'Save' });
    expect(el.state.saved).toEqual(['u1:edited']);
    expect(changes).toEqual([]);
  });

  it('sends PropsChanged once per change and renders the new state in the same pass', async () => {
    const el = await mount();
    el.send({ _tag: 'Edit' });
    await settled();
    renders = [];
    Object.assign(el, { userId: 'u2' });
    await settled();
    expect(changes).toHaveLength(1);
    expect(changes[0]?.prev.userId).toBe('u1');
    expect(changes[0]?.props.userId).toBe('u2');
    expect(text(el, 'p')).toBe('u2|');
    // No render shows the new props with the old state; the second is the Loaded result.
    expect(renders).toEqual(['u2>u2:', 'u2>u2:u2']);
  });

  it('runs commands returned from PropsChanged', async () => {
    const el = await mount();
    Object.assign(el, { userId: 'u3' });
    await settled();
    await new Promise((r) => setTimeout(r, 0));
    expect(el.state.fetched).toEqual(['u3']);
  });

  it('keeps state when an unrelated prop changes', async () => {
    const el = await mount();
    el.send({ _tag: 'Edit' });
    Object.assign(el, { label: 'Second' });
    await settled();
    expect(text(el, 'h2')).toBe('Second');
    expect(el.state.draft).toBe('edited');
  });

  it('works without a PropsChanged reducer', async () => {
    const el = new Plain();
    el.setAttribute('label', 'a');
    document.body.append(el);
    await settled();
    el.setAttribute('label', 'b');
    await settled();
    expect(text(el, 'p')).toBe('b');
  });
});

describe('honest prop types (ADR 0007 addendum)', () => {
  interface BadgeProps {
    readonly label: string;
    readonly size: number;
    readonly note?: string | undefined;
  }

  const Badge = define<{ readonly n: number }, never, BadgeProps>()('test-badge', {
    props: {
      label: prop.string({ required: true }),
      size: prop.number({ default: 3 }),
      note: prop.string(),
    },
    init: () => ({ n: 0 }),
    view: (_s, _i, { props }) =>
      html`<p>${props.label}|${String(props.size)}|${props.note ?? '-'}</p>`,
  });

  it('fills unset props from their default, without changing the element', async () => {
    const el = new Badge();
    el.label = 'Sale';
    document.body.append(el);
    await settled();
    expect(text(el, 'p')).toBe('Sale|3|-');
    expect((el as unknown as { size: unknown }).size).toBeUndefined();
    el.size = 5;
    await settled();
    expect(text(el, 'p')).toBe('Sale|5|-');
  });

  it('warns once when a required prop is missing at first render', async () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    try {
      const el = new Badge();
      document.body.append(el);
      await settled();
      el.size = 4;
      await settled();
    } finally {
      console.warn = original;
    }
    expect(warnings).toEqual([
      '<test-badge> is missing required prop(s): label. (G0022: https://gyral.dev/errors/#G0022)',
    ]);
  });

  it('rejects declarations that leave an always-present prop unguaranteed (types)', () => {
    define<{ readonly n: number }, never, { readonly code: string }>()('test-badge-types', {
      // @ts-expect-error -- `code: string` needs `required: true` or a `default`
      props: { code: prop.string() },
      init: () => ({ n: 0 }),
      view: () => html``,
    });
  });

  it('rejects a prop that shadows a built-in element property in development (view/05)', () => {
    const shadowing = () =>
      define()('test-shadowing-props', {
        // @ts-expect-error -- hidden and title are HTMLElement's (the type rejects them too)
        props: { hidden: prop.boolean(), title: prop.string(), label: prop.string() },
        init: () => ({ n: 0 }),
        view: () => html``,
      });
    expect(shadowing).toThrow(/<test-shadowing-props>.*hidden, title/);
    expect(shadowing).not.toThrow(/label/);
  });

  // gyral-k97.5: a prop named `state` replaced the element's model getter, silently.
  it("rejects a prop named like one of Gyral's members or a callback, in development", () => {
    const named = (props: object) => () =>
      define()(`test-reserved-${String(Object.keys(props).length)}`, {
        props,
        init: () => ({ n: 0 }),
        view: () => html``,
      });
    expect(named({ state: prop.string(), send: prop.string() })).toThrow(
      /<test-reserved-2>.*state, send.*hides the component's model.*attribute: "state"/,
    );
    expect(named({ drivers: prop.string(), stores: prop.string(), x: prop.string() })).toThrow(
      /drivers, stores/,
    );
    expect(named({ connectedCallback: prop.string() })).toThrow(/connectedCallback/);
    expect(() =>
      define()('test-reserved-types', {
        // @ts-expect-error -- `state` is the element's model (a type error too)
        props: { state: prop.string() },
        init: () => ({ n: 0 }),
        view: () => html``,
      }),
    ).toThrow(/state/);
  });

  it('keeps a reserved name as the attribute, with the property renamed', async () => {
    const Badge = define()('test-reserved-badge', {
      props: { badge: prop.string({ attribute: 'state' }) },
      view: (_s, _i, ctx) => html`<b>${ctx.props.badge}</b>`,
    });
    const el = document.createElement('test-reserved-badge') as InstanceType<typeof Badge>;
    el.setAttribute('state', 'open');
    document.body.append(el);
    await settled();
    expect(el).toBeInstanceOf(Badge);
    expect(el.badge).toBe('open');
    expect(el.state).toEqual({});
    expect(el.shadowRoot?.textContent).toBe('open');
    el.remove();
  });
});
