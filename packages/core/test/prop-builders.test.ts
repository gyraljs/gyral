// Prop builders (docs/design-docs/view/05-element.md "Props", "When props are validated",
// "Accessors and upgrade capture").
import * as v from 'valibot';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { define, html, prop, settled, type PropsOf, type Stateless } from '../src/index.js';

const Filters = v.object({ tags: v.array(v.string()) });

const props = {
  label: prop.string({ required: true }),
  minPrice: prop.number({ default: 0 }),
  open: prop.boolean(),
  sort: prop.string({ schema: v.picklist(['price', 'name']), default: 'price' }),
  filters: prop.json(Filters),
  items: prop.value(v.array(v.number()), { default: [] }),
  note: prop.string({ attribute: 'data-note' }),
};

type Props = PropsOf<typeof props>;

const Shop = define<Stateless, never, Props>('test-prop-shop', {
  props,
  intent: {},
  update: {},
  view: (_s, _i, { props: p }) =>
    html`<p>
      ${p.label}|${p.minPrice}|${String(p.open)}|${p.sort}|${p.filters?.tags.join('+') ?? '-'}|${p.items.join(',')}|${p.note ?? '-'}
    </p>`,
});

const text = (el: Element) => el.shadowRoot?.querySelector('p')?.textContent.trim();

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('prop builders', () => {
  it('infer prop types from the schemas (types)', () => {
    expectTypeOf<Props['label']>().toEqualTypeOf<string>();
    expectTypeOf<Props['minPrice']>().toEqualTypeOf<number>();
    expectTypeOf<Props['open']>().toEqualTypeOf<boolean>();
    expectTypeOf<Props['sort']>().toEqualTypeOf<'price' | 'name'>();
    expectTypeOf<Props['filters']>().toEqualTypeOf<{ tags: string[] } | undefined>();
    expectTypeOf<Props['items']>().toEqualTypeOf<number[]>();
    expectTypeOf<Props['note']>().toEqualTypeOf<string | undefined>();
  });

  it('infers P from the builders when define() gets no type arguments (types)', () => {
    const Inferred = define('test-prop-inferred', {
      props: { count: prop.number({ default: 1 }), title2: prop.string() },
      intent: {},
      update: {},
      view: (_s, _i, { props: p }) => {
        expectTypeOf(p.count).toEqualTypeOf<number>();
        expectTypeOf(p.title2).toEqualTypeOf<string | undefined>();
        return html`<p>${p.count}</p>`;
      },
    });
    expectTypeOf(new Inferred().count).toEqualTypeOf<number>();
  });

  it('observes kebab-case attributes plus defer-hydration, and none for property-only props', () => {
    const observed = (Shop as unknown as { observedAttributes: string[] }).observedAttributes;
    expect(observed.sort()).toEqual(
      ['data-note', 'defer-hydration', 'filters', 'label', 'min-price', 'open', 'sort'].sort(),
    );
  });

  it('parses attributes per builder and applies defaults', async () => {
    const el = new Shop();
    el.setAttribute('label', 'Hats');
    el.setAttribute('min-price', '12.5');
    el.setAttribute('open', '');
    el.setAttribute('filters', '{"tags":["a","b"]}');
    el.setAttribute('data-note', 'n');
    document.body.append(el);
    await settled();
    expect(text(el)).toBe('Hats|12.5|true|price|a+b||n');
    el.removeAttribute('open');
    el.setAttribute('sort', 'name');
    await settled();
    expect(text(el)).toBe('Hats|12.5|false|name|a+b||n');
    expect(el.hasAttribute('items')).toBe(false); // no reflection
  });

  it('always validates attributes: an invalid one is logged and treated as missing', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const el = new Shop();
    el.setAttribute('label', 'x');
    el.setAttribute('min-price', 'cheap');
    el.setAttribute('sort', 'random');
    el.setAttribute('filters', '{not json');
    document.body.append(el);
    await settled();
    expect(text(el)).toBe('x|0|false|price|-||-');
    expect(errors).toHaveBeenCalledTimes(3);
    expect(String(errors.mock.calls[0]?.[0])).toContain('<test-prop-shop> prop "minPrice"');
  });

  it('validates property sets in development, keeping the input', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const el = new Shop();
    el.label = 'y';
    el.items = [1, 2];
    document.body.append(el);
    await settled();
    expect(text(el)).toContain('|1,2|');
    (el as unknown as { items: unknown }).items = ['nope'];
    await settled();
    expect(errors).toHaveBeenCalledOnce();
    expect(text(el)).toContain('||'); // treated as missing: the default []
  });

  it('warns in development when a schema transforms a property value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const Trimmed = define('test-prop-trim', {
      props: { name: prop.string({ schema: v.pipe(v.string(), v.trim()) }) },
      intent: {},
      update: {},
      view: () => html`<p></p>`,
    });
    const el = new Trimmed();
    el.name = ' padded ';
    expect(el.name).toBe(' padded ');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('transformed'));
  });

  it('rejects asynchronous schemas', () => {
    const Async = define('test-prop-async', {
      props: { code: prop.string({ schema: v.pipeAsync(v.string()) }) },
      intent: {},
      update: {},
      view: () => html`<p></p>`,
    });
    const el = new Async();
    // A property set validates in development; an attribute's error would be reported instead.
    expect(() => {
      el.code = 'a';
    }).toThrow(/asynchronous schema/);
  });

  it('captures properties set before the element was defined (upgrade capture)', async () => {
    const el = document.createElement('test-prop-late') as HTMLElement & { label?: string };
    el.label = 'early';
    document.body.append(el);
    const Late = define('test-prop-late', {
      props: { label: prop.string({ default: '?' }) },
      intent: {},
      update: {},
      view: (_s, _i, { props: p }) => html`<p>${p.label}</p>`,
    });
    await settled();
    expect(el).toBeInstanceOf(Late);
    expect(Object.hasOwn(el, 'label')).toBe(false);
    expect(text(el)).toBe('early');
  });
});
