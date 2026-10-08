// When a new prop value counts as unchanged (gyral-dyn.27, view/05-element.md "Prop
// equality"): `prop.json` compares the JSON, `prop.value` uses `Object.is` or its `equals`.
// A parent that builds a fresh object every render no longer sends PropsChanged every time.
import { afterEach, describe, expect, it } from 'vitest';
import { define, html, prop, settled, type PropsOf } from '../src/index.js';

interface Range {
  readonly min: number;
  readonly max: number;
}
interface Sort {
  readonly key: string;
  readonly dir: 1 | -1;
}
const isSort = (u: unknown): u is Sort => typeof u === 'object' && u !== null && 'key' in u;
const isRange = (u: unknown): u is Range =>
  typeof u === 'object' && u !== null && 'min' in u && 'max' in u;

const props = {
  range: prop.json(isRange),
  columns: prop.value((u: unknown): u is readonly string[] => Array.isArray(u)),
  sort: prop.value(isSort, {
    equals: (a, b) => a?.key === b?.key && a?.dir === b?.dir,
  }),
};
type Props = PropsOf<typeof props>;

let changes: string[] = [];

const Table = define<object, never, Props>('test-prop-equals', {
  props,
  init: () => ({}),
  intent: {},
  update: {
    PropsChanged: (s, m) => {
      changes.push(
        (Object.keys(props) as (keyof Props)[]).filter((k) => m.props[k] !== m.prev[k]).join(),
      );
      return s;
    },
  },
  view: (_s, _i, { props: p }) =>
    html`<p>${p.range?.min}-${p.range?.max} ${p.columns?.join()} ${p.sort?.key}</p>`,
});

type TableElement = HTMLElement & { -readonly [K in keyof Props]?: Props[K] };

async function mount(): Promise<TableElement> {
  const el = new Table() as unknown as TableElement;
  el.range = { min: 0, max: 10 };
  el.columns = ['name'];
  el.sort = { key: 'name', dir: 1 };
  document.body.append(el);
  await settled();
  changes = [];
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('prop equality', () => {
  it('prop.json: a new object with the same JSON changes nothing', async () => {
    const el = await mount();
    el.range = { min: 0, max: 10 };
    await settled();
    expect(changes).toEqual([]);
    el.range = { min: 0, max: 20 };
    await settled();
    expect(changes).toEqual(['range']);
    expect(el.shadowRoot?.textContent).toContain('0-20');
  });

  it('prop.json: an equal attribute value parsed again changes nothing', async () => {
    const el = await mount();
    el.setAttribute('range', '{"min":1,"max":2}');
    await settled();
    expect(changes).toEqual(['range']);
    el.setAttribute('range', '{ "min": 1, "max": 2 }');
    await settled();
    expect(changes).toEqual(['range']);
  });

  it('prop.value: Object.is by default, so a new array is a change', async () => {
    const el = await mount();
    el.columns = ['name'];
    await settled();
    expect(changes).toEqual(['columns']);
  });

  it('prop.value with equals: the option decides, and sees undefined when unset', async () => {
    const el = await mount();
    el.sort = { key: 'name', dir: 1 };
    await settled();
    expect(changes).toEqual([]);
    el.sort = { key: 'name', dir: -1 };
    await settled();
    expect(changes).toEqual(['sort']);
    el.sort = undefined;
    await settled();
    expect(changes).toEqual(['sort', 'sort']);
  });
});
