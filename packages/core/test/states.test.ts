import { afterEach, describe, expect, it, vi } from 'vitest';
import { css, define, html, settled } from '../src/index.js';

type Msg = { readonly _tag: 'Toggle' };

const Lamp = define<{ readonly on: boolean }, Msg>()('test-states', {
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

const Plain = define<{ readonly n: number }, never>()('test-no-states', {
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

  // gyral-dyn.30: Chromium 90–124 have CustomStateSet but accept only `--`-prefixed names, so
  // add('on') throws there. States are an enhancement (ADR 0003): skip them, never fail renders.
  it('skips states where the platform rejects plain state names', async () => {
    const add = vi.spyOn(CustomStateSet.prototype, 'add').mockImplementation(function (
      this: CustomStateSet,
      name: string,
    ) {
      if (!name.startsWith('--')) throw new DOMException(`bad state "${name}"`, 'SyntaxError');
      return this;
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const el = new Lamp();
      document.body.append(el);
      await settled();
      el.send({ _tag: 'Toggle' });
      await settled();
      expect(el.shadowRoot?.querySelector('button')).not.toBeNull();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      add.mockRestore();
      errors.mockRestore();
    }
  });
});
