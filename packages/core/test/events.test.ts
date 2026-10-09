import { afterEach, describe, expect, it } from 'vitest';
import { define, html, settled } from '../src/index.js';

type Msg =
  | { readonly _tag: 'Key'; readonly key: string }
  | { readonly _tag: 'Left' }
  | { readonly _tag: 'Toggled'; readonly open: boolean }
  | { readonly _tag: 'Pressed' };

const Keys = define<{ readonly log: readonly string[] }, Msg>()('test-events', {
  init: () => ({ log: [] }),
  events: ['pointerdown'],
  intent: {
    Key: ({ key, event }) => {
      if (key !== 'ArrowDown' && key !== 'Escape') return undefined;
      event.preventDefault(); // parsers may cancel default input handling (ADR 0001)
      return { _tag: 'Key', key };
    },
    Left: () => ({ _tag: 'Left' }),
    Toggled: ({ newState }) => ({ _tag: 'Toggled', open: newState === 'open' }),
    Pressed: () => ({ _tag: 'Pressed' }),
  },
  update: {
    Key: (s, m) => ({ log: [...s.log, `key:${m.key}`] }),
    Left: (s) => ({ log: [...s.log, 'left'] }),
    Toggled: (s, m) => ({ log: [...s.log, m.open ? 'open' : 'closed'] }),
    Pressed: (s) => ({ log: [...s.log, 'pressed'] }),
  },
  view: (_s, i) => html`
    <div data-intent=${i.Left} data-intent-on="focusout">
      <input data-intent=${i.Key} data-intent-on="keydown" />
    </div>
    <details data-intent=${i.Toggled} data-intent-on="toggle">
      <summary>s</summary>
      x
    </details>
    <span data-intent=${i.Pressed} data-intent-on="pointerdown">p</span>
  `,
});

async function mount() {
  const el = new Keys();
  document.body.append(el);
  await settled();
  const $ = <T extends Element>(sel: string, type: new () => T): T => {
    const found = el.shadowRoot?.querySelector(sel);
    if (!(found instanceof type)) throw new Error(sel);
    return found;
  };
  return { el, $ };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('extra intent events', () => {
  it('parses keydown with the key and lets the parser prevent the default', async () => {
    const { el, $ } = await mount();
    const down = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    $('input', HTMLInputElement).dispatchEvent(down);
    $('input', HTMLInputElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true }),
    );
    expect(el.state.log).toEqual(['key:ArrowDown']);
    expect(down.defaultPrevented).toBe(true);
  });

  it('fires focusout intents on an ancestor of the focused control', async () => {
    const { el, $ } = await mount();
    $('input', HTMLInputElement).focus();
    $('input', HTMLInputElement).blur();
    expect(el.state.log).toEqual(['left']);
  });

  it('sees non-bubbling toggle events with their new state', async () => {
    const { el, $ } = await mount();
    const details = $('details', HTMLDetailsElement);
    details.open = true;
    await new Promise((r) => setTimeout(r, 50));
    details.open = false;
    await new Promise((r) => setTimeout(r, 50));
    expect(el.state.log).toEqual(['open', 'closed']);
  });

  it('listens to extra event types declared in spec.events', async () => {
    const { el, $ } = await mount();
    $('span', HTMLSpanElement).dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, composed: true }),
    );
    expect(el.state.log).toEqual(['pressed']);
  });
});
