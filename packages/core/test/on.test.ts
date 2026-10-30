// on(event, [filter], parser) (gyral-337.6): an intent parser typed by its event, with the
// control, form, modifiers, files, numeric value and origin in its input, and a key filter that
// declines other keys without preventing their default action.
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { define, html, on, settled } from '../src/index.js';
import { collectErrors } from './collect-errors.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

type Msg =
  | { readonly _tag: 'Move'; readonly by: number }
  | { readonly _tag: 'Level'; readonly level: number | undefined; readonly form: string }
  | { readonly _tag: 'Attach'; readonly names: readonly string[] }
  | { readonly _tag: 'Point'; readonly origin: string };

const Panel = define<{ readonly log: readonly Msg[] }, Msg>()('test-on', {
  init: () => ({ log: [] }),
  intent: {
    Move: on('keydown', { keys: ['ArrowLeft', 'ArrowRight'], modifiers: 'none' }, (input) => {
      expectTypeOf(input.event).toEqualTypeOf<KeyboardEvent>();
      return { _tag: 'Move', by: input.key === 'ArrowLeft' ? -1 : 1 };
    }),
    Level: on('input', (input) => ({
      _tag: 'Level',
      level: input.valueAsNumber,
      form: input.form?.id ?? '',
    })),
    Attach: on('change', (input) => ({
      _tag: 'Attach',
      names: (input.files ?? []).map((f) => f.name),
    })),
    Point: on('click', (input) => ({ _tag: 'Point', origin: input.origin?.localName ?? '' })),
  },
  update: {
    Move: (s, m) => ({ log: [...s.log, m] }),
    Level: (s, m) => ({ log: [...s.log, m] }),
    Attach: (s, m) => ({ log: [...s.log, m] }),
    Point: (s, m) => ({ log: [...s.log, m] }),
  },
  view: (_s, i) => html`
    <div tabindex="0" data-intent-keydown=${i.Move}>grid</div>
    <form id="mix">
      <input type="range" min="0" max="10" data-intent-input=${i.Level} />
      <input type="file" data-intent-change=${i.Attach} />
    </form>
    <button type="button" data-intent=${i.Point}><b>bold</b></button>
  `,
});

async function mounted(): Promise<InstanceType<typeof Panel>> {
  const el = new Panel();
  document.body.append(el);
  await settled();
  return el;
}

const q = (el: Element, selector: string): Element | null | undefined =>
  el.shadowRoot?.querySelector(selector);

describe('on()', () => {
  it('parses its keys without modifiers, and passes other keys on with their default', async () => {
    const el = await mounted();
    const grid = q(el, 'div') as HTMLElement;
    const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        composed: true,
        cancelable: true,
        ...init,
      });
      grid.dispatchEvent(event);
      return event;
    };
    press('ArrowLeft');
    const reload = press('r', { ctrlKey: true });
    const shifted = press('ArrowRight', { shiftKey: true });
    await settled();
    expect(el.state.log).toEqual([{ _tag: 'Move', by: -1 }]);
    expect(reload.defaultPrevented).toBe(false);
    expect(shifted.defaultPrevented).toBe(false);
  });

  it('gives a numeric value, the form, files and the element the event started on', async () => {
    const el = await mounted();
    const range = q(el, 'input[type=range]') as HTMLInputElement;
    range.value = '7';
    range.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    const file = q(el, 'input[type=file]') as HTMLInputElement;
    const files = new DataTransfer();
    files.items.add(new File(['x'], 'a.txt'));
    file.files = files.files;
    file.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    (q(el, 'b') as HTMLElement).click();
    await settled();
    expect(el.state.log).toEqual([
      { _tag: 'Level', level: 7, form: 'mix' },
      { _tag: 'Attach', names: ['a.txt'] },
      { _tag: 'Point', origin: 'b' },
    ]);
  });

  it('throws G0018 in development when another event reaches it', async () => {
    const errors = collectErrors();
    try {
      const Wrong = define<{ readonly n: number }, { readonly _tag: 'Go' }>()('test-on-wrong', {
        init: () => ({ n: 0 }),
        intent: { Go: on('keydown', () => ({ _tag: 'Go' })) },
        update: { Go: (s) => s },
        // eslint-disable-next-line gyral/intent-event -- the wrong binding is what this tests
        view: (_s, i) => html`<button type="button" data-intent=${i.Go}>go</button>`,
      });
      const el = new Wrong();
      document.body.append(el);
      await settled();
      el.shadowRoot?.querySelector('button')?.click();
      await settled();
      expect(errors.text()).toContain(
        'The parser of intent "Go" is on("keydown"), but a "click" event reached it',
      );
    } finally {
      errors.stop();
    }
  });
});

// gyral-cd0 made on() run without a DOM (DOM classes feature-detected, a missing target and
// composedPath() tolerated, the key read from the input): in the browser nothing changes.
type FieldMsg =
  | {
      readonly _tag: 'Typed';
      readonly n: number | undefined;
      readonly control: string;
      readonly form: string;
      readonly origin: string;
    }
  | { readonly _tag: 'Sent'; readonly form: string; readonly control: boolean }
  | { readonly _tag: 'Saved'; readonly ctrl: boolean };

const Fields = define<{ readonly log: readonly FieldMsg[] }, FieldMsg>()('test-on-fields', {
  init: () => ({ log: [] }),
  intent: {
    Typed: on('input', (input) => ({
      _tag: 'Typed',
      n: input.valueAsNumber,
      control: input.control?.localName ?? '',
      form: input.form?.id ?? '',
      origin: input.origin?.localName ?? '',
    })),
    Sent: on('submit', (input) => ({
      _tag: 'Sent',
      form: input.form?.id ?? '',
      control: input.control !== undefined,
    })),
    Saved: on('keydown', { keys: ['s'], modifiers: { ctrl: true } }, (input) => ({
      _tag: 'Saved',
      ctrl: input.modifiers.ctrl,
    })),
  },
  update: {
    Typed: (s, m) => ({ log: [...s.log, m] }),
    Sent: (s, m) => ({ log: [...s.log, m] }),
    Saved: (s, m) => ({ log: [...s.log, m] }),
  },
  view: (_s, i) => html`
    <form id="note" data-intent-submit=${i.Sent}>
      <input name="t" data-intent-input=${i.Typed} data-intent-keydown=${i.Saved} />
      <button>Send</button>
    </form>
  `,
});

describe('on() in the browser', () => {
  it('keeps a text input non-numeric, and reads the form, control, origin and key', async () => {
    const el = new Fields();
    document.body.append(el);
    await settled();
    const text = q(el, 'input') as HTMLInputElement;
    text.value = '7';
    text.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    for (const ctrlKey of [false, true]) {
      const init = { key: 's', ctrlKey, bubbles: true, composed: true, cancelable: true };
      text.dispatchEvent(new KeyboardEvent('keydown', init));
    }
    (q(el, 'form') as HTMLFormElement).requestSubmit();
    await settled();
    expect(el.state.log).toEqual([
      { _tag: 'Typed', n: undefined, control: 'input', form: 'note', origin: 'input' },
      { _tag: 'Saved', ctrl: true },
      { _tag: 'Sent', form: 'note', control: false },
    ]);
  });
});
