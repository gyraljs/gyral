import { afterEach, describe, expect, it } from 'vitest';
import { define, focus, html, settled } from '../src/index.js';

interface State {
  readonly page: number;
  readonly editing: boolean;
}
type Msg = { readonly _tag: 'Next' } | { readonly _tag: 'Edit' } | { readonly _tag: 'Lost' };

const spec = {
  init: (): State => ({ page: 1, editing: false }),
  intent: { Next: () => ({ _tag: 'Next' }) as const },
  update: {
    Next: (s: State): [State, ReturnType<typeof focus>[]] => [
      { ...s, page: s.page + 1 },
      [focus('h2', { preventScroll: true })],
    ],
    // The input only exists after this render: focus must wait for it.
    Edit: (s: State): [State, ReturnType<typeof focus>[]] => [
      { ...s, editing: true },
      [focus('input', { select: true })],
    ],
    Lost: (s: State): [State, ReturnType<typeof focus>[]] => [s, [focus('.missing')]],
  },
  view: (s: State, i: { readonly Next: 'Next' }) => html`
    <h2 tabindex="-1">Page ${String(s.page)}</h2>
    ${s.editing ? html`<input value="draft" />` : null}
    <button data-intent=${i.Next}>Next</button>
  `,
};

const Shadowed = define<State, Msg>('test-focus', spec);
const Light = define<State, Msg>('test-focus-light', { ...spec, shadow: false });

afterEach(() => {
  document.body.replaceChildren();
});

describe('focus() command (gyral-czi.28)', () => {
  it('focuses an element in the shadow root after the render the reducer caused', async () => {
    const el = new Shadowed();
    document.body.append(el);
    await settled();
    el.send({ _tag: 'Next' });
    await settled();
    const heading = el.shadowRoot?.querySelector('h2');
    expect(el.shadowRoot?.activeElement).toBe(heading);
    expect(heading?.textContent).toBe('Page 2');
  });

  it('waits for an element the same update renders, and can select its text', async () => {
    const el = new Shadowed();
    document.body.append(el);
    await settled();
    el.send({ _tag: 'Edit' });
    await settled();
    const input = el.shadowRoot?.querySelector('input');
    expect(el.shadowRoot?.activeElement).toBe(input);
    expect([input?.selectionStart, input?.selectionEnd]).toEqual([0, 5]);
  });

  it('works for light-DOM components', async () => {
    const el = new Light();
    document.body.append(el);
    await settled();
    el.send({ _tag: 'Next' });
    await settled();
    expect(document.activeElement).toBe(el.querySelector('h2'));
  });

  it('warns when nothing matches', async () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    try {
      const el = new Shadowed();
      document.body.append(el);
      await settled();
      el.send({ _tag: 'Lost' });
      await settled();
    } finally {
      console.warn = original;
    }
    expect(warnings).toEqual(['<test-focus> focus(".missing") matched no focusable element.']);
  });
});
