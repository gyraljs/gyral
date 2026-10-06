import { afterEach, describe, expect, it } from 'vitest';
import { randomDriver, settled } from '@gyral/core';
import { fakeDriver, run, step } from '@gyral/testing';
import { Item } from '../src/item.js';
import { List, seedsFrom } from '../src/list.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('pure', () => {
  it('assigns ids in the reducer and removes by id', () => {
    const seed = { color: '#000000', width: 300 };
    const { state } = run(List.spec, [
      { _tag: 'Seeded', seeds: [seed, seed] },
      { _tag: 'Item', id: 1, out: { _tag: 'Removed' } },
    ]);
    expect(state.items.map((it) => it.id)).toEqual([0, 2]);
    expect(state.nextId).toBe(3);
  });

  it('Add asks the random driver for two numbers per item', () => {
    const { state, commands } = step(List.spec, run(List.spec, []).state, {
      _tag: 'Add',
      count: 3,
    });
    expect(state.items).toHaveLength(1);
    expect(commands[0]?.input).toEqual({ count: 6 });
  });

  it('seedsFrom maps numbers to colours and widths deterministically', () => {
    expect(seedsFrom([0, 0, 1 - 1e-12, 1 - 1e-12])).toEqual([
      { color: '#000000', width: 200 },
      { color: '#ffffff', width: 999 },
    ]);
  });

  it('item keeps edits local and only reports removal', () => {
    const props = { item: { id: 4, color: '#123456', width: 250 } };
    expect(
      step(Item.spec, { color: '#123456', width: 250 }, { _tag: 'Width', width: 600 }, props),
    ).toMatchObject({ state: { width: 600 }, commands: [] });
    const removed = step(Item.spec, { color: '#123456', width: 250 }, { _tag: 'Remove' }, props);
    expect(removed.commands.map((c) => c.input)).toEqual([{ _tag: 'Removed' }]);
  });
});

describe('in the browser', () => {
  async function mount() {
    const list = new List();
    // Fixed randomness, answered at once: every new item is #800000 and 600px wide.
    list.drivers = {
      random: fakeDriver(randomDriver, {
        impl: ({ count }) => Array.from({ length: count }, () => 0.5),
      }),
    };
    document.body.append(list);
    await settled();
    const items = () => [...(list.shadowRoot?.querySelectorAll('gy-many-item') ?? [])];
    const click = async (value: string) => {
      button(value).click();
      await settled();
    };
    const button = (value: string) => {
      const b = list.shadowRoot?.querySelector<HTMLButtonElement>(`button[value="${value}"]`);
      if (b == null) throw new Error(`no button ${value}`);
      return b;
    };
    return { list, items, button, click };
  }

  it('adds one item', async () => {
    const { list, items, click } = await mount();
    await click('1');
    expect(items()).toHaveLength(2);
    expect(list.state.items[1]).toMatchObject({ color: '#800000', width: 600 });
  });

  it('keeps each item’s local state across removals of others', async () => {
    const { list, items, click } = await mount();
    await click('1');
    await click('1');
    const [first, second] = items();
    if (first === undefined || second === undefined) throw new Error('items missing');
    const slider = first.shadowRoot?.querySelector<HTMLInputElement>('input[type=range]');
    if (slider == null) throw new Error('no slider');
    slider.value = '777';
    slider.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    second.shadowRoot?.querySelector<HTMLButtonElement>('button')?.click();
    await settled();
    expect(items()).toHaveLength(2);
    expect(items()[0]).toBe(first);
    expect(first.state.width).toBe(777);
    expect(list.state.items.map((it) => it.id)).toEqual([0, 2]);
  });

  it('adds 1000 items and stays responsive', async () => {
    const { items, click } = await mount();
    const start = performance.now();
    await click('1000');
    const added = performance.now() - start;
    expect(items()).toHaveLength(1001);

    const last = items().at(-1);
    if (last === undefined) throw new Error('no items');
    const removeStart = performance.now();
    last.shadowRoot?.querySelector<HTMLButtonElement>('button')?.click();
    await settled();
    const removed = performance.now() - removeStart;
    expect(items()).toHaveLength(1000);

    console.info(
      `many: add 1000 = ${added.toFixed(0)} ms, remove 1 of 1001 = ${removed.toFixed(0)} ms`,
    );
    // Generous bounds: a regression guard, not a benchmark.
    expect(added).toBeLessThan(5000);
    expect(removed).toBeLessThan(500);
  });
});
