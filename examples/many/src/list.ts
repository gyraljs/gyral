import { child, css, define, html, repeat } from '@gyral/core';
import { Item, type ItemOutput, type ItemSeed } from './item.js';

export interface State {
  readonly items: readonly ItemSeed[];
  readonly nextId: number;
}

type Seed = Omit<ItemSeed, 'id'>;

export type Msg =
  | { readonly _tag: 'Add'; readonly seeds: readonly Seed[] }
  | { readonly _tag: 'Item'; readonly id: number; readonly out: ItemOutput };

/** Randomness lives at the intent edge so reducers stay pure (see bead gyral-czi.10). */
export function randomSeed(): Seed {
  const color = `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;
  return { color, width: Math.floor(Math.random() * 800 + 200) };
}

export const List = define<State, Msg>('gy-many-list', {
  init: () => ({ items: [{ id: 0, color: '#ff0000', width: 300 }], nextId: 1 }),
  intent: {
    // Both buttons are the same intent; each carries how many items to add as its value.
    Add: ({ value }) => ({
      _tag: 'Add',
      seeds: Array.from({ length: Number(value) }, randomSeed),
    }),
    Item: child(Item, (out, el) => ({ _tag: 'Item', id: el.item.id, out })),
  },
  update: {
    Add: (s, m) => ({
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
