// Press-and-release intents (gyral-dyn.13, view/05-element.md "Press and release"): a
// `data-intent-on` list fires one intent for several events, and the `capturePointer()` hook
// keeps the pointer on the element, so the release arrives wherever it happens.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { capturePointer, define, html, nothing, settled } from '../src/index.js';

type Dir = 'left' | 'right';
interface State {
  readonly held: Dir | undefined;
  readonly log: readonly string[];
}
type Msg =
  | { readonly _tag: 'Hold'; readonly dir: Dir; readonly down: boolean }
  | { readonly _tag: 'Key'; readonly key: string; readonly down: boolean };

const RELEASES = new Set(['pointerup', 'pointercancel', 'lostpointercapture']);

const Pad = define<State, Msg>()('test-press-release', {
  init: () => ({ held: undefined, log: [] }),
  intent: {
    Hold: ({ event, target }) => {
      // A lost capture bubbles from wherever it happened; only the button's own counts.
      if (event.type === 'lostpointercapture' && event.target !== target) return undefined;
      const dir = target.getAttribute('data-dir') === 'left' ? 'left' : 'right';
      return { _tag: 'Hold', dir, down: !RELEASES.has(event.type) };
    },
    Key: ({ event, key }) =>
      key === undefined || (event as KeyboardEvent).repeat
        ? undefined
        : { _tag: 'Key', key, down: event.type === 'keydown' },
  },
  update: {
    Hold: (s, m) => ({
      held: m.down ? m.dir : s.held === m.dir ? undefined : s.held,
      log: [...s.log, `${m.dir}:${m.down ? 'down' : 'up'}`],
    }),
    Key: (s, m) => ({ ...s, log: [...s.log, `${m.key}:${m.down ? 'down' : 'up'}`] }),
  },
  view: (_s, i) => html`
    <button
      type="button"
      ${capturePointer()}
      data-dir="left"
      data-intent=${i.Hold}
      data-intent-on="pointerdown pointerup pointercancel lostpointercapture"
    >
      left
    </button>
    <button type="button" data-dir="right" data-intent=${i.Hold} data-intent-on="pointerdown">
      right
    </button>
    <div tabindex="0" data-intent=${i.Key} data-intent-on="keydown keyup">pad</div>
    <p style="margin-top: 200px">elsewhere</p>
  `,
});

type PadElement = HTMLElement & { readonly state: State };

async function mount() {
  const el = new Pad() as PadElement;
  document.body.append(el);
  await settled();
  const $ = (sel: string): HTMLElement => {
    const found = el.shadowRoot?.querySelector(sel);
    if (!(found instanceof HTMLElement)) throw new Error(sel);
    return found;
  };
  return { el, $ };
}

const pointer = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, { bubbles: true, composed: true, pointerId: 1, ...init });

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('press-and-release intents', () => {
  it('fires one intent for each event in the list; the parser reads event.type', async () => {
    const { el, $ } = await mount();
    const left = $('[data-dir=left]');
    left.dispatchEvent(pointer('pointerdown'));
    await settled();
    expect(el.state.held).toBe('left');
    left.dispatchEvent(pointer('pointerup'));
    await settled();
    expect(el.state).toEqual({ held: undefined, log: ['left:down', 'left:up'] });
  });

  it('a pointercancel releases', async () => {
    const { el, $ } = await mount();
    const left = $('[data-dir=left]');
    left.dispatchEvent(pointer('pointerdown'));
    left.dispatchEvent(pointer('pointercancel'));
    await settled();
    expect(el.state).toEqual({ held: undefined, log: ['left:down', 'left:up'] });
  });

  it("a lost capture releases; one lost by a child doesn't", async () => {
    const { el, $ } = await mount();
    const left = $('[data-dir=left]');
    left.dispatchEvent(pointer('pointerdown'));
    const child = document.createElement('i');
    left.append(child);
    child.dispatchEvent(pointer('lostpointercapture'));
    await settled();
    expect(el.state.held).toBe('left');
    left.dispatchEvent(pointer('lostpointercapture'));
    await settled();
    expect(el.state).toEqual({ held: undefined, log: ['left:down', 'left:up'] });
  });

  it('capturePointer() captures the pointer on pointerdown', async () => {
    const { $ } = await mount();
    const capture = vi.spyOn(Element.prototype, 'setPointerCapture');
    $('[data-dir=right]').dispatchEvent(pointer('pointerdown', { pointerId: 7 }));
    expect(capture).not.toHaveBeenCalled();
    // A synthetic pointer isn't active: setPointerCapture throws, and the intent still fires.
    $('[data-dir=left]').dispatchEvent(pointer('pointerdown', { pointerId: 7 }));
    expect(capture.mock.calls).toEqual([[7]]);
    expect(capture.mock.contexts).toEqual([$('[data-dir=left]')]);
  });

  it('with a real pointer, a release outside the button still arrives', async () => {
    const { el, $ } = await mount();
    const left = $('[data-dir=left]');
    const got = vi.fn();
    left.addEventListener('gotpointercapture', got);
    await userEvent.dragAndDrop(left, $('p'));
    await settled();
    expect(got).toHaveBeenCalled();
    expect(el.state.held).toBeUndefined();
    expect(el.state.log.slice(0, 2)).toEqual(['left:down', 'left:up']);
  });

  it('keydown and keyup on one element; the parser ignores repeats', async () => {
    const { el, $ } = await mount();
    $('[tabindex]').focus();
    await userEvent.keyboard('{ArrowLeft>3}{/ArrowLeft}');
    await settled();
    expect(el.state.log).toEqual(['ArrowLeft:down', 'ArrowLeft:up']);
  });

  it('a toggled capturePointer() adds one listener and removes it when the position drops it', async () => {
    type Set = { readonly _tag: 'Set'; readonly on: boolean };
    const Toggle = define<{ readonly on: boolean }, Set>()('test-capture-toggle', {
      init: () => ({ on: true }),
      intent: {},
      update: { Set: (_s, m) => ({ on: m.on }) },
      view: (s) => html`<button type="button" ${s.on ? capturePointer() : nothing}>b</button>`,
    });
    const el = new Toggle() as HTMLElement & { send(m: Set): void };
    const added = vi.spyOn(Element.prototype, 'addEventListener');
    const removed = vi.spyOn(Element.prototype, 'removeEventListener');
    document.body.append(el);
    await settled();
    const button = el.shadowRoot?.querySelector('button');
    if (!(button instanceof HTMLElement)) throw new Error('button');
    const onButton = (spy: typeof added) =>
      spy.mock.contexts.filter((ctx) => ctx === button).length;
    const capture = vi.spyOn(Element.prototype, 'setPointerCapture');
    for (const on of [false, true, false, true]) {
      el.send({ _tag: 'Set', on });
      await settled();
    }
    expect(onButton(added)).toBe(3);
    expect(onButton(removed)).toBe(2);
    button.dispatchEvent(pointer('pointerdown'));
    expect(capture).toHaveBeenCalledTimes(1);
    el.send({ _tag: 'Set', on: false });
    await settled();
    button.dispatchEvent(pointer('pointerdown'));
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
