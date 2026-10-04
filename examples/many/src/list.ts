import { child, css, define, html, random, repeat, toInt } from '@gyral/core';
import { Item, type ItemOutput, type ItemSeed } from './item.js';

export interface State {
  readonly items: readonly ItemSeed[];
  readonly nextId: number;
}

type Seed = Omit<ItemSeed, 'id'>;

export type Msg =
  | { readonly _tag: 'Add'; readonly count: number }
  | { readonly _tag: 'Seeded'; readonly seeds: readonly Seed[] }
  | { readonly _tag: 'Item'; readonly id: number; readonly out: ItemOutput };

/**
 * Turns uniform numbers from the random driver into item seeds, two numbers per item. Pure,
 * so tests feed fixed numbers (randomness is an effect, gyral-czi.10).
 */
export function seedsFrom(values: readonly number[]): Seed[] {
  const seeds: Seed[] = [];
  for (let n = 0; n + 1 < values.length; n += 2) {
    const hex = toInt(values[n] ?? 0, 0, 0xffffff)
      .toString(16)
      .padStart(6, '0');
    seeds.push({ color: `#${hex}`, width: toInt(values[n + 1] ?? 0, 200, 999) });
  }
  return seeds;
}

export const List = define<State, Msg>('gy-many-list', {
  init: () => ({ items: [{ id: 0, color: '#ff0000', width: 300 }], nextId: 1 }),
  intent: {
    // Both buttons are the same intent; each carries how many items to add as its value.
    Add: ({ value }) => {
      const count = Number(value);
      return Number.isInteger(count) && count > 0 ? { _tag: 'Add', count } : undefined;
    },
    Item: child(Item, (out, el) => ({ _tag: 'Item', id: el.item.id, out })),
  },
  update: {
    Add: (s, m) => [
      s,
      [random<Msg>(m.count * 2, (values) => ({ _tag: 'Seeded', seeds: seedsFrom(values) }))],
    ],
    Seeded: (s, m) => ({
      items: [...s.items, ...m.seeds.map((seed, n) => ({ ...seed, id: s.nextId + n }))],
      nextId: s.nextId + m.seeds.length,
    }),
    // ItemOutput has one variant (Removed); switch on m.out._tag when it grows.
    Item: (s, m) => ({ ...s, items: s.items.filter((it) => it.id !== m.id) }),
  },
  view: (s, i) => html`
    <menu>
      <li><button type="button" value="1" data-intent=${i.Add}>Add new item</button></li>
      <li><button type="button" value="1000" data-intent=${i.Add}>Add 1000 items</button></li>
    </menu>
    <p><output>${s.items.length}</output> items</p>
    <ul>
      ${repeat(
        s.items,
        (it) => it.id,
        (it) => html`<li><gy-many-item .item=${it} data-intent=${i.Item}></gy-many-item></li>`,
      )}
    </ul>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
      }
      menu {
        display: flex;
        gap: 0.5rem;
        padding: 0;
        list-style: none;
      }
      ul {
        padding: 0;
        list-style: none;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-many-list': InstanceType<typeof List>;
  }
}
