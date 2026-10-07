// fast-check generators for "server equals client" (view/README.md "Conformance", property 1):
// template results nesting templates, keyed lists, arrays, attributes (single, multi, boolean,
// with null/nothing), text with special characters, raw(), live form state, tables, and Gyral
// components in shadow and light mode with property-hole props and slotted children.
import fc from 'fast-check';
import { each, html, nothing, raw, type ChildValue } from '../../src/view/index.js';

type Attr = string | number | boolean | null | undefined | typeof nothing;

const TEXTS = ['', 'a', 'x & y', '<b>&amp;</b>', `"q' > <`, ' ', 'é ✓', '0'];
const ATTRS: readonly Attr[] = [null, undefined, nothing, '', 'x', `"<&>'`, true, false, 0, 7];
const RAWS = ['', '<b>bold</b>', 'text &amp; more', '<i>a</i><!-- c --><u>b</u>'];

const text = fc.constantFrom(...TEXTS);
const attr = fc.constantFrom(...ATTRS);
const flag = fc.boolean();

const leaf: fc.Arbitrary<ChildValue> = fc.oneof(
  text,
  fc.constantFrom<ChildValue>(null, undefined, false, nothing, 42),
);

interface Row {
  readonly k: number;
  readonly v: ChildValue;
}

const T = {
  // <div>, not <p>: the parser closes a <p> at a nested block element (a template rule-7
  // repair the normalizer can only see within one template).
  para: (a: Attr, v: ChildValue) => html`<div class=${a}>${v}</div>`,
  multi: (a: Attr, b: Attr, v: ChildValue) => html`<span title="t ${a} ${b}">${v}<i></i></span>`,
  pair: (a: ChildValue, b: ChildValue) => html`${a} and ${b}`,
  flag: (on: boolean, v: ChildValue) => html`<div ?hidden=${on}>x${v}y</div>`,
  raw: (markup: string, v: ChildValue) => html`<div>${raw(markup)}${v}</div>`,
  form: (value: string, on: readonly boolean[], note: string) =>
    html`<form>
      <input value=${value} /><input type="checkbox" ?checked=${on[0]} /><select multiple>
        <option ?selected=${on[1]}>a</option>
        <option ?selected=${on[2]}>b</option></select
      ><textarea>${note}</textarea>
      <details ?open=${on[3]}><summary>s</summary></details>
    </form>`,
  table: (rows: readonly Row[]) =>
    html`<table>
      <tbody>
        ${each(
          rows,
          (r) => r.k,
          (r) =>
            html`<tr>
              <td>${r.k}</td>
              <td>${r.v}</td>
            </tr>`,
        )}
      </tbody>
    </table>`,
  list: (rows: readonly Row[]) =>
    html`<ul>
      ${each(
        rows,
        (r) => r.k,
        (r) => html`<li data-k=${r.k}>${r.v}</li>`,
      )}
    </ul>`,
  shadow: (label: Attr, items: readonly string[], v: ChildValue) =>
    html`<cf-shadow label=${label} .items=${items}>${v}</cf-shadow>`,
  light: (n: number) => html`<cf-light n=${n}></cf-light>`,
};

const rows = (child: fc.Arbitrary<ChildValue>): fc.Arbitrary<Row[]> =>
  fc.uniqueArray(fc.record({ k: fc.nat(20), v: child }), {
    selector: (r) => r.k,
    maxLength: 4,
  });

/** A generated template result (or a plain child value at the leaves). */
export const view: fc.Arbitrary<ChildValue> = fc.letrec<{ v: ChildValue }>((tie) => {
  const child = tie('v');
  return {
    v: fc.oneof(
      { depthSize: 'small', withCrossShrink: true },
      leaf,
      fc.tuple(attr, child).map(([a, v]) => T.para(a, v)),
      fc.tuple(attr, attr, child).map(([a, b, v]) => T.multi(a, b, v)),
      fc.tuple(child, child).map(([a, b]) => T.pair(a, b)),
      fc.tuple(flag, child).map(([on, v]) => T.flag(on, v)),
      fc.tuple(fc.constantFrom(...RAWS), child).map(([m, v]) => T.raw(m, v)),
      fc
        .tuple(text, fc.array(flag, { minLength: 4, maxLength: 4 }), text)
        .map(([value, on, note]) => T.form(value, on, note)),
      rows(child).map(T.table),
      rows(child).map(T.list),
      fc.array(child, { maxLength: 3 }),
      fc
        .tuple(attr, fc.array(text, { maxLength: 3 }), child)
        .map(([a, items, v]) => T.shadow(a, items, v)),
      fc.nat(3).map(T.light),
    ),
  };
}).v;
