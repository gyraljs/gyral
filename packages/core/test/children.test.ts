import { afterEach, describe, expect, it } from 'vitest';
import { splitNext } from '../src/command.js';
import { child, define, emit, html, repeat, type GyralElementClass } from '../src/index.js';
import { ctxOf } from './ctx.js';

interface Item {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
}

type ItemOut = { readonly _tag: 'Toggled'; readonly done: boolean } | { readonly _tag: 'Removed' };
type ItemMsg =
  { readonly _tag: 'Toggle' } | { readonly _tag: 'Remove' } | { readonly _tag: 'Poke' };

// Child: owns local UI state (pokes), reports changes up as outputs.
const TestItem = define<{ readonly pokes: number }, ItemMsg, { readonly item: Item }, ItemOut>(
  'test-item',
  {
    props: { item: { attribute: false } },
    init: () => ({ pokes: 0 }),
    intent: {
      Toggle: () => ({ _tag: 'Toggle' }),
      Remove: () => ({ _tag: 'Remove' }),
      Poke: () => ({ _tag: 'Poke' }),
    },
    update: {
      Toggle: (s, _m, { props }) => [s, [emit({ _tag: 'Toggled', done: !props.item.done })]],
      Remove: (s) => [s, [emit({ _tag: 'Removed' })]],
      Poke: (s) => ({ pokes: s.pokes + 1 }),
    },
    view: (s, i, { props }) => html`
      <span>${props.item.text}${props.item.done ? ' ✓' : ''}</span>
      <button class="toggle" data-intent=${i.Toggle}>toggle</button>
      <button class="remove" data-intent=${i.Remove}>remove</button>
      <button class="poke" data-intent=${i.Poke}>${s.pokes}</button>
    `,
  },
);

type ListMsg =
  | { readonly _tag: 'Item'; readonly id: string; readonly out: ItemOut }
  | { readonly _tag: 'Reverse' };

const TestList = define<{ readonly items: readonly Item[] }, ListMsg>('test-list', {
  init: () => ({
    items: [
      { id: 'a', text: 'A', done: false },
      { id: 'b', text: 'B', done: false },
    ],
  }),
  intent: {
    Item: child(TestItem, (out, el) => ({ _tag: 'Item', id: el.item.id, out })),
    Reverse: () => ({ _tag: 'Reverse' }),
  },
  update: {
    Item: (s, { id, out }) => {
      switch (out._tag) {
        case 'Toggled':
          return { items: s.items.map((it) => (it.id === id ? { ...it, done: out.done } : it)) };
        case 'Removed':
          return { items: s.items.filter((it) => it.id !== id) };
      }
    },
    Reverse: (s) => ({ items: [...s.items].reverse() }),
  },
  view: (s, i) => html`
    <button id="reverse" data-intent=${i.Reverse}>reverse</button>
    <ul>
      ${repeat(
        s.items,
        (it) => it.id,
        (it) => html`<li><test-item .item=${it} data-intent=${i.Item}></test-item></li>`,
      )}
    </ul>
  `,
});

type ItemEl = InstanceType<typeof TestItem>;

const settle = () => new Promise((r) => setTimeout(r, 0));

async function mount() {
  const list = new TestList();
  document.body.append(list);
  await list.updateComplete;
  const items = () => [...(list.shadowRoot?.querySelectorAll('test-item') ?? [])] as ItemEl[];
  await Promise.all(items().map((el) => el.updateComplete));
  const press = async (el: ItemEl, cls: string) => {
    el.shadowRoot?.querySelector<HTMLButtonElement>(`.${cls}`)?.click();
    await settle();
    await list.updateComplete;
    await Promise.all(items().map((x) => x.updateComplete));
  };
  return { list, items, press };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('child components (ADR 0010)', () => {
  it('turns child outputs into typed parent messages and passes new props down', async () => {
    const { list, items, press } = await mount();
    const [a] = items();
    if (a === undefined) throw new Error('no item');
    await press(a, 'toggle');
    expect(list.state.items[0]?.done).toBe(true);
    expect(a.shadowRoot?.querySelector('span')?.textContent).toBe('A ✓');
  });

  it('removes items through outputs', async () => {
    const { list, items, press } = await mount();
    const [, b] = items();
    if (b === undefined) throw new Error('no item');
    await press(b, 'remove');
    expect(list.state.items.map((it) => it.id)).toEqual(['a']);
    expect(items()).toHaveLength(1);
  });

  it('keeps child state attached to its key when the collection reorders', async () => {
    const { list, items, press } = await mount();
    const [a] = items();
    if (a === undefined) throw new Error('no item');
    await press(a, 'poke');
    list.shadowRoot?.querySelector<HTMLButtonElement>('#reverse')?.click();
    await list.updateComplete;
    const [first, second] = items();
    expect(first?.item.id).toBe('b');
    expect(second).toBe(a);
    expect(a.state.pokes).toBe(1);
  });

  it('does not leak outputs or child clicks past the parent', async () => {
    const leaked: Event[] = [];
    document.addEventListener('gyral-output', (e) => leaked.push(e));
    const { list, items, press } = await mount();
    const [a] = items();
    if (a === undefined) throw new Error('no item');
    await press(a, 'poke');
    await press(a, 'toggle');
    expect(leaked).toEqual([]);
    expect(list.state.items.map((it) => it.done)).toEqual([true, false]);
  });

  it('emit() is a pure command, testable without a DOM', () => {
    const next = TestItem.spec.update.Remove(
      { pokes: 0 },
      { _tag: 'Remove' },
      ctxOf({ item: { id: 'x', text: 'X', done: false } }),
    );
    const [, commands] = splitNext(next);
    expect(commands[0]?.input).toEqual({ _tag: 'Removed' });
  });
});

describe('child() with a lazy source', () => {
  type TreeOut = { readonly _tag: 'Removed' };
  type TreeMsg =
    | { readonly _tag: 'Add' }
    | { readonly _tag: 'Remove' }
    | { readonly _tag: 'Child'; readonly id: string };
  interface TreeProps {
    readonly nodeId: string;
  }

  // A recursive component: it renders itself and parses its own outputs.
  const Tree: GyralElementClass<{ readonly kids: readonly string[] }, TreeMsg, TreeProps, TreeOut> =
    define<{ readonly kids: readonly string[] }, TreeMsg, TreeProps, TreeOut>('test-tree', {
      props: { nodeId: { type: String } },
      init: () => ({ kids: [] }),
      intent: {
        Add: () => ({ _tag: 'Add' }),
        Remove: () => ({ _tag: 'Remove' }),
        Child: child(
          () => Tree,
          (_out, el) => ({ _tag: 'Child', id: el.nodeId }),
        ),
      },
      update: {
        Add: (s, _m, { props }) => ({
          kids: [...s.kids, `${props.nodeId}.${String(s.kids.length)}`],
        }),
        Remove: (s) => [s, [emit({ _tag: 'Removed' })]],
        Child: (s, m) => ({ kids: s.kids.filter((k) => k !== m.id) }),
      },
      view: (s, i) => html`
        <button class="add" data-intent=${i.Add}>add</button>
        <button class="rm" data-intent=${i.Remove}>remove</button>
        ${repeat(
          s.kids,
          (k) => k,
          (k) => html`<test-tree .nodeId=${k} data-intent=${i.Child}></test-tree>`,
        )}
      `,
    });

  it('lets a component parse outputs from children of its own class', async () => {
    const root = new Tree();
    root.nodeId = 'r';
    document.body.append(root);
    await root.updateComplete;
    root.shadowRoot?.querySelector<HTMLButtonElement>('.add')?.click();
    root.shadowRoot?.querySelector<HTMLButtonElement>('.add')?.click();
    await root.updateComplete;
    expect(root.state.kids).toEqual(['r.0', 'r.1']);
    const first = root.shadowRoot?.querySelector('test-tree');
    if (!(first instanceof Tree)) throw new Error('no child tree');
    await first.updateComplete;
    first.shadowRoot?.querySelector<HTMLButtonElement>('.rm')?.click();
    await settle();
    expect(root.state.kids).toEqual(['r.1']);
  });
});
