// A parser that returns undefined synchronously declines (gyral-dyn.25, view/05-element.md
// "Declining"): the next intent outward for the same event gets it, up to the component root.
// A toolbar handles its arrow-key shortcuts around inputs that keep their own keys.
import { afterEach, describe, expect, it } from 'vitest';
import { define, html, intents, settled } from '../src/index.js';

type Msg =
  | { readonly _tag: 'Shortcut'; readonly key: string }
  | { readonly _tag: 'Field'; readonly key: string }
  | { readonly _tag: 'Later'; readonly key: string }
  | { readonly _tag: 'Clicked'; readonly where: string };
type InnerMsg = { readonly _tag: 'Inner'; readonly key: string };

interface State {
  readonly log: readonly string[];
}

const i = intents<Msg>();
const add = (s: State, entry: string): State => ({ log: [...s.log, entry] });

const inner = intents<InnerMsg>();

// The inner component handles Enter itself and declines every other key.
define<State, InnerMsg>('test-decline-inner', {
  init: () => ({ log: [] }),
  intent: {
    Inner: ({ key }) => (key === 'Enter' ? { _tag: 'Inner', key } : undefined),
  },
  update: { Inner: (s, m) => add(s, `inner:${m.key}`) },
  view: () =>
    html`<input id="nested" data-intent-keydown=${inner.Inner} aria-label="nested field" />`,
});

const Toolbar = define<State, Msg>('test-decline', {
  init: () => ({ log: [] }),
  intent: {
    // The container's shortcuts: arrow keys only.
    Shortcut: ({ key }) =>
      key === 'ArrowLeft' || key === 'ArrowRight' ? { _tag: 'Shortcut', key } : undefined,
    // The field keeps Enter, and declines everything else.
    Field: ({ key }) => (key === 'Enter' ? { _tag: 'Field', key } : undefined),
    // An async parser never declines, even when it resolves to undefined.
    Later: async ({ key }) => {
      await Promise.resolve();
      return key === 'Enter' ? { _tag: 'Later', key } : undefined;
    },
    // A plain data-intent with a keydown trigger, inside a per-event container.
    Clicked: ({ target }) => ({ _tag: 'Clicked', where: target.id }),
  },
  update: {
    Shortcut: (s, m) => add(s, `shortcut:${m.key}`),
    Field: (s, m) => add(s, `field:${m.key}`),
    Later: (s, m) => add(s, `later:${m.key}`),
    Clicked: (s, m) => add(s, `clicked:${m.where}`),
  },
  view: () => html`
    <div role="toolbar" data-intent-keydown=${i.Shortcut}>
      <input id="field" data-intent-keydown=${i.Field} aria-label="field" />
      <input id="later" data-intent-keydown=${i.Later} aria-label="later" />
      <button id="trigger" data-intent=${i.Clicked} data-intent-on="keydown">Go</button>
      <test-decline-inner></test-decline-inner>
    </div>
  `,
});

type ToolbarElement = HTMLElement & { readonly state: State };

let el: ToolbarElement;

async function mount(): Promise<ToolbarElement> {
  el = new Toolbar();
  document.body.append(el);
  await settled();
  return el;
}

const press = async (target: Element, key: string): Promise<void> => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
  await settled();
};

const $ = (sel: string): Element => {
  const found = el.shadowRoot?.querySelector(sel);
  if (found == null) throw new Error(sel);
  return found;
};

afterEach(() => {
  el.remove();
});

describe('a parser that returns undefined declines', () => {
  it('passes the event to the next intent outward', async () => {
    await mount();
    await press($('#field'), 'ArrowRight');
    expect(el.state.log).toEqual(['shortcut:ArrowRight']);
  });

  it('a parser that returns a message keeps the event', async () => {
    await mount();
    await press($('#field'), 'Enter');
    expect(el.state.log).toEqual(['field:Enter']);
  });

  it('nothing happens when every intent on the path declines', async () => {
    await mount();
    await press($('#field'), 'a');
    expect(el.state.log).toEqual([]);
  });

  it('an async parser never declines', async () => {
    await mount();
    await press($('#later'), 'ArrowLeft');
    await settled();
    expect(el.state.log).toEqual([]);
    await press($('#later'), 'Enter');
    await settled();
    expect(el.state.log).toEqual(['later:Enter']);
  });

  it('a data-intent triggered by the event takes it before the container', async () => {
    await mount();
    await press($('#trigger'), 'ArrowLeft');
    expect(el.state.log).toEqual(['clicked:trigger']);
  });

  it('a nested component declines within its own root; the outer one handles it once', async () => {
    await mount();
    const inner = $('test-decline-inner') as HTMLElement & { readonly state: State };
    const nested = inner.shadowRoot?.querySelector('#nested');
    if (nested == null) throw new Error('#nested');
    await press(nested, 'Enter');
    expect(inner.state.log).toEqual(['inner:Enter']);
    expect(el.state.log).toEqual([]);
    // The inner walk ends at its own root. The toolbar's container intent sees the key through
    // its own listener (the nested host is inside it), exactly once.
    await press(nested, 'ArrowRight');
    expect(inner.state.log).toEqual(['inner:Enter']);
    expect(el.state.log).toEqual(['shortcut:ArrowRight']);
  });
});
