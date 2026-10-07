// settled() (docs/design-docs/view/04-scheduler.md): one wait for all rendering, including
// child props, outputs, focus commands and view-transition updates.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { child, define, emit, focus, html, prop, settled } from '../src/index.js';

type KidOut = { readonly _tag: 'Grown'; readonly size: number };
type KidMsg = { readonly _tag: 'Grow' };

const Kid = define<{ readonly grown: number }, KidMsg, { readonly label: string }, KidOut>(
  'test-settled-kid',
  {
    props: { label: prop.string({ attribute: false, default: '' }) },
    init: () => ({ grown: 0 }),
    intent: {},
    update: {
      Grow: (s) => [{ grown: s.grown + 1 }, [emit({ _tag: 'Grown', size: s.grown + 1 })]],
    },
    view: (s, _i, { props }) => html`<b>${props.label}:${s.grown}</b>`,
  },
);

type ParentMsg =
  | { readonly _tag: 'Rename'; readonly label: string }
  | { readonly _tag: 'Kid'; readonly size: number }
  | { readonly _tag: 'Go'; readonly page: string };
interface ParentState {
  readonly label: string;
  readonly kidSize: number;
  readonly page: string;
}

const Parent = define<ParentState, ParentMsg>('test-settled-parent', {
  init: () => ({ label: 'first', kidSize: 0, page: 'home' }),
  intent: { Kid: child(Kid, (out) => ({ _tag: 'Kid', size: out.size })) },
  update: {
    Rename: (s, m) => ({ ...s, label: m.label }),
    Kid: (s, m) => ({ ...s, kidSize: m.size }),
    Go: (s, m) => [{ ...s, page: m.page }, [focus('h1')]],
  },
  viewTransition: (prev, next) => prev.page !== next.page,
  view: (s, i) => html`
    <h1 tabindex="-1">${s.page}</h1>
    <p>${s.kidSize}</p>
    <test-settled-kid .label=${s.label} data-intent=${i.Kid}></test-settled-kid>
  `,
});

type KidEl = InstanceType<typeof Kid>;

async function mount() {
  const el = new Parent();
  document.body.append(el);
  await settled();
  const kid = el.shadowRoot?.querySelector('test-settled-kid') as KidEl;
  return { el, kid };
}

const text = (root: ShadowRoot | null, selector: string) =>
  root?.querySelector(selector)?.textContent;

// Like real browsers, the update callback runs in a later task, not synchronously.
function stubAsyncTransitions(): string[] {
  const calls: string[] = [];
  vi.spyOn(document, 'startViewTransition').mockImplementation(
    (update?: ViewTransitionUpdateCallback | StartViewTransitionOptions) => {
      calls.push('start');
      const done = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const run: unknown = typeof update === 'function' ? update() : undefined;
          Promise.resolve(run).then(() => {
            resolve();
          }, reject);
        }, 10);
      });
      return {
        ready: done,
        finished: done,
        updateCallbackDone: done,
        skipTransition: () => undefined,
        types: new Set<string>(),
      };
    },
  );
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () => ({ matches: false }) as unknown as MediaQueryList,
  );
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('settled()', () => {
  it('resolves when nothing is pending', async () => {
    await expect(settled()).resolves.toBeUndefined();
    await mount();
    await expect(settled()).resolves.toBeUndefined();
  });

  it('waits for a parent render and the child render its new props cause', async () => {
    const { el, kid } = await mount();
    expect(text(kid.shadowRoot, 'b')).toBe('first:0');
    el.send({ _tag: 'Rename', label: 'second' });
    await settled();
    expect(text(kid.shadowRoot, 'b')).toBe('second:0');
  });

  it("waits for an output to reach the parent and for the parent's render", async () => {
    const { el, kid } = await mount();
    kid.send({ _tag: 'Grow' });
    await settled();
    expect(text(kid.shadowRoot, 'b')).toBe('first:1');
    expect(text(el.shadowRoot, 'p')).toBe('1');
  });

  it('waits for a view-transition update and the focus command it carries', async () => {
    const calls = stubAsyncTransitions();
    const { el } = await mount();
    el.send({ _tag: 'Go', page: 'about' });
    await settled();
    expect(calls).toEqual(['start']);
    expect(text(el.shadowRoot, 'h1')).toBe('about');
    expect(el.shadowRoot?.activeElement).toBe(el.shadowRoot?.querySelector('h1'));
  });

  it('ignores disconnected hosts', async () => {
    const { el } = await mount();
    el.remove();
    el.send({ _tag: 'Rename', label: 'gone' });
    await expect(settled()).resolves.toBeUndefined();
  });
});
