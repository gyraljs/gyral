# Composition: props, child components, stores

Data flows **down as props**, **up as outputs**, and **sideways through stores**.

## Props in, `PropsChanged` for state

Props are context: read them in `view` and reducers via `ctx.props`. They enter state only in
`init(props)` (once) and in the optional `PropsChanged` reducer (every later change, in the
same render):

```ts
import { define, html, prop } from '@gyral/core';
import { get } from '@gyral/http';

interface Props {
  readonly userId: string;
}
interface State {
  readonly draft: string;
  readonly bio: string;
}
type Msg =
  | { readonly _tag: 'Draft'; readonly text: string }
  | { readonly _tag: 'Bio'; readonly bio: string };

const loadBio = (userId: string) =>
  get<{ readonly bio: string }, Msg>(`/api/users/${encodeURIComponent(userId)}`, {
    key: 'bio',
    concurrency: 'switch',
    onSuccess: (body) => ({ _tag: 'Bio', bio: body.bio }),
  });

export const UserCard = define<State, Msg, Props>('my-user-card', {
  props: { userId: prop.string({ required: true }) },
  init: (props) => [{ draft: '', bio: '' }, [loadBio(props.userId)]],
  intent: { Draft: ({ value }) => ({ _tag: 'Draft', text: value ?? '' }) },
  update: {
    Draft: (s, m) => ({ ...s, draft: m.text }),
    Bio: (s, m) => ({ ...s, bio: m.bio }),
    // A different user: reset the draft and refetch.
    PropsChanged: (s, { props, prev }) =>
      props.userId === prev.userId ? s : [{ draft: '', bio: '' }, [loadBio(props.userId)]],
  },
  view: (s, i, { props }) => html`
    <h3>${props.userId}</h3>
    <p>${s.bio}</p>
    <input value=${s.draft} data-intent=${i.Draft} aria-label="Message" />
  `,
});
```

## Child components: outputs up with `emit`, `child()` in the parent

The child declares an output union `O` (4th type parameter) and returns `emit(output)` as a
command. Build that `emit` with `outputs<O>()` (a module-level constant, like `intents<Msg>()`):
it is core's `emit`, typed by the union, so an output of the wrong shape fails to compile. The
parent puts `data-intent` on the child element and parses outputs with
`child(ChildClass, (output, el) => msg)`; `el` is the typed child element (read its props).

```ts
import * as v from 'valibot';
import { child, define, each, html, intents, outputs, prop } from '@gyral/core';

// Child: owns its own state; reports removal up.
type ItemOut = { readonly _tag: 'Removed' };
type ItemMsg = { readonly _tag: 'Remove' };
const emit = outputs<ItemOut>(); // emit({ _tag: 'Remvoed' }) would not compile
const ItemData = v.object({ id: v.number(), label: v.string() });
interface ItemProps {
  readonly item: v.InferOutput<typeof ItemData>;
}

export const Item = define<object, ItemMsg, ItemProps, ItemOut>('my-item', {
  props: { item: prop.value(ItemData, { required: true }) },
  init: () => ({}),
  intent: { Remove: () => ({ _tag: 'Remove' }) },
  update: { Remove: (s) => [s, [emit({ _tag: 'Removed' })]] },
  view: (_s, i, { props }) => html`
    ${props.item.label} <button type="button" data-intent=${i.Remove}>Remove</button>
  `,
});

// Parent: one intent for every child; the element tells which one.
interface ListState {
  readonly items: readonly { readonly id: number; readonly label: string }[];
}
type ListMsg = { readonly _tag: 'ItemOut'; readonly id: number; readonly out: ItemOut };
const listIntents = intents<ListMsg>();

export const List = define<ListState, ListMsg>('my-list', {
  init: () => ({
    items: [
      { id: 1, label: 'One' },
      { id: 2, label: 'Two' },
    ],
  }),
  intent: {
    ItemOut: child(Item, (out, el) => ({ _tag: 'ItemOut', id: el.item.id, out })),
  },
  update: {
    ItemOut: (s, m) => ({ items: s.items.filter((it) => it.id !== m.id) }),
  },
  view: (s) =>
    html`<ul>
      ${each(
        s.items,
        (it) => it.id,
        // Rows are pure: the intent name is a module constant (listIntents above).
        (it) => html`<li><my-item .item=${it} data-intent=${listIntents.ItemOut}></my-item></li>`,
      )}
    </ul>`,
});
```

For a component that contains itself (a folder tree) or is defined later, pass a function:
`child(() => Folder, …)` and annotate the constant as `GyralElementClass<S, M, P, O>`.

Don't annotate the mapper as `(out): Msg => …`: an intent must produce its own variant, so the
whole union fails with a long `IntentParser<…>` error. Leave the return type off inside the spec
(as above), or annotate `Extract<ListMsg, { _tag: 'ItemOut' }>` (plus `| undefined` when it
ignores some outputs); a mapper defined outside the spec needs `_tag: 'ItemOut' as const`.

### Outputs to a parent that isn't Gyral

An output is a `gyral-output` `CustomEvent` (`OUTPUT_EVENT`) dispatched on the child's host in a
microtask; `detail` is the output. It bubbles but isn't composed, so it stays in the tree the
child sits in. Plain DOM code, or a component from another library, listens for it on the child
or an ancestor in that tree:

```ts
import { define, html, OUTPUT_EVENT, outputs, type OutputEvent, type OutputsOf } from '@gyral/core';

type RatingOut = { readonly _tag: 'Rated'; readonly stars: number };
const emit = outputs<RatingOut>();

export const Rating = define<object, { readonly _tag: 'Rate' }, object, RatingOut>('my-rating', {
  init: () => ({}),
  intent: { Rate: () => ({ _tag: 'Rate' }) },
  update: { Rate: (s) => [s, [emit({ _tag: 'Rated', stars: 5 })]] },
  view: (_s, i) => html`<button type="button" data-intent=${i.Rate}>★★★★★</button>`,
});

// Page script (or another library's component): listen on the child or an ancestor.
document.querySelector('#reviews')?.addEventListener(OUTPUT_EVENT, (event) => {
  const { detail } = event as OutputEvent<OutputsOf<typeof Rating>>;
  console.log(`${String(detail.stars)} stars from`, event.target); // the <my-rating>
});
```

The other direction works too: any custom element talks to a Gyral parent by dispatching
`new CustomEvent(OUTPUT_EVENT, { detail: { _tag: 'Picked', … }, bubbles: true })` on itself.

Keep a child's own UI state inside the child; the parent owns only what it must coordinate.
Don't reach into a child's state from the parent; ask with props, listen with outputs.

## Stores: shared state without a view

A store is MVI without a view: `init`, `update` (pure, may return commands), optional `schema`
to validate the server seed. Components list it in `stores`, read it with `ctx.read(store)`,
and write with the `send(store, msg)` command. Changes re-render readers; the optional
`StoreChanged` reducer reacts (narrow it with `changed(store, msg)`).

```ts
import { changed, define, defineStore, html, prop, send } from '@gyral/core';

interface Line {
  readonly sku: string;
  readonly qty: number;
}
interface Cart {
  readonly lines: readonly Line[];
}
type CartMsg = { readonly _tag: 'Add'; readonly sku: string } | { readonly _tag: 'Clear' };

export const cart = defineStore<Cart, CartMsg>('cart', {
  init: () => ({ lines: [] }),
  update: {
    Add: (s, { sku }) =>
      s.lines.some((l) => l.sku === sku)
        ? { lines: s.lines.map((l) => (l.sku === sku ? { ...l, qty: l.qty + 1 } : l)) }
        : { lines: [...s.lines, { sku, qty: 1 }] },
    Clear: () => ({ lines: [] }),
  },
});

const count = (c: Cart): number => c.lines.reduce((n, l) => n + l.qty, 0);

interface BadgeState {
  readonly bumped: boolean;
}
type BadgeMsg = { readonly _tag: 'Buy' };

export const BuyButton = define<BadgeState, BadgeMsg, { readonly sku: string }>('my-buy', {
  props: { sku: prop.string({ required: true }) },
  stores: [cart],
  init: () => ({ bumped: false }),
  intent: { Buy: () => ({ _tag: 'Buy' }) },
  update: {
    Buy: (s, _m, { props }) => [s, [send(cart, { _tag: 'Add', sku: props.sku })]],
    StoreChanged: (s, m) => {
      const c = changed(cart, m);
      return c === undefined ? s : { bumped: count(c.state) > count(c.prev) };
    },
  },
  view: (s, i, { read }) => html`
    <button type="button" data-intent=${i.Buy}>Add to cart (${count(read(cart))})</button>
    ${s.bumped ? html`<span role="status">Added</span>` : ''}
  `,
});
```

- One store instance per page in the browser, per request on the server (pass instances to
  `renderPage({ stores: [cart.instance(seed)] })`, see ssr.md), per test
  (`testStore(cart)`).
- Store names key seeds and overrides: keep them unique.
- A store may `send` to another store; writes are always commands, never direct mutation.
