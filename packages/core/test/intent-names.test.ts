// Intent names are the keys of `intent` (ADR 0023): `define<S, M>()(tag, spec)` infers them, the
// view's `i` and `intentsOf<typeof C>()` offer exactly those names, a key that is a message tag
// must return that variant, and any other key may return any message and needs no reducer. The
// type checks run under `pnpm typecheck` (tsc covers tests); the document table runs in Chromium.
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  define,
  each,
  html,
  intentsOf,
  prop,
  settled,
  type IntentInput,
  type IntentNames,
  type TemplateResult,
} from '../src/index.js';

// ---- Type tests -------------------------------------------------------------------------

type Request = { readonly _tag: 'Request'; readonly action: string; readonly id?: number };
type Answered = { readonly _tag: 'Answered'; readonly ok: boolean };
type TMsg = Request | Answered;

describe('inferred intent names', () => {
  it('type-checks parsers, reducers, the view and props in ctx', () => {
    const C = define<{ readonly n: number }, TMsg, { readonly folder: string }>()(
      'test-names-types',
      {
        props: { folder: prop.string({ default: 'inbox' }) },
        init: () => ({ n: 0 }),
        intent: {
          // A key that isn't a tag may return any message; input and ctx keep their types.
          Archive: (input, { props }) => {
            expectTypeOf(input).toEqualTypeOf<IntentInput>();
            expectTypeOf(props.folder).toEqualTypeOf<string>();
            return { _tag: 'Request', action: `archive:${props.folder}`, id: Number(input.value) };
          },
          Restore: () => ({ _tag: 'Answered', ok: true }),
          // A tag key still returns its own variant.
          // @ts-expect-error: the Request parser must return a Request
          Request: () => ({ _tag: 'Answered', ok: true }),
        },
        update: {
          Request: (s) => s,
          Answered: (s, m) => ({ n: m.ok ? s.n + 1 : s.n }),
          // No reducer for Archive/Restore: they are never dispatched.
        },
        view: (_s, i) => {
          expectTypeOf(i).toEqualTypeOf<IntentNames<'Archive' | 'Restore' | 'Request'>>();
          return html`
            <button data-intent=${i.Archive}>Archive</button>
            <button data-intent-pointerdown=${i.Restore}>Restore</button>
            <button data-intent=${i.Request}>Request</button>
          `;
        },
      },
    );
    expectTypeOf(new C().state.n).toEqualTypeOf<number>();
    // Rows take the same names from the class.
    const i = intentsOf<typeof C>();
    expectTypeOf(i.Archive).toEqualTypeOf<'Archive'>();
    // @ts-expect-error: 'Archvie' is not an intent name
    expect(i.Archvie).toBe('Archvie'); // the runtime proxy answers; the types refuse
    // @ts-expect-error: Answered is a message tag with no parser, so not an intent name
    expect(i.Answered).toBe('Answered');
  });

  it('refuses a reducer for an intent name and a non-message from a parser', () => {
    define<{ readonly n: number }, TMsg>()('test-names-reducer', {
      init: () => ({ n: 0 }),
      intent: {
        Archive: () => ({ _tag: 'Answered', ok: true }),
        // @ts-expect-error: a parser returns one of the component's messages
        Restore: () => ({ _tag: 'Restored' }),
      },
      update: {
        Request: (s) => s,
        Answered: (s) => s,
        // @ts-expect-error: intent names get no reducer
        Archive: (s: { readonly n: number }) => s,
      },
      view: () => html``,
    });
  });

  it('catches a misspelled key when the view names the intended one', () => {
    define<{ readonly n: number }, TMsg>()('test-names-typo', {
      init: () => ({ n: 0 }),
      intent: { Archvie: () => ({ _tag: 'Answered', ok: true }) },
      update: { Request: (s) => s, Answered: (s) => s },
      // @ts-expect-error: 'Archive' is not an intent name (the key is misspelled)
      view: (_s, i) => html`<button data-intent=${i.Archive}>Archive</button>`,
    });
  });

  it('infers the state, messages and props when define() gets no type arguments', () => {
    const Badge = define()('test-names-inferred', {
      props: { count: prop.number({ default: 1 }) },
      intent: {},
      update: {},
      view: (_s, i, { props }) => {
        expectTypeOf<keyof typeof i>().toEqualTypeOf<never>();
        return html`<b>${props.count}</b>`;
      },
    });
    expectTypeOf(new Badge().count).toEqualTypeOf<number>();
  });
});

// ---- A document table: seven controls, one request message ------------------------------

type Doc = { readonly id: number; readonly title: string; readonly archived: boolean };
type Action =
  | { readonly kind: 'archive'; readonly id: number }
  | { readonly kind: 'restore'; readonly id: number }
  | { readonly kind: 'star'; readonly id: number }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'sort'; readonly by: string }
  | { readonly kind: 'page-size'; readonly size: string }
  | { readonly kind: 'rename'; readonly title: string };

/** One message: every control only sends a request to the server. */
type TableMsg = { readonly _tag: 'Send'; readonly action: Action };

interface Table {
  readonly docs: readonly Doc[];
  readonly sent: readonly Action[];
}

// Rows name intents through a module constant typed by the component. The row's return type
// is written out: the row, the view and DocTable's type would otherwise infer each other.
const ti = intentsOf<typeof DocTable>();

const DocRow = (doc: Doc): TemplateResult =>
  html`<li data-doc=${doc.id}>
    ${doc.title}
    <button type="button" data-intent=${doc.archived ? ti.Restore : ti.Archive}>
      ${doc.archived ? 'Restore' : 'Archive'}
    </button>
    <input type="checkbox" aria-label="Star" data-intent=${ti.Star} />
  </li>`;

const docOf = (target: Element): number =>
  Number(target.closest('[data-doc]')?.getAttribute('data-doc'));
const send = (action: Action): TableMsg => ({ _tag: 'Send', action });

const DocTable = define<Table, TableMsg>()('test-doc-table', {
  init: () => ({
    docs: [
      { id: 1, title: 'Budget', archived: false },
      { id: 2, title: 'Roadmap', archived: true },
    ],
    sent: [],
  }),
  intent: {
    Archive: ({ target }) => send({ kind: 'archive', id: docOf(target) }),
    Restore: ({ target }) => send({ kind: 'restore', id: docOf(target) }),
    Star: ({ target }) => send({ kind: 'star', id: docOf(target) }),
    Duplicate: () => send({ kind: 'duplicate' }),
    SortBy: ({ value }) => send({ kind: 'sort', by: value ?? '' }),
    PageSize: ({ value }) => send({ kind: 'page-size', size: value ?? '' }),
    RenameFolder: ({ formData }) => {
      const title = formData?.get('title');
      return send({ kind: 'rename', title: typeof title === 'string' ? title : '' });
    },
  },
  // One reducer: in an app it returns the request command; here it records the action.
  update: { Send: (s, m) => ({ ...s, sent: [...s.sent, m.action] }) },
  view: (s, i) => html`
    <ul>
      ${each(s.docs, (doc) => doc.id, DocRow)}
    </ul>
    <select data-intent=${i.SortBy}>
      <option value="title">Title</option>
      <option value="updated">Last updated</option>
    </select>
    <select data-intent=${i.PageSize}>
      <option value="25">25</option>
      <option value="100">100</option>
    </select>
    <form data-intent=${i.RenameFolder}>
      <input name="title" value="Reports" /><button>Rename</button>
    </form>
    <button type="button" data-intent=${i.Duplicate}>Duplicate</button>
  `,
});

type TableElement = HTMLElement & { readonly state: Table };

afterEach(() => {
  document.body.replaceChildren();
});

describe('a document table with intent names', () => {
  it('turns seven intents into one Send message', async () => {
    const el = new DocTable() as TableElement;
    document.body.append(el);
    await settled();
    const root = el.shadowRoot as ShadowRoot;
    const click = (sel: string): void => {
      (root.querySelector(sel) as HTMLElement).click();
    };
    const pick = (sel: string, value: string): void => {
      const select = root.querySelector(sel) as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    };
    click('[data-doc="1"] button');
    click('[data-doc="2"] button');
    click('[data-doc="2"] input');
    pick('select[data-intent="SortBy"]', 'updated');
    pick('select[data-intent="PageSize"]', '100');
    (root.querySelector('form') as HTMLFormElement).requestSubmit();
    click('button[data-intent="Duplicate"]');
    await settled();
    expect(el.state.sent).toEqual([
      { kind: 'archive', id: 1 },
      { kind: 'restore', id: 2 },
      { kind: 'star', id: 2 },
      { kind: 'sort', by: 'updated' },
      { kind: 'page-size', size: '100' },
      { kind: 'rename', title: 'Reports' },
      { kind: 'duplicate' },
    ]);
  });
});
