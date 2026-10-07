// view/07-hydration.md "The parallel walk": hydrating server output keeps every server node,
// splits merged text at known lengths, creates the Text node of an `''` value, walks nested
// templates, lists, arrays and raw(), writes no attribute, keeps form state the user changed
// before scripts ran, and runs element hooks' client halves once. Runs against development
// and production builds of core (the browser and browser-prod projects).
import { afterEach, describe, expect, it } from 'vitest';
import {
  defineHook,
  each,
  html,
  hydrate,
  raw,
  render,
  type ChildValue,
} from '../../src/view/index.js';
import { canon, cleanup, container, nodesOf, serverDom } from './hydrate-helpers.js';
import { watch } from './render-helpers.js';

afterEach(cleanup);

/** Client-renders `value` into a fresh container: the reference DOM. */
function client(value: ChildValue): HTMLDivElement {
  const el = container();
  render(value, el);
  return el;
}

/** Server DOM for `value`, hydrated with it; returns the container and its nodes before. */
function hydrated(value: ChildValue, dev?: boolean): { root: HTMLDivElement; before: Node[] } {
  const root = serverDom(value, dev);
  const before = nodesOf(root);
  hydrate(value, root);
  return { root, before };
}

const elements = (nodes: readonly Node[]): Node[] => nodes.filter((n) => n.nodeType !== 3);

describe('the parallel walk', () => {
  const greet = (name: string, n: number) => html`<p class="g">Hi ${name}! You have ${n} new</p>`;

  it('keeps every server node and gives the DOM a client render has, text boundaries too', () => {
    for (const dev of [true, false]) {
      const { root, before } = hydrated(greet('Bob', 3), dev);
      expect(elements(nodesOf(root))).toEqual(elements(before));
      expect(canon(root)).toBe(canon(client(greet('Bob', 3))));
      render(greet('Al', 12), root);
      expect(canon(root)).toBe(canon(client(greet('Al', 12))));
      expect(elements(nodesOf(root))).toEqual(elements(before));
    }
  });

  it("creates the Text node of an '' value, so a later value shows (gyral-4k7.12)", () => {
    const view = (s: string) =>
      html`<p>${s}</p>
        <p>Note: ${s}!</p>`;
    const { root } = hydrated(view(''));
    expect(canon(root)).toBe(canon(client(view(''))));
    render(view('Hello'), root);
    expect(root.textContent).toBe('HelloNote: Hello!');
    render(view(''), root);
    expect(canon(root)).toBe(canon(client(view(''))));
  });

  it('walks nested templates, keyed rows (no markers) and arrays, and keeps row nodes', () => {
    type Row = { readonly id: number; readonly label: string };
    const row = (r: Row) => html`<li data-id=${r.id}>${r.label}</li>`;
    const view = (rows: readonly Row[], tags: readonly string[]) =>
      html`<section>
        ${html`<h2>${rows.length} rows</h2>`}
        <ul>
          ${each(rows, (r) => r.id, row)}
        </ul>
        <p>${tags}</p>
      </section>`;
    const rows = [1, 2, 3].map((id) => ({ id, label: `r${String(id)}` }));
    const { root } = hydrated(view(rows, ['a', 'b', 'c']));
    const lis = [...root.querySelectorAll('li')];
    expect(lis).toHaveLength(3);
    render(view([rows[2], rows[0], rows[1]] as Row[], ['a', 'b', 'c']), root);
    expect([...root.querySelectorAll('li')]).toEqual([lis[2], lis[0], lis[1]]);
    render(view(rows.slice(1), ['x']), root);
    expect(canon(root)).toBe(canon(client(view(rows.slice(1), ['x']))));
  });

  it('splits text merged across rows and array items (production output has no markers)', () => {
    const view = (xs: readonly string[]) =>
      html`<p>
        ${each(
          xs,
          (x) => x,
          (x) => html`${x}`,
        )}|${xs}
      </p>`;
    const { root } = hydrated(view(['ab', 'c', 'de']), false);
    expect(canon(root)).toBe(canon(client(view(['ab', 'c', 'de']))));
    render(view(['de', 'ab']), root);
    expect(canon(root)).toBe(canon(client(view(['de', 'ab']))));
  });

  it('adopts raw() markup from its start anchor and replaces it when it changes', () => {
    const view = (markup: string, tail: string) => html`<div>${raw(markup)}${tail}</div>`;
    const { root } = hydrated(view('<b>bold</b> and <i>it</i>', 'x'));
    const b = root.querySelector('b');
    render(view('<b>bold</b> and <i>it</i>', 'y'), root);
    expect(root.querySelector('b')).toBe(b);
    render(view('<u>new</u>', 'y'), root);
    expect(canon(root)).toBe(canon(client(view('<u>new</u>', 'y'))));
  });

  it('writes no attribute: bound values are taken as committed', () => {
    const view = (a: string, on: boolean) =>
      html`<div class=${a} title="t ${a} z" ?hidden=${on}>x</div>`;
    const root = serverDom(view('k', true));
    const mutations = watch(root);
    hydrate(view('k', true), root);
    render(view('k', true), root);
    expect(mutations.take().filter((m) => m.type === 'attributes')).toEqual([]);
    render(view('j', false), root);
    expect(canon(root)).toBe(canon(client(view('j', false))));
  });

  it('removes development markers and accepts production output without them', () => {
    const dev = serverDom(greet('a', 1), true);
    expect(dev.innerHTML).toContain('<!--gyral:');
    hydrate(greet('a', 1), dev);
    expect(dev.innerHTML).not.toContain('<!--gyral:');
    const prod = serverDom(greet('a', 1), false);
    expect(() => {
      hydrate(greet('a', 1), prod);
    }).not.toThrow();
  });

  it('keeps <pre> whitespace and a leading newline in values', () => {
    const view = (s: string) =>
      html`<pre>${s}</pre>
        <pre>  keep   this</pre>`;
    const { root } = hydrated(view('\n  two\n'));
    expect(canon(root)).toBe(canon(client(view('\n  two\n'))));
  });
});

describe('form state is never overwritten by hydration (07 "Form state")', () => {
  const form = (s: { name: string; on: boolean; pick: boolean; note: string; open: boolean }) =>
    html`<form>
      <input name="n" value=${s.name} /><input type="checkbox" ?checked=${s.on} />
      <select>
        <option>a</option>
        <option ?selected=${s.pick}>b</option>
      </select>
      <textarea>${s.note}</textarea>
      <details ?open=${s.open}><summary>s</summary></details>
    </form>`;
  const model = { name: 'srv', on: false, pick: false, note: 'srv note', open: false };

  it('keeps edits made before scripts ran until the model changes', () => {
    const root = serverDom(form(model));
    const input = root.querySelector('input') as HTMLInputElement;
    const box = root.querySelector('input[type=checkbox]') as HTMLInputElement;
    const option = root.querySelectorAll('option')[1] as HTMLOptionElement;
    const area = root.querySelector('textarea') as HTMLTextAreaElement;
    const details = root.querySelector('details') as HTMLDetailsElement;
    // The user, before the component's script loads:
    input.value = 'typed';
    box.checked = true;
    option.selected = true;
    area.value = 'edited';
    details.open = true;
    hydrate(form(model), root);
    render(form(model), root); // a re-render with an unchanged model
    expect([input.value, box.checked, option.selected, area.value, details.open]).toEqual([
      'typed',
      true,
      true,
      'edited',
      true,
    ]);
    render(form({ name: 'm', on: false, pick: false, note: 'n', open: false }), root);
    // Only the values whose model changed are written; the model wins for those.
    expect([input.value, box.checked, option.selected, area.value, details.open]).toEqual([
      'm',
      true,
      true,
      'n',
      true,
    ]);
    render(form({ name: 'm', on: true, pick: true, note: 'n', open: true }), root);
    render(form({ name: 'm', on: false, pick: false, note: 'n', open: false }), root);
    expect([box.checked, option.selected, details.open]).toEqual([false, false, false]);
  });

  it('sets ?indeterminate, which no attribute carries', () => {
    const view = (on: boolean) => html`<input type="checkbox" ?indeterminate=${on} />`;
    const { root } = hydrated(view(true));
    expect((root.querySelector('input') as HTMLInputElement).indeterminate).toBe(true);
  });
});

describe('element hooks during hydration (02 "Element hooks")', () => {
  it("runs each hook's client half once, with the hydrated arguments", () => {
    const calls: unknown[][] = [];
    const mark = defineHook<[string]>({
      server: ([v]) => ({ 'data-mark': v }),
      client: (el, [v], prev) => calls.push([el.localName, v, prev]),
    });
    const view = (v: string) => html`<b ${mark(v)}>x</b>`;
    const { root } = hydrated(view('a'));
    expect(calls).toEqual([['b', 'a', undefined]]);
    render(view('a'), root);
    expect(calls).toHaveLength(1);
    render(view('b'), root);
    expect(calls[1]).toEqual(['b', 'b', ['a']]);
  });
});
