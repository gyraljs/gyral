// Hosts hydrating server DOM (view/07-hydration.md "Steps, per host", view/08-styles.md
// "Hydration", view/05-element.md "Lifecycle"): a host that connects with a seed and a
// non-empty root resumes its state and adopts the server's nodes; a shadow root swaps its
// server <style> for the shared sheet in the same step; each host hydrates on its own, before
// or after its parent; islands keep the server DOM until released, then hydrate in place.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { css, define, html, prop, settled } from '../src/index.js';

interface State {
  readonly count: number;
}
type Msg = { readonly _tag: 'Inc' } | { readonly _tag: 'PropsChanged' };

let propsChanged = 0;
const spec = {
  props: { label: prop.string({ default: '' }) },
  init: (): State => ({ count: 0 }),
  intent: { Inc: () => ({ _tag: 'Inc' }) as const },
  update: {
    Inc: (s: State) => ({ count: s.count + 1 }),
    PropsChanged: (s: State) => {
      propsChanged++;
      return s;
    },
  },
  view: (s: State, i: { readonly Inc: 'Inc' }, { props }: { readonly props: { label: string } }) =>
    html`<button data-intent=${i.Inc}>${props.label}:${s.count}</button>`,
};
type P = { readonly label: string };
define<State, Msg, P>()('test-eh-shadow', {
  ...spec,
  styles: css`
    button {
      color: rgb(4, 5, 6);
    }
  `,
});
define<State, Msg, P>()('test-eh-light', { ...spec, shadow: false });
define<State, Msg, P>()('test-eh-island', { ...spec, hydrate: 'interaction' });

type Live = HTMLElement & { readonly state: State };

function mount(markup: string): HTMLElement {
  const root = document.createElement('div');
  root.setHTMLUnsafe(markup); // parses declarative shadow roots, like a page load
  document.body.append(root);
  return root;
}

const shadow = (attrs: string, seed: string, body: string, style = true) =>
  `<test-eh-shadow ${attrs} data-gyral-seed='${seed}'><template shadowrootmode="open">` +
  `${style ? '<style>button{color:red}</style>' : ''}${body}</template></test-eh-shadow>`;

afterEach(() => {
  document.body.replaceChildren();
  propsChanged = 0;
});

describe('a server-rendered shadow host', () => {
  it('resumes from its seed and hydrates in place, swapping its <style> for the shared sheet', async () => {
    const root = mount(
      shadow(
        'label="srv"',
        '{"state":{"count":4},"props":{}}',
        '<button data-intent="Inc">srv<!---->:4</button>',
      ),
    );
    const el = root.querySelector('test-eh-shadow') as Live;
    const button = el.shadowRoot?.querySelector('button') as HTMLButtonElement;
    const text = button.firstChild;
    await settled();
    expect(el.state.count).toBe(4);
    expect(el.hasAttribute('data-gyral-seed')).toBe(false);
    expect(el.shadowRoot?.querySelector('style')).toBeNull();
    expect(el.shadowRoot?.adoptedStyleSheets).toHaveLength(1);
    expect(el.shadowRoot?.querySelector('button')).toBe(button);
    expect(button.firstChild).toBe(text); // "srv" split off the server's "srv:4"
    expect(getComputedStyle(button).color).toBe('rgb(4, 5, 6)');
    button.click();
    await settled();
    expect(button.textContent).toBe('srv:5');
    expect(el.shadowRoot?.childNodes).toHaveLength(1); // no <style>, no second copy
  });

  it('renders fresh when it has a seed but no declarative shadow root, or DSD without a seed', async () => {
    const root = mount(
      `<test-eh-shadow label="a" data-gyral-seed='{"state":{"count":7},"props":{}}'></test-eh-shadow>` +
        '<test-eh-shadow label="b"><template shadowrootmode="open"><em>static</em></template></test-eh-shadow>',
    );
    await settled();
    const [a, b] = [...root.children] as Live[];
    expect(a?.shadowRoot?.textContent).toBe('a:7');
    expect(b?.shadowRoot?.innerHTML).toBe('<button data-intent="Inc">b<!---->:0</button>');
  });
});

describe('a server-rendered light host', () => {
  it('adopts its own children in place', async () => {
    const root = mount(
      `<test-eh-light data-gyral-light data-gyral-seed='{"props":{"label":"p"}}'>` +
        '<button data-intent="Inc">p<!---->:0</button></test-eh-light>',
    );
    const el = root.querySelector('test-eh-light') as Live;
    const button = el.querySelector('button');
    await settled();
    expect(el.querySelector('button')).toBe(button);
    expect(el.childNodes).toHaveLength(1);
    expect(button?.childNodes).toHaveLength(4); // "p", the anchor, ":" and "0"
    button?.click();
    await settled();
    expect(el.textContent).toBe('p:1');
  });
});

describe('each host hydrates on its own (07)', () => {
  const parentView = (label: string) =>
    html`<section>
      <test-eh-shadow label=${label}><b>slotted ${label}</b></test-eh-shadow>
    </section>`;
  const markup = (label: string) =>
    `<test-eh-parent data-gyral-seed='{"props":{}}'><template shadowrootmode="open"><section>` +
    shadow(
      `label="${label}"`,
      '{"props":{}}',
      `<button data-intent="Inc">${label}<!---->:0</button>`,
      true,
    ) +
    `</section></template></test-eh-parent>`;

  it('a parent walks its child host and the slotted children, never the child shadow root', async () => {
    // The child's slotted content is the parent's: it comes after the child's <template>.
    const page = markup('x').replace(
      '</template></test-eh-shadow>',
      '</template><b>slotted x</b></test-eh-shadow>',
    );
    define<object, never>()('test-eh-parent', {
      init: () => ({}),
      intent: {},
      update: {},
      view: () => parentView('x'),
    });
    const root = mount(page);
    const parent = root.querySelector('test-eh-parent') as Live;
    const child = parent.shadowRoot?.querySelector('test-eh-shadow') as Live;
    const slotted = child.querySelector('b');
    const button = child.shadowRoot?.querySelector('button');
    const errors = vi.spyOn(console, 'error');
    await settled();
    expect(errors).not.toHaveBeenCalled();
    expect(parent.shadowRoot?.querySelector('test-eh-shadow')).toBe(child);
    expect(child.querySelector('b')).toBe(slotted);
    expect(child.shadowRoot?.querySelector('button')).toBe(button);
    expect(propsChanged).toBe(0);
  });

  it('a child defined (and hydrated) before its parent still lets the parent hydrate', async () => {
    const page = markup('y').replace(
      '</template></test-eh-shadow>',
      '</template><b>slotted y</b></test-eh-shadow>',
    );
    const root = mount(page.replaceAll('test-eh-parent', 'test-eh-late'));
    await settled(); // the child hydrates first: its parent isn't defined yet
    const late = root.querySelector('test-eh-late') as Live;
    const child = late.shadowRoot?.querySelector('test-eh-shadow') as Live;
    expect(child.hasAttribute('data-gyral-seed')).toBe(false);
    define<object, never>()('test-eh-late', {
      init: () => ({}),
      intent: {},
      update: {},
      view: () => parentView('y'),
    });
    const errors = vi.spyOn(console, 'error');
    await settled();
    expect(errors).not.toHaveBeenCalled();
    expect(late.shadowRoot?.querySelector('test-eh-shadow')).toBe(child);
    expect(late.hasAttribute('data-gyral-seed')).toBe(false);
  });
});

describe('islands', () => {
  it('keep the server DOM until their strategy fires, then hydrate in place', async () => {
    const root = mount(
      `<test-eh-island label="i" defer-hydration data-gyral-hydrate="interaction" ` +
        `data-gyral-seed='{"state":{"count":2},"props":{}}'>` +
        '<template shadowrootmode="open"><button data-intent="Inc">i<!---->:2</button></template></test-eh-island>',
    );
    const el = root.querySelector('test-eh-island') as Live;
    const button = el.shadowRoot?.querySelector('button') as HTMLButtonElement;
    await settled();
    expect(el.state.count).toBe(2); // resumed on connect (05), but not hydrated
    expect(el.shadowRoot?.adoptedStyleSheets).toHaveLength(0);
    button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, composed: true }));
    await settled();
    expect(el.hasAttribute('defer-hydration')).toBe(false);
    expect(el.shadowRoot?.querySelector('button')).toBe(button);
    expect(el.state.count).toBe(2);
    button.click();
    await settled();
    expect(button.textContent).toBe('i:3');
  });
});
