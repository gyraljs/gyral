import { afterEach, describe, expect, it } from 'vitest';
import { define, html, random, randomDriver, randomInt, toInt } from '../src/index.js';

describe('toInt', () => {
  it('maps [0, 1) onto min..max inclusively', () => {
    expect(toInt(0, 1, 10)).toBe(1);
    expect(toInt(0.999999, 1, 10)).toBe(10);
    expect(toInt(0.5, 1, 10)).toBe(6);
  });
});

describe('random commands', () => {
  type Msg = { readonly _tag: 'Roll' } | { readonly _tag: 'Rolled'; readonly n: number };
  const Dice = define<{ readonly rolls: readonly number[] }, Msg>('test-dice', {
    init: () => ({ rolls: [] }),
    intent: { Roll: () => ({ _tag: 'Roll' }) },
    update: {
      Roll: (s) => [s, [randomInt(1, 6, (n) => ({ _tag: 'Rolled', n }))]],
      Rolled: (s, m) => ({ rolls: [...s.rolls, m.n] }),
    },
    view: (s, i) => html`<button data-intent=${i.Roll}>${s.rolls.join(',')}</button>`,
  });
  const settle = () => new Promise((r) => setTimeout(r, 0));

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('draws real numbers in range by default', async () => {
    const values = await randomDriver.run(
      { count: 50 },
      { signal: new AbortController().signal, emit: () => undefined },
    );
    expect(values).toHaveLength(50);
    expect(values.every((u) => u >= 0 && u < 1)).toBe(true);
  });

  it('is substituted by name for deterministic tests', async () => {
    const el = new Dice();
    el.drivers = { random: { name: 'random', run: () => [0.99] } };
    document.body.append(el);
    await el.updateComplete;
    el.send({ _tag: 'Roll' });
    await settle();
    expect(el.state.rolls).toEqual([6]);
  });

  it('random() hands all drawn values to the mapper', () => {
    const cmd = random(3, (values) => values.length);
    expect(cmd.input).toEqual({ count: 3 });
    expect(cmd.onSuccess([0.1, 0.2, 0.3])).toBe(3);
  });
});
