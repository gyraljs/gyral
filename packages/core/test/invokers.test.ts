import { afterEach, describe, expect, it } from 'vitest';
import { define, html, invokersSupported, settled } from '../src/index.js';

interface State {
  readonly items: readonly string[];
  readonly from: string | undefined;
}
type Msg = { readonly _tag: 'Clear'; readonly from: string | undefined };

const List = define<State, Msg>('test-invokers', {
  init: () => ({ items: ['a', 'b'], from: undefined }),
  intent: {
    Clear: ({ command }) =>
      command?.command === '--clear'
        ? { _tag: 'Clear', from: command.source?.localName }
        : undefined,
  },
  update: { Clear: (_s, m) => ({ items: [], from: m.from }) },
  view: (s, i) => html`
    <button type="button" commandfor="items" command="--clear">Clear</button>
    <span class="fake" commandfor="items" command="--clear">Clear (non-button)</span>
    <ul id="items" data-intent=${i.Clear} data-intent-on="command">
      ${s.items.map((item) => html`<li>${item}</li>`)}
    </ul>
  `,
});

async function mount(): Promise<InstanceType<typeof List>> {
  const el = new List();
  document.body.append(el);
  await settled();
  return el;
}

const click = (el: Element, selector: string): void => {
  el.shadowRoot?.querySelector<HTMLElement>(selector)?.click();
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('invoker commands as an intent source (gyral-czi.6)', () => {
  it('parses a native CommandEvent on the commandfor target', async () => {
    expect(invokersSupported()).toBe(true); // Chromium ships invoker commands
    const el = await mount();
    click(el, 'button');
    await settled();
    expect(el.state).toEqual({ items: [], from: 'button' });
  });

  it('does not run the fallback when invokers are native', async () => {
    const el = await mount();
    click(el, '.fake'); // a <span> is not an invoker natively
    await settled();
    expect(el.state.items).toEqual(['a', 'b']);
  });

  it('dispatches an equivalent command event where invokers are missing', async () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'CommandEvent');
    Reflect.deleteProperty(globalThis, 'CommandEvent');
    try {
      expect(invokersSupported()).toBe(false);
      const el = await mount();
      click(el, '.fake'); // only the fallback can turn this click into a command
      await settled();
      expect(el.state).toEqual({ items: [], from: 'span' });
    } finally {
      if (saved !== undefined) Object.defineProperty(globalThis, 'CommandEvent', saved);
    }
  });
});
