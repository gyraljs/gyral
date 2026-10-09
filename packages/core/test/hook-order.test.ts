// Element hooks run after every dirty host in the flush has rendered, children first
// (view/02-bindings.md "Commit order", gyral-1zd.27), so a parent's hook can measure the child
// components it renders; `update: 'always'` re-runs a hook on every render of its host.
import { afterEach, describe, expect, it } from 'vitest';
import { define, defineHook, html, prop, settled } from '../src/index.js';

const order: string[] = [];
const seen: number[] = [];

const mark = defineHook<[name: string]>({
  update: 'always',
  client: (_el, [name]) => {
    order.push(name);
  },
});

// Counts the <li> a child component rendered in its shadow root.
const measure = defineHook<[n: number]>({
  client: (el) => {
    const child = el.querySelector('test-ho-child') ?? el;
    seen.push(child.shadowRoot?.querySelectorAll('li').length ?? -1);
  },
});

const isStrings = (u: unknown): u is readonly string[] =>
  Array.isArray(u) && u.every((x) => typeof x === 'string');

const Child = define<null, never, { readonly items: readonly string[] }>()('test-ho-child', {
  props: { items: prop.json(isStrings, { default: [] }) },
  init: () => null,
  view: (_s, _i, { props }) =>
    html`<ul ${mark('child')}>
      ${props.items.map((item) => html`<li>${item}</li>`)}
    </ul>`,
});

interface State {
  readonly items: readonly string[];
}
type Msg = { readonly _tag: 'Add' };

const Parent = define<State, Msg>()('test-ho-parent', {
  init: () => ({ items: ['a', 'b'] }),
  update: { Add: (s) => ({ items: [...s.items, String(s.items.length)] }) },
  view: (s) =>
    html`<section ${measure(s.items.length)}>
      <div ${mark('parent')}><test-ho-child .items=${s.items}></test-ho-child></div>
    </section>`,
});

type ParentElement = InstanceType<typeof Parent> & { send(msg: Msg): void };

let host: ParentElement | undefined;
afterEach(() => {
  host?.remove();
  order.length = 0;
  seen.length = 0;
});

describe('element hook order', () => {
  it("runs a parent's hook after its child components rendered", async () => {
    expect(customElements.get('test-ho-child')).toBe(Child);
    host = new Parent();
    document.body.append(host);
    await settled();
    expect(seen).toEqual([2]);
    host.send({ _tag: 'Add' });
    await settled();
    const child = host.shadowRoot?.querySelector('test-ho-child');
    expect(child?.shadowRoot?.querySelectorAll('li').length).toBe(3);
    expect(seen).toEqual([2, 3]);
  });

  it("runs the child's hooks before the parent's", async () => {
    host = new Parent();
    document.body.append(host);
    await settled();
    expect(order).toEqual(['child', 'parent']);
  });

  it("re-runs a hook with update: 'always' on every render, even with the same arguments", async () => {
    host = new Parent();
    document.body.append(host);
    await settled();
    order.length = 0;
    host.send({ _tag: 'Add' });
    await settled();
    host.send({ _tag: 'Add' });
    await settled();
    // Both hosts re-render each time; `mark` keeps the same argument but runs every time.
    expect(order).toEqual(['child', 'parent', 'child', 'parent']);
    expect(seen).toEqual([2, 3, 4]); // `measure` (default update) only when its argument changed
  });
});
