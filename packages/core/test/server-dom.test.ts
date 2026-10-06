// Server-rendered DOM until hydration exists (Phase 5, gyral-g1r.10): a host that connects
// with a `data-gyral-seed` resumes its state and props from the seed, clears the server's DOM
// and renders fresh. Islands (`defer-hydration` + `data-gyral-hydrate`) wait for their trigger.
import { afterEach, describe, expect, it } from 'vitest';
import { css, define, html, prop, settled } from '../src/index.js';

interface State {
  readonly count: number;
}
type Msg = { readonly _tag: 'Inc' };

const spec = {
  props: { label: prop.string({ default: '' }) },
  init: (): State => ({ count: 0 }),
  intent: { Inc: () => ({ _tag: 'Inc' }) as const },
  update: { Inc: (s: State) => ({ count: s.count + 1 }) },
  view: (s: State, i: { readonly Inc: 'Inc' }, { props }: { readonly props: { label: string } }) =>
    html`<button data-intent=${i.Inc}>${props.label}:${s.count}</button>`,
};

define<State, Msg, { readonly label: string }>('test-sd-shadow', {
  ...spec,
  styles: css`
    button {
      color: rgb(4, 5, 6);
    }
  `,
});
define<State, Msg, { readonly label: string }>('test-sd-light', { ...spec, shadow: false });
define<State, Msg, { readonly label: string }>('test-sd-island', {
  ...spec,
  hydrate: 'interaction',
});

type Live = HTMLElement & { readonly state: State };

function mount(markup: string): HTMLElement {
  const root = document.createElement('div');
  root.setHTMLUnsafe(markup); // parses declarative shadow roots, like a page load
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('server-rendered DOM (until Phase 5)', () => {
  it('resumes a shadow host from its seed, then replaces the declarative shadow root content', async () => {
    const root = mount(
      `<test-sd-shadow label="srv" data-gyral-seed='{"state":{"count":4},"props":{}}'>` +
        '<template shadowrootmode="open"><style>button{color:red}</style>' +
        '<button data-intent="Inc">srv:4</button><em>stale</em></template></test-sd-shadow>',
    );
    const el = root.querySelector('test-sd-shadow') as Live;
    await settled();
    expect(el.state.count).toBe(4);
    expect(el.hasAttribute('data-gyral-seed')).toBe(false);
    expect(el.shadowRoot?.querySelector('em')).toBeNull();
    expect(el.shadowRoot?.querySelector('style')).toBeNull();
    const button = el.shadowRoot?.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('srv:4');
    expect(getComputedStyle(button).color).toBe('rgb(4, 5, 6)');
    button.click();
    await settled();
    expect(button.textContent).toBe('srv:5');
  });

  it("replaces a light host's server children", async () => {
    const root = mount(
      `<test-sd-light data-gyral-light data-gyral-seed='{"props":{"label":"p"}}'>` +
        '<button data-intent="Inc">p:0</button><em>stale</em></test-sd-light>',
    );
    const el = root.querySelector('test-sd-light') as Live;
    await settled();
    expect(el.querySelector('em')).toBeNull();
    expect(el.querySelectorAll('button')).toHaveLength(1);
    expect(el.textContent).toBe('p:0');
  });

  it('keeps an island as server DOM until its strategy fires, then renders fresh', async () => {
    const root = mount(
      `<test-sd-island defer-hydration data-gyral-hydrate="interaction" ` +
        `data-gyral-seed='{"state":{"count":2},"props":{"label":"i"}}'>` +
        '<template shadowrootmode="open"><button data-intent="Inc">i:2</button><em>s</em>' +
        '</template></test-sd-island>',
    );
    const el = root.querySelector('test-sd-island') as Live;
    await settled();
    expect(el.shadowRoot?.querySelector('em')).not.toBeNull(); // still the server's DOM
    el.shadowRoot
      ?.querySelector('button')
      ?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, composed: true }));
    await settled();
    expect(el.hasAttribute('defer-hydration')).toBe(false);
    expect(el.shadowRoot?.querySelector('em')).toBeNull();
    expect(el.shadowRoot?.querySelector('button')?.textContent).toBe('i:2');
  });
});
