// Parsers get the reducers' read-only context (gyral-dyn.17, ADR 0001 addendum): `(input, ctx)`
// with props as they are when the event fires and `read(store)`, so a parser can decide
// synchronously whether to call preventDefault from props.
import { afterEach, describe, expect, it } from 'vitest';
import {
  define,
  defineStore,
  html,
  prop,
  resetDocumentStores,
  send,
  settled,
} from '../src/index.js';

const layout = defineStore<{ readonly locked: boolean }, { readonly _tag: 'Lock' }>(
  'test-parser-ctx-layout',
  {
    init: () => ({ locked: false }),
    update: { Lock: () => ({ locked: true }) },
  },
);

interface Props {
  readonly keys: string;
}
type Msg = { readonly _tag: 'Key'; readonly key: string } | { readonly _tag: 'LockAll' };

const Keys = define<{ readonly log: readonly string[] }, Msg, Props>('test-parser-ctx', {
  props: { keys: prop.string({ default: 'ArrowLeft ArrowRight' }) },
  stores: [layout],
  init: () => ({ log: [] }),
  intent: {
    // Only keys this instance owns are taken over; the rest keep their default.
    Key: ({ key, event }, { props, read }) => {
      if (key === undefined || read(layout).locked || !props.keys.split(' ').includes(key)) {
        return undefined;
      }
      event.preventDefault();
      return { _tag: 'Key', key };
    },
    // A one-parameter parser still fits.
    LockAll: () => ({ _tag: 'LockAll' }),
  },
  update: {
    Key: (s, m) => ({ log: [...s.log, m.key] }),
    LockAll: (s) => [s, [send(layout, { _tag: 'Lock' })]],
  },
  view: (_s, i) => html`
    <div tabindex="0" data-intent-keydown=${i.Key}>pad</div>
    <button type="button" data-intent=${i.LockAll}>lock</button>
  `,
});

type KeysElement = HTMLElement & { readonly state: { readonly log: readonly string[] } };

async function mount(): Promise<KeysElement> {
  const el = new Keys() as KeysElement;
  document.body.append(el);
  await settled();
  return el;
}

const press = (el: HTMLElement, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  el.shadowRoot?.querySelector('div')?.dispatchEvent(event);
  return event;
};

afterEach(() => {
  document.body.replaceChildren();
  resetDocumentStores();
});

describe('parsers read ctx', () => {
  it('decides preventDefault from props, as they are when the event fires', async () => {
    const el = await mount();
    expect(press(el, 'ArrowLeft').defaultPrevented).toBe(true);
    expect(press(el, 'ArrowUp').defaultPrevented).toBe(false);
    el.setAttribute('keys', 'ArrowUp'); // no render in between
    expect(press(el, 'ArrowUp').defaultPrevented).toBe(true);
    expect(press(el, 'ArrowLeft').defaultPrevented).toBe(false);
    await settled();
    expect(el.state.log).toEqual(['ArrowLeft', 'ArrowUp']);
  });

  it('reads stores the component lists', async () => {
    const el = await mount();
    el.shadowRoot?.querySelector('button')?.click();
    await settled();
    expect(press(el, 'ArrowLeft').defaultPrevented).toBe(false);
  });
});
