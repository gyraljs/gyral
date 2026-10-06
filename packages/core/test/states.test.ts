import { afterEach, describe, expect, it } from 'vitest';
import { css, define, html, settled } from '../src/index.js';

type Msg = { readonly _tag: 'Toggle' };

const Lamp = define<{ readonly on: boolean }, Msg>('test-states', {
  init: () => ({ on: false }),
  intent: { Toggle: () => ({ _tag: 'Toggle' }) },
  update: { Toggle: (s) => ({ on: !s.on }) },
  states: (s) => ({ on: s.on, off: !s.on }),
  view: (_s, i) => html`<button data-intent=${i.Toggle}>toggle</button>`,
  styles: css`
    :host(:state(on)) button {
      outline-style: dotted;
    }
  `,
});

const Plain = define<{ readonly n: number }, never>('test-no-states', {
  init: () => ({ n: 0 }),
  intent: {},
  update: {},
  view: () => html`<p>plain</p>`,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('custom states (spec.states)', () => {
  it('mirrors boolean state facts onto :state() after each render', async () => {
    const el = new Lamp();
    document.body.append(el);
    await settled();
    expect(el.matches(':state(off)')).toBe(true);
    expect(el.matches(':state(on)')).toBe(false);
    el.send({ _tag: 'Toggle' });
    await settled();
    expect(el.matches(':state(on)')).toBe(true);
    expect(el.matches(':state(off)')).toBe(false);
    const button = el.shadowRoot?.querySelector('button');
    if (button == null) throw new Error('no button');
    expect(getComputedStyle(button).outlineStyle).toBe('dotted');
  });

  it('leaves ElementInternals free for components that do not declare states', async () => {
    const el = new Plain();
    document.body.append(el);
    await settled();
    expect(() => el.attachInternals()).not.toThrow();
  });
});
