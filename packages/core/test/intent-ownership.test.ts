// Who an intent belongs to across component boundaries (gyral-1zd.27, ADR 0010 addendum):
// content slotted into a shadow-DOM child stays the outer component's (forms, child
// components), and a child's output reaches only its direct parent.
import { afterEach, describe, expect, it } from 'vitest';
import { child, define, html, outputs, settled } from '../src/index.js';

type Out = { readonly _tag: 'Poked' };
const poke = outputs<Out>();

// A leaf that emits `Poked` when its button is clicked.
const Leaf = define<null, { readonly _tag: 'Poke' }, object, Out>()('test-own-leaf', {
  init: () => null,
  intent: { Poke: () => ({ _tag: 'Poke' }) },
  update: { Poke: (s) => [s, [poke({ _tag: 'Poked' })]] },
  view: (_s, i) => html`<button type="button" data-intent=${i.Poke}>poke</button>`,
});

// A shadow-DOM card that only slots its content.
const Card = define<null>()('test-own-card', {
  init: () => null,
  view: () => html`<article><slot></slot></article>`,
});

// A light-DOM middle component that takes its leaf's output and re-emits its own.
type MiddleOut = { readonly _tag: 'Relayed' };
const relay = outputs<MiddleOut>();
const Middle = define<{ readonly got: number }, { readonly _tag: 'FromLeaf' }, object, MiddleOut>()(
  'test-own-middle',
  {
    shadow: false,
    init: () => ({ got: 0 }),
    intent: { FromLeaf: child(Leaf, () => ({ _tag: 'FromLeaf' })) },
    update: { FromLeaf: (s) => [{ got: s.got + 1 }, [relay({ _tag: 'Relayed' })]] },
    view: (_s, i) => html`<test-own-leaf data-intent=${i.FromLeaf}></test-own-leaf>`,
  },
);

interface State {
  readonly relayed: number;
  readonly slotted: number;
  readonly saved: string;
}
type Msg =
  | { readonly _tag: 'FromMiddle'; readonly tag: string }
  | { readonly _tag: 'FromSlotted' }
  | { readonly _tag: 'Save'; readonly q: string };

const Outer = define<State, Msg>()('test-own-outer', {
  init: () => ({ relayed: 0, slotted: 0, saved: '' }),
  intent: {
    // child() would accept any output detail dispatched with the middle host as its target; the
    // runtime must hand it only the middle's own outputs, never the leaf's passing through.
    FromMiddle: (input) => ({ _tag: 'FromMiddle', tag: (input.detail as { _tag: string })._tag }),
    FromSlotted: child(Leaf, () => ({ _tag: 'FromSlotted' })),
    Save: ({ formData }) => {
      const q = formData?.get('q');
      return { _tag: 'Save', q: typeof q === 'string' ? q : '' };
    },
  },
  update: {
    FromMiddle: (s, m) => ({ ...s, relayed: s.relayed + (m.tag === 'Relayed' ? 1 : 100) }),
    FromSlotted: (s) => ({ ...s, slotted: s.slotted + 1 }),
    Save: (s, m) => ({ ...s, saved: m.q }),
  },
  view: (_s, i) => html`
    <test-own-middle data-intent=${i.FromMiddle}></test-own-middle>
    <test-own-card>
      <test-own-leaf class="slotted" data-intent=${i.FromSlotted}></test-own-leaf>
      <form data-intent=${i.Save}><input name="q" value="hello" /><button>save</button></form>
    </test-own-card>
  `,
});

type OuterElement = InstanceType<typeof Outer> & { readonly state: State };

async function mount(): Promise<OuterElement> {
  expect([Card, Middle].map((c) => c.tagName)).toEqual(['test-own-card', 'test-own-middle']);
  const el = new Outer();
  document.body.append(el);
  await settled();
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('intent ownership', () => {
  it("gives a child's output to its direct parent only, never a grandparent", async () => {
    const outer = await mount();
    const middle = outer.shadowRoot?.querySelector('test-own-middle') as HTMLElement & {
      readonly state: { readonly got: number };
    };
    middle.querySelector('test-own-leaf')?.shadowRoot?.querySelector('button')?.click();
    await settled();
    expect(middle.state.got).toBe(1);
    // The outer component saw the middle's own output once, not the leaf's passing through.
    expect(outer.state.relayed).toBe(1);
  });

  it('delivers the output of a child slotted into a shadow-DOM card to the outer component', async () => {
    const outer = await mount();
    const leaf = outer.shadowRoot?.querySelector('test-own-leaf.slotted');
    leaf?.shadowRoot?.querySelector('button')?.click();
    await settled();
    expect(outer.state.slotted).toBe(1);
  });

  it('cancels native submit of a slotted form and parses it for the outer component', async () => {
    const outer = await mount();
    const form = outer.shadowRoot?.querySelector('form') as HTMLFormElement;
    let prevented: boolean | undefined;
    form.addEventListener('submit', (e) => {
      prevented = e.defaultPrevented;
    });
    form.querySelector('button')?.click();
    await settled();
    expect(prevented).toBe(true);
    expect(outer.state.saved).toBe('hello');
  });
});
