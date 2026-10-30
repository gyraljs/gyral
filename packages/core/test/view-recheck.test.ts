// Development's recheck of a skipped view (G0017, gyral-337.1, gyral-nyy): the view is re-run
// with the same state, props and stores and compared with what is committed by value, never by
// identity. A pure view that builds its values anew each render (each() over rebuilt items,
// keyed(), a fresh object or array in a property binding or a hook's arguments) says nothing;
// a view that reads Date.now(), a module variable or the DOM still warns. The cases come from
// apps migrated to 0.3.8 (shop, greed, sabacc, starwars.run).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, each, html, invalid, keyed, prop, settled } from '../src/index.js';

type Same = { readonly _tag: 'Same' };
interface Host extends HTMLElement {
  send(msg: Same): void;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** A component whose only message keeps its state, so every render after the first is skipped. */
function component<S>(tag: string, init: S, view: (s: S) => unknown, shadow = true) {
  return define<S, Same>()(tag, {
    ...(shadow ? {} : { shadow: false as const }),
    init: () => init,
    update: { Same: (s) => s },
    view: (s) => html`${view(s)}`,
  });
}

/**
 * G0017's warnings for a host of `C`: mounted, then three messages that keep its state, each
 * flushed, with `between` run before each.
 */
async function g0017(C: CustomElementConstructor, between = (): void => undefined) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const el = new C() as Host;
  document.body.append(el);
  await settled();
  for (let k = 0; k < 3; k++) {
    between();
    el.send({ _tag: 'Same' });
    await settled();
  }
  return warn.mock.calls
    .map((call) => String(call[0]))
    .filter((t) => t.includes('rendered differently'));
}

// The child the parent below passes a fresh array to.
define<object, never, { readonly items: readonly number[] }>()('recheck-child', {
  props: { items: prop.value((u): u is readonly number[] => Array.isArray(u), { default: [] }) },
  init: () => ({}),
  view: (_s, _i, { props }) => html`<p>${props.items.join(',')}</p>`,
});

describe('a pure view that builds its values each render says nothing', () => {
  it('each() over items rebuilt in the view', async () => {
    const C = component('recheck-each', { items: ['a', 'b'] }, (s) => [
      html`<ul>
        ${each(
          s.items.map((label, n) => ({ label, n })),
          (o) => o.label,
          (o) => html`<li>${o.n} ${o.label}</li>`,
        )}
      </ul>`,
    ]);
    expect(await g0017(C)).toEqual([]);
  });

  it('keyed() with a fresh template', async () => {
    const C = component('recheck-keyed', { n: 1 }, (s) => keyed(s.n, html`<b>${s.n}</b>`));
    expect(await g0017(C)).toEqual([]);
  });

  it('a fresh object in a property binding', async () => {
    const C = component('recheck-object', { n: 1 }, (s) => html`<span .data=${{ n: s.n }}></span>`);
    expect(await g0017(C)).toEqual([]);
    const light = component(
      'recheck-object-light',
      { n: 1 },
      (s) => html`<span .data=${{ n: s.n }}></span>`,
      false,
    );
    expect(await g0017(light)).toEqual([]);
  });

  it('a fresh array in a property binding, of an element or a Gyral component', async () => {
    const C = component(
      'recheck-array',
      { items: [1, 2, 3] },
      (s) => html`<button type="button" .items=${s.items.slice()}>same</button>`,
    );
    expect(await g0017(C)).toEqual([]);
    const Parent = component(
      'recheck-array-parent',
      { n: 1 },
      (s) => html`<recheck-child .items=${[s.n, s.n + 1]}></recheck-child>`,
    );
    expect(await g0017(Parent)).toEqual([]);
  });

  it('nested plain data in a property binding', async () => {
    const C = component(
      'recheck-nested',
      { rows: [{ id: 1, tags: ['x'] }] },
      (s) =>
        html`<span .config=${{ rows: s.rows.map((r) => ({ ...r })), at: [1, [2, 3]] }}></span>`,
    );
    expect(await g0017(C)).toEqual([]);
  });

  it("a fresh array in an element hook's arguments", async () => {
    const C = component(
      'recheck-hook',
      { errors: ['Required'] },
      (s) => html`<input name="a" ${invalid([...s.errors])} />`,
    );
    expect(await g0017(C)).toEqual([]);
  });
});

describe('a view that reads something else still warns', () => {
  it('Date.now()', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 1000));
    const C = component('recheck-date-now', {}, () => html`<p>${Date.now()}</p>`);
    expect(await g0017(C)).toHaveLength(1);
  });

  it('a module variable', async () => {
    const outside = { n: 0 };
    const C = component('recheck-module', {}, () => html`<p>${outside.n}</p>`);
    expect(
      await g0017(C, () => {
        outside.n += 1;
      }),
    ).toHaveLength(1);
  });

  it('the DOM', async () => {
    const C = component('recheck-dom', {}, () => html`<p>${document.body.dataset['theme']}</p>`);
    let k = 0;
    expect(
      await g0017(C, () => {
        document.body.dataset['theme'] = String((k += 1));
      }),
    ).toHaveLength(1);
    delete document.body.dataset['theme'];
  });

  it('a module variable in the rows of rebuilt items', async () => {
    const outside = { n: 0 };
    const C = component('recheck-each-impure', { items: ['a'] }, (s) =>
      each(
        s.items.map((label) => ({ label })),
        (o) => o.label,
        // eslint-disable-next-line gyral/each-row-purity -- an impure row on purpose: G0017 must catch it
        (o) => html`<i>${o.label}${outside.n}</i>`,
      ),
    );
    expect(
      await g0017(C, () => {
        outside.n += 1;
      }),
    ).toHaveLength(1);
  });

  it('a value in a property binding that is not plain data, built each render', async () => {
    const C = component(
      'recheck-date',
      { t: 0 },
      (s) => html`<time .date=${new Date(s.t)}></time>`,
    );
    expect(await g0017(C)).toHaveLength(1);
  });
});
